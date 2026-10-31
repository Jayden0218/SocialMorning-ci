// DRAFT, never deployed — the Vercel edge proxy: forwards a request to the Lambda Function URL and signs the real client address.
/**
 * M28 US2 (research R2, tasks T025). After the cutover `socialmorning-api.vercel.app` would forward every request to the
 * Lambda Function URL. A plain `rewrites` entry cannot add request headers, and without them every listener would reach
 * Lambda with Vercel's egress address as `sourceIp` — one shared rate counter for everyone (spec edge case).
 *
 * This function forwards method, path, query, body and headers, adds
 *  - `x-sm-edge`: the shared secret `EDGE_SECRET` (the Lambda entry compares it in constant time), and
 *  - `x-sm-client-ip`: the first entry of Vercel's `x-forwarded-for` (Vercel sets it; docs: vercel.com/docs/headers/request-headers),
 * and streams the answer back. Any `x-sm-*` header the client sent is removed first. With no `EDGE_SECRET` or no origin it
 * answers 500 and forwards nothing (fail closed).
 *
 * DRAFT — NEVER DEPLOYED, and not in any bundle (the Vercel and Lambda builds start from their entry files, which do not import this one). NOT deployed in M28: `EDGE_SECRET` is created only after the quickstart B10 check (headers reach Lambda; Vercel Hobby limits fit),
 * and until then `apps/api/vercel.cutover.json`'s rewrite stays the plan. It is not part of `npm run build`.
 */

export type EdgeProxyDeps = {
  /** The Function URL, e.g. `https://abc123.lambda-url.ap-southeast-1.on.aws`. */
  origin: string;
  secret: string;
  fetch?: typeof fetch;
};

/** Headers that describe one hop, not the message (RFC 9110 §7.6.1) — never forwarded either way. */
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);

export function createEdgeProxy(deps: EdgeProxyDeps): (req: Request) => Promise<Response> {
  const origin = deps.origin.replace(/\/+$/, '');
  const doFetch = deps.fetch ?? fetch;
  return async (req) => {
    if (!deps.secret || !origin) return new Response(JSON.stringify({ error: 'unavailable', message: 'The edge proxy is not configured.' }), { status: 500, headers: { 'content-type': 'application/json' } });
    const url = new URL(req.url);
    const headers = new Headers();
    for (const [k, v] of req.headers) if (!HOP.has(k.toLowerCase()) && !k.toLowerCase().startsWith('x-sm-')) headers.append(k, v);
    const client = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    headers.set('x-sm-edge', deps.secret);
    if (client) headers.set('x-sm-client-ip', client.slice(0, 64));
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body !== null;
    const answer = await doFetch(`${origin}${url.pathname}${url.search}`, {
      method: req.method, headers, redirect: 'manual',
      ...(hasBody ? { body: req.body, duplex: 'half' } : {}),
    } as RequestInit);
    // fetch has already decoded a compressed body: the length and encoding no longer describe it.
    const out = new Headers();
    for (const [k, v] of answer.headers) if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'content-encoding') out.append(k, v);
    const setCookie = answer.headers.getSetCookie();
    if (setCookie.length) { out.delete('set-cookie'); for (const c of setCookie) out.append('set-cookie', c); }
    return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers: out });
  };
}

const proxy = createEdgeProxy({ origin: process.env['FUNCTION_URL'] ?? '', secret: process.env['EDGE_SECRET'] ?? '' });
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
