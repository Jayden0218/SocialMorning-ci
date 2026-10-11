// For N listeners, asks the same GET routes of the API on Postgres and on DynamoDB and compares the answers; prints ids and counts only.
/**
 * M26 lane MIG, MIG-03 (plan.md "Cutover" steps 1, 5). Two copies of the real app run in this process: OLD on the
 * frozen Postgres, NEW on the DynamoDB tables (`withStore`, bridge off: nothing it does reaches Postgres). Each
 * listener gets a short-lived session on each side (made and signed out by this script — no real token is ever
 * read or printed); then every route in ROUTES is asked of both, and status + body must be equal.
 *
 * During the freeze the maintenance switch is on, and it would answer 503 to both sides alike; this script reads
 * around it (its Postgres row and its DynamoDB item read as "off" for these two in-process apps only).
 * Outside fetches (Apple, Expo) are refused for both sides, so a difference is always the data, never the network.
 *
 * Output: per listener and route, `ok` or the first differing JSON paths, with values shown only when the field is
 * an id or a count (`id`, `…Id`, `…Count`, `count`, `total`, list lengths). Never a name, a body or an email.
 *
 *   cd apps/api && DATABASE_URL=… DDB_ENDPOINT=… npx tsx scripts/diff-listeners.ts --prefix <tables> [--listeners id,id] [--email-env DIFF_EMAIL] [--n 5]
 *   (`--aws` instead of DDB_ENDPOINT only with the owner's AWS account — runbook.)
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { createApp } from '../src/app.ts';
import { createSession } from '../src/auth/session.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import type { Db } from '../src/db/db.ts';
import { wrapStore, type Store } from '../src/db/ddb/store.ts';
import { connect, parseArgs } from './copy/connect.ts';

/** The GET routes asked for every listener (`:me` = the listener, `:ep` = their most-commented episode). */
export const ROUTES: readonly string[] = [
  '/v1/me',
  '/v1/me/subscriptions',
  '/v1/me/subscriptions/order',
  '/v1/me/positions',
  '/v1/me/library',
  '/v1/me/comments',
  '/v1/me/feed',
  '/v1/me/notifications',
  '/v1/me/notifications/system',
  '/v1/me/chats',
  '/v1/me/playlists',
  '/v1/me/likes/timeline',
  '/v1/me/purchases',
  '/v1/me/blocks',
  '/v1/me/friends-listening',
  '/v1/me/host-notices',
  '/v1/listeners/:me',
  '/v1/listeners/:me/followers',
  '/v1/listeners/:me/following',
  '/v1/episodes/:ep/social',
];

export type Diff = { listener: string; route: string; status: [number, number]; paths: string[] };
/** `order`: answers holding the same items in another order — rows that tie on the sort time (Postgres leaves tie order undefined). */
export type DiffResult = { ok: boolean; asked: number; diffs: Diff[]; order: Diff[] };

/** Answer fields that are the server's clock, not data (`serverTime` of the sync routes). */
const VOLATILE = new Set(['serverTime']);
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
const strip = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !VOLATILE.has(k)).map(([k, x]) => [k, strip(x)]));
  return v;
};
/** Equal once every list is sorted (the same items, perhaps in another order). */
export function sameIgnoringOrder(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm).map(canon).sort() : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, norm(x)])) : v);
  return canon(norm(a)) === canon(norm(b));
}

const noNetwork = (async () => new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

/** A Postgres handle that reads the maintenance switch as off. */
function pgWithoutMaintenance(db: Db): Db {
  const wrap = (d: Db): Db => ({
    query: (sql, params) => (/FROM app_settings WHERE key = \$1/.test(sql) && params?.[0] === 'maintenance' ? Promise.resolve([]) : d.query(sql, params)) as never,
    exec: (sql) => d.exec(sql),
    transaction: (fn) => d.transaction((tx) => fn(wrap(tx))),
  });
  return wrap(db);
}

/** A Store that reads the maintenance item as absent. */
function storeWithoutMaintenance(store: Store): Store {
  return wrapStore(store, (cmd, next) => {
    if (cmd instanceof GetCommand && (cmd.input.Key as { PK?: string } | undefined)?.PK === 'CFG#maintenance') return Promise.resolve({});
    return next(cmd);
  });
}

const SHOWN = /^(id|.*Id|.*_id|count|.*Count|.*_count|total|n|unread|position|version)$/;

/** The JSON paths where a and b differ (up to `max`), values only for id/count fields. */
export function differences(a: unknown, b: unknown, path = '$', out: string[] = [], max = 8): string[] {
  if (out.length >= max) return out;
  const field = path.split('.').pop()!.replace(/\[\d+\]$/, '');
  const show = (v: unknown) => (SHOWN.test(field) && (typeof v === 'number' || typeof v === 'string') ? JSON.stringify(v) : v === null ? 'null' : Array.isArray(v) ? `list(${v.length})` : typeof v);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} vs ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length) && out.length < max; i++) differences(a[i], b[i], `${path}[${i}]`, out, max);
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
    for (const k of keys) {
      if (out.length >= max) break;
      const x = (a as Record<string, unknown>)[k];
      const y = (b as Record<string, unknown>)[k];
      if (!(k in (a as object))) out.push(`${path}.${k}: only on new (${show(y)})`);
      else if (!(k in (b as object))) out.push(`${path}.${k}: only on old (${show(x)})`);
      else differences(x, y, `${path}.${k}`, out, max);
    }
    return out;
  }
  if (a !== b) out.push(`${path}: ${show(a)} vs ${show(b)}`);
  return out;
}

async function body(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { $text: text.length }; }
}

export type DiffOpts = {
  /** The frozen Postgres (old). */
  pg: Db;
  /** The DynamoDB tables (new). */
  store: Store;
  listenerIds: readonly string[];
  routes?: readonly string[];
  /** Answers that may differ by design (a test may pass more); default none. */
  ignorePaths?: readonly RegExp[];
  log?: (line: string) => void;
};

export async function diffListeners(o: DiffOpts): Promise<DiffResult> {
  const log = o.log ?? (() => undefined);
  const pepper = randomBytes(24).toString('base64url'); // a pepper of this run only: the sessions below are this script's own
  const today = new Date().toISOString().slice(0, 10);
  const deps = { pepper, catalogFetch: noNetwork, pushFetch: noNetwork, imageFetch: noNetwork, audioFetch: noNetwork, groqFetch: noNetwork, resolveHost: async () => ['93.184.216.34'], today: () => today };
  const oldDb = pgWithoutMaintenance(o.pg);
  const newDb = withStore(oldDb, storeWithoutMaintenance(o.store), { bridge: false });
  const oldApp = createApp({ db: oldDb, ...deps });
  const newApp = createApp({ db: newDb, ...deps });
  const ask = (app: ReturnType<typeof createApp>, path: string, token: string, method = 'GET') =>
    app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.9' } });
  const diffs: Diff[] = [];
  const order: Diff[] = [];
  let asked = 0;
  for (const id of o.listenerIds) {
    const [ep] = await o.pg.query<{ episode_id: string }>(
      `SELECT episode_id FROM comments WHERE author_id = $1 GROUP BY episode_id ORDER BY count(*) DESC, episode_id LIMIT 1`, [id]);
    const tOld = await createSession(oldDb, id, pepper, 'diff-listeners');
    const tNew = await createSession(newDb, id, pepper, 'diff-listeners');
    try {
      for (const r of o.routes ?? ROUTES) {
        if (r.includes(':ep') && !ep) continue;
        const path = r.replace(':me', id).replace(':ep', ep?.episode_id ?? '');
        const [a, b] = [await ask(oldApp, path, tOld), await ask(newApp, path, tNew)];
        const [x, y] = [strip(await body(a)), strip(await body(b))];
        asked++;
        const paths = differences(x, y).filter((p) => !(o.ignorePaths ?? []).some((re) => re.test(`${r} ${p}`)));
        if (a.status === b.status && paths.length > 0 && sameIgnoringOrder(x, y)) {
          order.push({ listener: id, route: r, status: [a.status, b.status], paths });
          log(`ORDER ${id} ${r}: the same items in another order (ties on the sort time)`);
        } else if (a.status !== b.status || paths.length > 0) {
          diffs.push({ listener: id, route: r, status: [a.status, b.status], paths });
          log(`DIFF ${id} ${r}: status ${a.status} vs ${b.status}${paths.length ? `; ${paths.join('; ')}` : ''}`);
        } else log(`ok   ${id} ${r} (${a.status})`);
      }
    } finally {
      await Promise.resolve(ask(oldApp, '/v1/auth/sign-out', tOld, 'POST')).catch(() => undefined);
      await Promise.resolve(ask(newApp, '/v1/auth/sign-out', tNew, 'POST')).catch(() => undefined);
    }
  }
  return { ok: diffs.length === 0, asked, diffs, order };
}

/** The listeners compared when none are named: the most active ones (comments + follows + subscriptions), not suspended. */
export async function pickListeners(pg: Db, n: number, mustInclude: string[] = []): Promise<string[]> {
  const rows = await pg.query<{ id: string }>(
    `SELECT l.id FROM listeners l
      WHERE l.suspended_at IS NULL
      ORDER BY (SELECT count(*) FROM comments c WHERE c.author_id = l.id)
             + (SELECT count(*) FROM follows f WHERE f.follower_id = l.id OR f.followed_id = l.id)
             + (SELECT count(*) FROM subscriptions s WHERE s.listener_id = l.id) DESC, l.id
      LIMIT $1`, [n]);
  const ids = [...mustInclude];
  for (const r of rows) if (ids.length < n && !ids.includes(r.id)) ids.push(r.id);
  return ids;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const c = await connect(args);
  try {
    const must: string[] = [];
    const emailEnv = args['email-env'];
    if (typeof emailEnv === 'string' && process.env[emailEnv]) {
      const [r] = await c.pg.query<{ id: string }>('SELECT id FROM listeners WHERE email = $1', [process.env[emailEnv]]);
      if (r) must.push(r.id); else console.log(`the account in ${emailEnv} was not found`);
    }
    const ids = typeof args['listeners'] === 'string' ? args['listeners'].split(',') : await pickListeners(c.pg, Number(args['n'] ?? 5), must);
    const r = await diffListeners({ pg: c.pg, store: c.store, listenerIds: ids, log: (l) => console.log(l) });
    console.log(`diff-listeners: ${r.asked} answers compared for ${ids.length} listeners, ${r.diffs.length} different, ${r.order.length} the same items in another order (ties)`);
    process.exitCode = r.ok ? 0 : 1;
  } finally {
    await c.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
}
