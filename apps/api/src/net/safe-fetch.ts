// One guard for every fetch the server makes to an address a user or a feed chose (SSRF).
/**
 * M25 S7 (audit #10, guard G-M25-S7). Feeds, cover images, claim checks, Apple lookups, timed
 * transcripts and paid-preview bytes all go through `safeFetch`. It wraps a fetch (the real one,
 * or a test's fake) and, for every hop:
 *  - allows only http: and https:;
 *  - resolves the host and refuses private, loopback, link-local (cloud metadata 169.254.169.254),
 *    carrier-grade NAT, multicast, documentation and other reserved ranges, IPv4 and IPv6;
 *  - follows redirects itself (`redirect: 'manual'`), at most 5, checking each new address again;
 *  - gives up after `timeoutMs` (default 15 s), and stops reading the body past `maxBytes`
 *    (default 25 MB; feeds have their own 20 MB cap on top).
 * A host that does not resolve is let through: the fetch itself then fails the same way, and
 * that keeps tests with made-up host names working. Groq, Expo push and the image store's S3 calls
 * are not wrapped — their hosts are fixed in code, never chosen by a user.
 */
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

export class BlockedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedFetchError';
  }
}

/** Every address `safeFetch` never connects to. */
const blocked = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  // No ::ffff:0:0/96 rule: Node's BlockList checks every IPv4 address against IPv6 rules in its
  // mapped form too, so that rule would refuse ALL of IPv4 (seen red in CI, run 37728021749).
  // A mapped IPv6 address is unwrapped and checked as IPv4 instead (isBlockedAddress).
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, bits, 'ipv6');

/** True for an address the server must never fetch from. Anything that is not an IP is refused too. */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '').split('%')[0]!;
  const v = isIP(bare);
  if (v === 4) return blocked.check(bare, 'ipv4');
  if (v === 6) {
    // An IPv4-mapped address (::ffff:127.0.0.1 or ::ffff:7f00:1) is checked as the IPv4 it is.
    const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
    if (dotted) return blocked.check(dotted[1]!, 'ipv4');
    const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(bare);
    if (hex) {
      const hi = parseInt(hex[1]!, 16);
      const lo = parseInt(hex[2]!, 16);
      return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, 'ipv4');
    }
    return blocked.check(bare, 'ipv6');
  }
  return true;
}

/** Host name → its addresses. Throws when the name does not resolve. */
export type ResolveHost = (host: string) => Promise<string[]>;

/** For a fetch a test injected: no DNS at all (made-up names are let through; literal addresses and local names are still refused). */
export const noResolve: ResolveHost = async () => { throw new Error('no lookup'); };

export const dnsResolve: ResolveHost = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Refuses a URL whose scheme is not http(s) or whose host is, or resolves to, a blocked address. */
export async function assertPublicUrl(url: URL, resolve: ResolveHost = dnsResolve): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedFetchError(`refused ${url.protocol} URL`);
  if (url.username || url.password) throw new BlockedFetchError('refused a URL with credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new BlockedFetchError('refused a URL with no host');
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedFetchError(`refused private address ${host}`);
    return;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new BlockedFetchError(`refused local host ${host}`);
  }
  let addrs: string[];
  try { addrs = await resolve(host); } catch { return; /* does not resolve: the fetch fails on its own */ }
  for (const a of addrs) if (isBlockedAddress(a)) throw new BlockedFetchError(`refused ${host}: it resolves to a private address`);
}

export type SafeFetchOptions = { resolve?: ResolveHost; timeoutMs?: number; maxBytes?: number; maxRedirects?: number };

export const SAFE_FETCH_TIMEOUT_MS = 15_000;
export const SAFE_FETCH_MAX_BYTES = 25 * 1024 * 1024;
export const SAFE_FETCH_MAX_REDIRECTS = 5;

/** Ends the body stream with an error once more than `max` bytes have come through. */
function capped(res: Response, max: number): Response {
  const declared = Number(res.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) {
    void res.body?.cancel().catch(() => undefined);
    throw new BlockedFetchError(`response is over ${max} bytes`);
  }
  if (!res.body) return res;
  let seen = 0;
  const body = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      seen += chunk.byteLength;
      if (seen > max) ctl.error(new BlockedFetchError(`response is over ${max} bytes`));
      else ctl.enqueue(chunk);
    },
  }));
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** `inner` with the checks above on every hop. Same signature as fetch, so it drops in anywhere. */
export function safeFetch(inner: typeof fetch, opts: SafeFetchOptions = {}): typeof fetch {
  const resolve = opts.resolve ?? dnsResolve;
  const timeoutMs = opts.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? SAFE_FETCH_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  const guarded = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    let url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let req: RequestInit = { ...(init ?? {}) };
    for (let hop = 0; ; hop++) {
      await assertPublicUrl(url, resolve);
      const res = await inner(url.href, { ...req, redirect: 'manual', signal });
      const location = res.status >= 300 && res.status < 400 ? res.headers?.get?.('location') : null;
      if (location) {
        if (hop >= maxRedirects) throw new BlockedFetchError(`more than ${maxRedirects} redirects`);
        try { await res.body?.cancel(); } catch { /* nothing to drain */ }
        url = new URL(location, url);
        // A 303 (and a 301/302 after a POST) continues as a GET without a body, as fetch does.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && req.method && req.method.toUpperCase() === 'POST')) {
          const rest: RequestInit = { ...req, method: 'GET' };
          delete rest.body;
          req = rest;
        }
        continue;
      }
      // A test double that is not a real Response is passed through as it is.
      return res instanceof Response ? capped(res, maxBytes) : res;
    }
  };
  return guarded as unknown as typeof fetch;
}
