// The `main` build (Postgres) as a local-only server for the cutover comparison: maintenance read as off, no network, sessions on request.
/**
 * M28 US1 (contracts/compare-cli.md, research R1). OLD side of `compare.ts`. Script only — never deployed. It does not run THIS
 * branch's app: it imports `<worktree>/apps/api/src/*` of a git worktree of `main` (the Postgres app as Vercel runs it),
 * so what is compared is the build that is live, route for route.
 *
 *   git worktree add ../sm-main origin/main && (cd ../sm-main && npm ci)             # read-only; nothing is ever written to main
 *   cd apps/api && DATABASE_URL=<Neon branch compare-<n>> npx tsx scripts/compare-server-old.ts --worktree ../../sm-main [--port 4101]
 *   cd apps/api && npx tsx scripts/compare-server-old.ts --worktree ../../sm-main --pglite   # in-process Postgres (PGlite), no network: "does main start?" (T015)
 *
 * - `DATABASE_URL` is a throwaway Neon branch made from the frozen copy; it is read, never printed, never logged.
 * - The `maintenance` setting is read as off in this process only (the way `diff-listeners` did): the branch is a copy.
 * - Outside fetches answer 503 `offline`. Listens on 127.0.0.1 only. The sessions it mints use main's own `createSession`.
 * - Refuses: no `--worktree`; no `DATABASE_URL` (unless `--pglite`); both together.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { compareFetch, offlineFetch } from './compare-http.ts';
import type { Running } from './compare-server.ts';

type Env = Record<string, string | undefined>;
/** The part of main's `Db` this script uses (main's file is loaded at run time, so its types are not ours). */
type PgDb = { query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>; exec(sql: string): Promise<void>; transaction<T>(fn: (tx: PgDb) => Promise<T>): Promise<T> };
export type OldServerOpts = { worktree: string; pglite: boolean; port: number };

/** A `Db` that reads the maintenance setting as absent. */
export function pgWithoutMaintenance(db: PgDb): PgDb {
  const wrap = (d: PgDb): PgDb => ({
    query: (sql, params) => (/FROM app_settings WHERE key = \$1/.test(sql) && params?.[0] === 'maintenance' ? Promise.resolve([]) : d.query(sql, params)),
    exec: (sql) => d.exec(sql),
    transaction: (fn) => d.transaction((tx) => fn(wrap(tx))),
  });
  return wrap(db);
}

export function checkOldStart(o: OldServerOpts, env: Env = process.env): void {
  if (!o.worktree) throw new Error('--worktree <path to a git worktree of main> is required');
  if (!existsSync(join(o.worktree, 'apps/api/src/app.ts'))) throw new Error(`--worktree: ${o.worktree} has no apps/api/src/app.ts (is it a worktree of main, with npm ci run?)`);
  if (o.pglite && env['DATABASE_URL']) throw new Error('--pglite and DATABASE_URL together: choose the local in-process database or the Neon branch, not both');
  if (!o.pglite && !env['DATABASE_URL']) throw new Error('DATABASE_URL is not set (the Neon branch compare-<n>); or pass --pglite for a local run');
}

/** Starts main's app on 127.0.0.1 (`port` 0 = a free one). */
export async function startOldServer(o: OldServerOpts, env: Env = process.env): Promise<Running & { db: PgDb }> {
  checkOldStart(o, env);
  const wt = resolve(o.worktree);
  const load = <T>(rel: string): Promise<T> => import(pathToFileURL(join(wt, 'apps/api/src', rel)).href) as Promise<T>;
  const { createApp } = await load<{ createApp: (d: Record<string, unknown>) => { fetch(req: Request, env?: unknown): Response | Promise<Response> } }>('app.ts');
  const { createSession } = await load<{ createSession: (db: PgDb, id: string, pepper: string, label?: string) => Promise<string> }>('auth/session.ts');
  const dbMod = await load<{ fromPostgres: (sql: unknown) => PgDb; fromPglite: (p: unknown) => PgDb }>('db/db.ts');
  const { migrate } = await load<{ migrate: (r: unknown) => Promise<number[]> }>('db/migrate.ts');

  let raw: PgDb;
  let close: () => Promise<void>;
  if (o.pglite) {
    const req = createRequire(join(wt, 'apps/api/package.json'));
    const { PGlite } = (await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href)) as { PGlite: new (o: unknown) => { exec(s: string): Promise<unknown>; query<T>(s: string, p?: unknown[]): Promise<{ rows: T[] }>; close(): Promise<void> } };
    const { citext } = (await import(pathToFileURL(req.resolve('@electric-sql/pglite/contrib/citext')).href)) as { citext: unknown };
    const pg = new PGlite({ extensions: { citext } });
    await migrate({ exec: (s: string) => pg.exec(s), query: async (s: string, p?: unknown[]) => (await pg.query(s, p)).rows });
    raw = dbMod.fromPglite(pg);
    close = () => pg.close();
  } else {
    const { createClient } = await load<{ createClient: (url: string) => { end(): Promise<void> } }>('db/client.ts');
    const sql = createClient(env['DATABASE_URL']!);
    raw = dbMod.fromPostgres(sql);
    close = () => sql.end();
  }
  const db = pgWithoutMaintenance(raw);
  const pepper = randomBytes(24).toString('base64url');
  const app = createApp({
    db, pepper, catalogFetch: offlineFetch, pushFetch: offlineFetch, imageFetch: offlineFetch, audioFetch: offlineFetch, groqFetch: offlineFetch,
    resolveHost: async () => ['93.184.216.34'], today: () => new Date().toISOString().slice(0, 10),
  });
  const handler = compareFetch({
    app,
    mint: (id) => createSession(db, id, pepper, 'compare'),
    // The most active: comments + follows + subscriptions, not suspended (as diff-listeners picked them).
    sample: async (n) => (await raw.query(
      `SELECT l.id FROM listeners l WHERE l.suspended_at IS NULL
        ORDER BY (SELECT count(*) FROM comments c WHERE c.author_id = l.id)
               + (SELECT count(*) FROM follows f WHERE f.follower_id = l.id OR f.followed_id = l.id)
               + (SELECT count(*) FROM subscriptions s WHERE s.listener_id = l.id) DESC, l.id LIMIT $1`, [n])).map((r) => String(r['id'])),
    episode: async (id) => {
      const [r] = await raw.query('SELECT episode_id FROM comments WHERE author_id = $1 GROUP BY episode_id ORDER BY count(*) DESC, episode_id LIMIT 1', [id]);
      return r ? String(r['episode_id']) : undefined;
    },
    byEmail: async (email) => {
      const [r] = await raw.query('SELECT id FROM listeners WHERE email = $1', [email.trim().toLowerCase()]);
      return r ? String(r['id']) : undefined;
    },
  });
  const server = await new Promise<ReturnType<typeof serve>>((ok) => { const s = serve({ fetch: handler, port: o.port, hostname: '127.0.0.1' }, () => ok(s)); });
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`, port, db: raw,
    close: () => new Promise<void>((done) => { server.close(() => { void close().finally(done); }); (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); }),
  };
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
  const opts: OldServerOpts = { worktree: typeof a['worktree'] === 'string' ? a['worktree'] : '', pglite: a['pglite'] === true, port: Number(typeof a['port'] === 'string' ? a['port'] : 4101) };
  const run = await startOldServer(opts);
  console.log(`compare-server-old (main build, ${opts.pglite ? 'PGlite, in-process' : 'Postgres via DATABASE_URL'}) on ${run.url}; maintenance read as off in this process only`);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { void run.close().finally(() => process.exit(0)); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
}
