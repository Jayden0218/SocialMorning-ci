// Asks two local API servers (old and new) the same GET routes as the same listeners and reports every difference; ids and counts only.
/**
 * M28 US1 (contracts/compare-cli.md, research R1). OLD = the `main` build on Postgres (`compare-server-old.ts`), NEW = this
 * branch on DynamoDB (`compare-server.ts`); both are started by the person running the cutover, on localhost.
 *
 *   cd apps/api && npx tsx scripts/compare.ts --old http://localhost:4101 --new http://localhost:4102 (--listeners a,b | --sample 20) [--email-env DIFF_EMAIL]
 *
 * Each listener gets a session on each side from its `/_compare/session` route (in memory only, ended in a `finally`). `:me` = the
 * listener; `:ep` = their most-commented episode, chosen on the OLD side. Every route in `compare-routes.json` is asked of both;
 * status then body must be equal after the fields of `compare-ignore.json` are removed and keys are sorted. A differing route is
 * asked once more after 2 s (data moving during the comparison); only a difference that persists counts. Lists that differ only
 * in order are reported as `order`, not `different`.
 *
 * Output: one line per difference `DIFF <route> listener=<id> path=<json.path> kind=<status|missing|extra|value|order>`, with
 * ` old=… new=…` only for ids and counts (`id`, `…Id`, `…Count`, `count`, `total`, list lengths, status codes). Never an email,
 * a name, comment text, a token or a cookie. Last line `compared <routes>×<listeners> answers; ignored <n> fields; <k> different; <o> order-only`.
 * Exit 0 when k = 0, 1 otherwise, 2 on a usage or start error.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type Json = unknown;
export type Rule = { route: string; field: string; reason: string };
export type CompareOpts = {
  oldUrl: string;
  newUrl: string;
  listeners?: readonly string[];
  sample?: number;
  /** Name of an environment variable holding an account's email; that account is compared first. */
  emailEnv?: string;
  routes?: readonly string[];
  ignore?: readonly Rule[];
  env?: Record<string, string | undefined>;
  /** Tests wrap one side's fetch (a changed answer, an email in a field). */
  fetchOld?: typeof fetch;
  fetchNew?: typeof fetch;
  /** The pause before the one re-read; the contract says 2 s. */
  rereadMs?: number;
  log?: (line: string) => void;
};
export type CompareResult = { exit: 0 | 1 | 2; routes: number; listeners: number; ignored: number; different: number; orderOnly: number; lines: string[] };

const here = (name: string): string => fileURLToPath(new URL(name, import.meta.url));
export const loadRoutes = (): { version: number; routes: string[] } => JSON.parse(readFileSync(here('compare-routes.json'), 'utf8')) as { version: number; routes: string[] };
export const loadIgnore = (): Rule[] => JSON.parse(readFileSync(here('compare-ignore.json'), 'utf8')) as Rule[];

class Usage extends Error {}

const localUrl = (u: string, flag: string): string => {
  let url: URL;
  try { url = new URL(u); } catch { throw new Usage(`${flag}: "${u}" is not a URL`); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) throw new Usage(`${flag}: only localhost addresses are compared (got host "${url.hostname}")`);
  return url.origin;
};

const canon = (v: Json): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));

/** Removes the ignored fields (everywhere in the body, by key), counting what was removed. */
function strip(v: Json, route: string, rules: readonly Rule[], count: { n: number }): Json {
  if (Array.isArray(v)) return v.map((x) => strip(x, route, rules, count));
  if (v && typeof v === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, x] of Object.entries(v as Record<string, Json>)) {
      if (rules.some((r) => r.field === k && (r.route === '*' || r.route === route))) { count.n++; continue; }
      out[k] = strip(x, route, rules, count);
    }
    return out;
  }
  return v;
}

/** Equal once every list is sorted (the same items in another order). */
export function sameIgnoringOrder(a: Json, b: Json): boolean {
  const norm = (v: Json): Json => (Array.isArray(v) ? v.map(norm).map(canon).sort() : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, Json>).map(([k, x]) => [k, norm(x)])) : v);
  return canon(norm(a)) === canon(norm(b));
}

export type Delta = { path: string; kind: 'missing' | 'extra' | 'value'; old?: string; new?: string };
const SHOWN = /^(id|.*Id|.*_id|count|.*Count|.*_count|total|followers|following|n|unread|position|version)$/;

/** The JSON paths where a (old) and b (new) differ, up to `max`, with a value only for id and count fields. */
export function deltas(a: Json, b: Json, path = '$', out: Delta[] = [], max = 12): Delta[] {
  if (out.length >= max) return out;
  const field = path.split('.').pop()!.replace(/\[\d+\]$/, '');
  const show = (v: Json): string => {
    if (Array.isArray(v)) return `list(${v.length})`;
    if (v === null) return 'null';
    // an id or a count only; anything with an @ is never printed
    if (SHOWN.test(field) && (typeof v === 'number' || (typeof v === 'string' && !v.includes('@') && v.length <= 80))) return JSON.stringify(v);
    return typeof v;
  };
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push({ path, kind: 'value', old: `list(${a.length})`, new: `list(${b.length})` });
    for (let i = 0; i < Math.min(a.length, b.length) && out.length < max; i++) deltas(a[i], b[i], `${path}[${i}]`, out, max);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort()) {
      if (out.length >= max) break;
      const p = `${path}.${k.includes('@') ? '*' : k}`; // a key that is itself an address is never printed
      const inA = k in (a as object);
      const inB = k in (b as object);
      if (!inA) out.push({ path: p, kind: 'extra' });
      else if (!inB) out.push({ path: p, kind: 'missing' });
      else deltas((a as Record<string, Json>)[k], (b as Record<string, Json>)[k], p, out, max);
    }
    return out;
  }
  if (a !== b) {
    const [x, y] = [show(a), show(b)];
    out.push({ path, kind: 'value', ...(SHOWN.test(field) ? { old: x, new: y } : {}) });
  }
  return out;
}

type Answer = { status: number; body: Json };
async function ask(f: typeof fetch, base: string, path: string, token: string): Promise<Answer> {
  const res = await f(`${base}${path}`, { headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.9' }, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) as Json }; } catch { return { status: res.status, body: { $text: text.length } }; }
}

async function post(f: typeof fetch, base: string, path: string, body: unknown): Promise<Response> {
  return f(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
}

export async function runCompare(o: CompareOpts): Promise<CompareResult> {
  const lines: string[] = [];
  const out = (l: string): void => { lines.push(l); o.log?.(l); };
  const fo = o.fetchOld ?? fetch;
  const fn = o.fetchNew ?? fetch;
  const result = (exit: 0 | 1 | 2, extra: Partial<CompareResult> = {}): CompareResult => ({ exit, routes: 0, listeners: 0, ignored: 0, different: 0, orderOnly: 0, lines, ...extra });
  try {
    const oldBase = localUrl(o.oldUrl, '--old');
    const newBase = localUrl(o.newUrl, '--new');
    if (oldBase === newBase) throw new Usage('--old and --new are the same server');
    if (!o.listeners?.length && !o.sample) throw new Usage('name the listeners: --listeners a,b or --sample N');
    const routeFile = o.routes ? { version: 0, routes: [...o.routes] } : loadRoutes();
    const rules = o.ignore ?? loadIgnore();
    out(`compare routes version ${routeFile.version}: ${routeFile.routes.length} routes`);

    // The listeners: those named, else the most active on the OLD side (plus the --email-env account, first).
    const ids: string[] = [];
    if (o.emailEnv) {
      const email = (o.env ?? process.env)[o.emailEnv];
      if (!email) throw new Usage(`--email-env: ${o.emailEnv} is not set`);
      const r = await post(fo, oldBase, '/_compare/by-email', { email });
      if (r.ok) ids.push(((await r.json()) as { id: string }).id); else out(`the account in ${o.emailEnv} was not found on the old side`);
    }
    if (o.listeners?.length) ids.push(...o.listeners.filter((i) => !ids.includes(i)));
    else {
      const r = await fo(`${oldBase}/_compare/sample?n=${o.sample}`, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Usage(`the old server did not give a sample (${r.status})`);
      for (const i of ((await r.json()) as { ids: string[] }).ids) if (ids.length < o.sample! && !ids.includes(i)) ids.push(i);
    }
    if (!ids.length) throw new Usage('no listeners to compare');

    let different = 0;
    let orderOnly = 0;
    const ignored = { n: 0 };
    for (const id of ids) {
      const mint = async (f: typeof fetch, base: string, side: string): Promise<string> => {
        const r = await post(f, base, '/_compare/session', { listenerId: id });
        if (!r.ok) throw new Usage(`the ${side} server could not start a session for listener ${id} (${r.status})`);
        return ((await r.json()) as { token: string }).token;
      };
      const tOld = await mint(fo, oldBase, 'old');
      let tNew: string | undefined;
      try {
        tNew = await mint(fn, newBase, 'new');
        const epRes = await fo(`${oldBase}/_compare/episode?listener=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(30_000) });
        const ep = epRes.ok ? ((await epRes.json()) as { id: string }).id : undefined;
        for (const r of routeFile.routes) {
          if (r.includes(':ep') && !ep) { out(`SKIP ${r} listener=${id} (no commented episode)`); continue; }
          const path = r.replace(':me', id).replace(':ep', ep ?? '');
          const once = async (): Promise<{ a: Answer; b: Answer; x: Json; y: Json; n: number; same: boolean }> => {
            const [a, b] = [await ask(fo, oldBase, path, tOld), await ask(fn, newBase, path, tNew!)];
            const c = { n: 0 };
            const [x, y] = [strip(a.body, r, rules, c), strip(b.body, r, rules, { n: 0 })];
            return { a, b, x, y, n: c.n, same: a.status === b.status && canon(x) === canon(y) };
          };
          let cur = await once();
          if (!cur.same) { await new Promise((ok) => setTimeout(ok, o.rereadMs ?? 2000)); cur = await once(); } // one re-read: only a persistent difference counts
          ignored.n += cur.n;
          if (cur.same) continue;
          if (cur.a.status !== cur.b.status) {
            different++;
            out(`DIFF ${r} listener=${id} path=$ kind=status old=${cur.a.status} new=${cur.b.status}`);
          } else if (sameIgnoringOrder(cur.x, cur.y)) {
            orderOnly++;
            for (const d of deltas(cur.x, cur.y).slice(0, 1)) out(`DIFF ${r} listener=${id} path=${d.path} kind=order`);
          } else {
            different++;
            for (const d of deltas(cur.x, cur.y)) out(`DIFF ${r} listener=${id} path=${d.path} kind=${d.kind}${d.old !== undefined ? ` old=${d.old} new=${d.new}` : ''}`);
          }
        }
      } finally {
        await post(fo, oldBase, '/_compare/session/end', { token: tOld }).catch(() => undefined);
        if (tNew) await post(fn, newBase, '/_compare/session/end', { token: tNew }).catch(() => undefined);
      }
    }
    out(`compared ${routeFile.routes.length}×${ids.length} answers; ignored ${ignored.n} fields; ${different} different; ${orderOnly} order-only`);
    return result(different === 0 ? 0 : 1, { routes: routeFile.routes.length, listeners: ids.length, ignored: ignored.n, different, orderOnly });
  } catch (e) {
    out(`compare: ${e instanceof Usage ? e.message : `could not complete (${e instanceof Error ? e.constructor.name : 'error'})`}`);
    return result(2);
  }
}

function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = true;
  }
  return out;
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const str = (k: string): string | undefined => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
  const r = await runCompare({
    oldUrl: str('old') ?? '', newUrl: str('new') ?? '',
    ...(str('listeners') ? { listeners: str('listeners')!.split(',').filter(Boolean) } : {}),
    ...(str('sample') ? { sample: Number(str('sample')) } : {}),
    ...(str('email-env') ? { emailEnv: str('email-env')! } : {}),
    log: (l) => console.log(l),
  });
  process.exitCode = r.exit;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.constructor.name : 'error'); process.exit(2); });
}
