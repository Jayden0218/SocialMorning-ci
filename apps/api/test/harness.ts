// Test helper: real app on an in-memory Postgres with real migrations.
/**
 * Test harness (research R8): an in-process Postgres (pglite) running the SAME
 * migration files the real database gets, and the real Hono app on top of it.
 * Nothing is mocked below the routes.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { migrate, type MigrationRunner } from '../src/db/migrate.ts';
import { fromPglite, fromPostgres, type Db } from '../src/db/db.ts';
import postgres from 'postgres';
import { createApp } from '../src/app.ts';
import { createListener } from '../src/db/repos/account/listeners.ts';
import { hashPassword } from '../src/auth/password.ts';
import { createSession } from '../src/auth/session.ts';
import type { Mail, Mailer } from '../src/mail/mailer.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';
import type { Clock, Store, Tables } from '../src/db/ddb/store.ts';
import type { DrainResult } from '../src/jobs/outbox.ts';

export const TEST_PEPPER = 'test-pepper-not-secret';

export type TestDb = {
  pg: PGlite;
  db: Db;
  runner: MigrationRunner;
  app: ReturnType<typeof createApp>;
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** JSON request helper: `call('POST', '/v1/auth/sign-in', body, token)`. */
  call(method: string, path: string, body?: unknown, token?: string, headers?: Record<string, string>): Promise<Response>;
  /** Every email the app would have sent (a fake mailer; see `src/mail/mailer.ts`). */
  mail?: Mail[];
  /** The last code sent to this address. */
  lastCode?(to: string): string;
  /** M6: rebuilds the app with this listener as the owner (the id exists only after a sign-up). */
  setOwner?(id: string): void;
  /** M26 F0-08: with TEST_BACKEND=ddb, this test's own DynamoDB table set (the app still runs on Postgres until the domain lanes land). */
  store?: Store;
  close(): Promise<void>;
};

export const TEST_APPEALS = 'appeals@example.test';

/**
 * M25 S7: the SSRF guard resolves every host it fetches. Tests never touch real DNS: every name
 * resolves to one public documentation-free address, unless a test passes its own `resolveHost`.
 * (Literal private addresses and `localhost` are refused by the guard before any lookup.)
 */
export const publicResolve = async (): Promise<string[]> => ['93.184.216.34'];

/*
 * M23 US12 (T050): every test used to run all ~22 migrations on its own new PGlite —
 * 4–7 s a test, 9.5 of the gate's 12.5 minutes. Now the migrations run once, the data
 * directory is dumped (`dumpDataDir`), and every test loads a copy (`loadDataDir`). The
 * database each test gets is the same: the same files, applied in the same order, with
 * the same `schema_migrations` rows. The dump is also kept in the OS temp folder, keyed
 * by a hash of the migration files and the PGlite version, so the other test files (node
 * runs each file in its own process) skip the migrations too. A changed migration file
 * changes the key, so a stale copy is never used.
 */
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migrations');
let template: Promise<Blob> | undefined;

async function templateKey(): Promise<string> {
  const h = createHash('sha256');
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) h.update(f).update('\0').update(await readFile(path.join(MIGRATIONS_DIR, f))).update('\0');
  // The PGlite build is part of the key: a dump from one version may not load in another.
  let pglite = 'unknown';
  try { pglite = await readFile(fileURLToPath(import.meta.resolve('@electric-sql/pglite')), 'utf8'); } catch { /* key on the migrations alone */ }
  h.update(pglite);
  return h.digest('hex').slice(0, 16);
}

async function buildTemplate(): Promise<Blob> {
  const file = path.join(tmpdir(), `socialmorning-pglite-${await templateKey()}.tar`);
  const cached = await readFile(file).catch(() => undefined);
  if (cached && cached.length > 0) return new Blob([new Uint8Array(cached)]);
  const pg = new PGlite({ extensions: { citext } });
  await migrate({ exec: (s) => pg.exec(s), query: async <T,>(s: string, params?: unknown[]) => (await pg.query<T>(s, params)).rows });
  const blob = await pg.dumpDataDir('none');
  await pg.close();
  // Atomic: another test process may be writing the same file at the same moment.
  const part = `${file}.${process.pid}.${Date.now()}`;
  await writeFile(part, Buffer.from(await blob.arrayBuffer()));
  await rename(part, file).catch(() => undefined);
  return blob;
}

/*
 * M25 G3: the same suite on a real PostgreSQL through the PRODUCTION driver (`postgres`, wrapped by
 * `fromPostgres`, the options of src/db/client.ts). `TEST_DB=postgres` + `DATABASE_URL` (any
 * database on the server; the harness makes its own). PGlite stays the default.
 *
 * Isolation: one database per test, `CREATE DATABASE … TEMPLATE` a once-migrated template (the
 * same idea as the PGlite dump above). The template is named by the same migration-file hash and
 * built once under an advisory lock, so the parallel test processes never race to build it.
 * `t.pg` is then a PGlite-shaped stand-in (query → { rows }, exec, close) over the same
 * connection, and `dbOf(t.pg)` gives the production adapter (tests that build their own app use
 * `dbOf`, never `fromPglite`, so they get the right one on either database).
 */
export const TEST_DB: 'pglite' | 'postgres' = process.env['TEST_DB'] === 'postgres' ? 'postgres' : 'pglite';
const PG_DB = Symbol('fromPostgres');
const quiet = { onnotice: () => {} };
/** The production client's options (src/db/client.ts), plus a short idle timeout so a test that never closes cannot hold its process open. */
const CLIENT = { max: 1, idle_timeout: 1, prepare: false, ...quiet } as const;
let pgTemplate: Promise<string> | undefined;
let pgCounter = 0;

function serverUrl(db: string): string {
  const raw = process.env['DATABASE_URL'];
  if (!raw) throw new Error('TEST_DB=postgres needs DATABASE_URL (a throw-away server: the tests create and drop databases on it)');
  const u = new URL(raw);
  u.pathname = `/${db}`;
  return u.toString();
}

const pgRunner = (sql: postgres.Sql): MigrationRunner => ({
  exec: (s) => sql.unsafe(s),
  query: async <T,>(s: string, params?: unknown[]) => [...(await sql.unsafe(s, (params ?? []) as never))] as T[],
});

async function buildPgTemplate(): Promise<string> {
  const name = `sm_tpl_${await templateKey()}`;
  const admin = postgres(serverUrl('postgres'), { ...CLIENT, idle_timeout: 0 });
  try {
    await admin`SELECT pg_advisory_lock(25003)`;
    const [have] = await admin`SELECT 1 AS one FROM pg_database WHERE datname = ${name}`;
    if (!have) {
      const tmp = `${name}_build_${process.pid}`;
      await admin.unsafe(`CREATE DATABASE "${tmp}"`);
      const sql = postgres(serverUrl(tmp), CLIENT);
      await migrate(pgRunner(sql));
      await sql.end({ timeout: 5 });
      await admin.unsafe(`ALTER DATABASE "${tmp}" RENAME TO "${name}"`);
    }
    await admin`SELECT pg_advisory_unlock(25003)`;
  } finally {
    await admin.end({ timeout: 5 });
  }
  return name;
}

/** A new database copied from the migrated template; `drop` removes it. */
async function pgCopy(): Promise<{ sql: postgres.Sql; drop: () => Promise<void> }> {
  pgTemplate ??= buildPgTemplate();
  const tpl = await pgTemplate;
  const name = `sm_t_${process.pid}_${++pgCounter}_${Date.now() % 1_000_000}`;
  const admin = postgres(serverUrl('postgres'), CLIENT);
  // Two CREATE DATABASE … TEMPLATE at the same instant can see each other as "users" of the
  // template (55006). That is the server's lock, not the code under test: wait and ask again.
  for (let i = 0; ; i++) {
    try { await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${tpl}"`); break; } catch (e) {
      if ((e as { code?: string }).code !== '55006' || i >= 20) { await admin.end({ timeout: 5 }); throw e; }
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
    }
  }
  await admin.end({ timeout: 5 });
  const sql = postgres(serverUrl(name), CLIENT);
  return {
    sql,
    drop: async () => {
      await sql.end({ timeout: 5 });
      const a = postgres(serverUrl('postgres'), CLIENT);
      await a.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined);
      await a.end({ timeout: 5 });
    },
  };
}

/** The PGlite-shaped stand-in `t.pg` is on Postgres (only what the tests use). */
function pgStandIn(sql: postgres.Sql, drop: () => Promise<void>): PGlite {
  const db = fromPostgres(sql as never);
  const shim = {
    [PG_DB]: db,
    query: async <T,>(s: string, params?: unknown[]) => ({ rows: [...(await sql.unsafe(s, (params ?? []) as never))] as T[] }),
    exec: async (s: string) => { await sql.unsafe(s); return []; },
    transaction: <T,>(fn: (tx: unknown) => Promise<T>) => sql.begin((tx) => fn({
      query: async (s: string, params?: unknown[]) => ({ rows: [...(await tx.unsafe(s, (params ?? []) as never))] }),
      exec: async (s: string) => { await tx.unsafe(s); return []; },
    })) as Promise<T>,
    close: drop,
  };
  return shim as unknown as PGlite;
}

/** The app's `Db` for a `t.pg`: the production adapter on Postgres, the PGlite one otherwise. */
export function dbOf(pg: PGlite): Db {
  return (pg as unknown as { [PG_DB]?: Db })[PG_DB] ?? fromPglite(pg);
}

/** A PGlite with every migration applied, copied from a once-migrated template (see above). */
export async function migratedPg(): Promise<{ pg: PGlite; runner: MigrationRunner }> {
  if (TEST_DB === 'postgres') {
    const { sql, drop } = await pgCopy();
    const runner = pgRunner(sql);
    await migrate(runner);
    return { pg: pgStandIn(sql, drop), runner };
  }
  template ??= buildTemplate();
  const pg = new PGlite({ extensions: { citext }, loadDataDir: await template });
  const runner: MigrationRunner = {
    exec: (s) => pg.exec(s),
    query: async <T,>(s: string, params?: unknown[]) => (await pg.query<T>(s, params)).rows,
  };
  // A no-op on the template's copy (every version is in schema_migrations); kept so a test
  // still gets exactly what `migrate` gives, should the template ever lag a new file.
  await migrate(runner);
  return { pg, runner };
}

/** `ownerListenerId` is unknown until a listener exists: tests that need the owner sign up first, then `setOwner`. */
export async function freshDb(allOpts: { ownerListenerId?: string; appealsEmail?: string; releaseSha256?: string; noMailer?: boolean; pushFetch?: typeof fetch; catalogFetch?: typeof fetch;
  /** M12 */ jobToken?: string; voiceStorage?: VoiceStorage; /** M19 */ avatarStorage?: VoiceStorage; imageFetch?: typeof fetch;
  /** M25 */ audioFetch?: typeof fetch; resolveHost?: (host: string) => Promise<string[]>; /** M20 */ imageStorage?: import('../src/storage/image-store.ts').ImageStorage; imageCeilingBytes?: number; play?: import('../src/billing/google-play.ts').GooglePlay; picksRaw?: unknown; today?: () => string } = {}): Promise<TestDb> {
  const { noMailer, ...given } = allOpts;
  const opts = { resolveHost: publicResolve, ...given };
  const { pg, runner } = await migratedPg();
  // M21 US6 (G-M21-7): a comment POST answers 428 until the author accepted the community rules.
  // Test listeners have accepted them, so every older test keeps its meaning; the rules tests
  // (comments-m21.test.ts) set rules_accepted_at back to NULL for the listener they test.
  await pg.exec('ALTER TABLE listeners ALTER COLUMN rules_accepted_at SET DEFAULT now()');
  const db = dbOf(pg);
  const mail: Mail[] = [];
  const mailer: Mailer | undefined = noMailer ? undefined : { send: async (m) => { mail.push(m); } };
  let app = createApp({ db, pepper: TEST_PEPPER, appealsEmail: TEST_APPEALS, ...(mailer ? { mailer } : {}), ...opts });
  const t: TestDb = {
    pg,
    db,
    runner,
    app,
    mail,
    lastCode: (to) => {
      const m = [...mail].reverse().find((x) => x.to === to);
      const code = m ? /\b(\d{6})\b/.exec(m.text)?.[1] : undefined;
      if (!code) throw new Error(`no code was sent to ${to}`);
      return code;
    },
    setOwner: (id) => { app = createApp({ db, pepper: TEST_PEPPER, appealsEmail: TEST_APPEALS, ...(mailer ? { mailer } : {}), ...opts, ownerListenerId: id }); t.app = app; },
    q: async <T,>(s: string, params?: unknown[]) => (await pg.query<T>(s, params)).rows,
    call: async (method, path, body, token, headers = {}) =>
      app.request(path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
    // M21 (gate 37444486891, debug run 37447600552): in admin-discover's renamed-table test,
    // PGlite's close() sometimes never settled after a correct 200 answer, with no query open;
    // with query tracing on it closed at once. A close that has not settled in 5 s is left to
    // the process exit instead of hanging the whole file.
    close: () => Promise.race([pg.close(), new Promise<void>((r) => { setTimeout(r, 5_000).unref(); })]),
  };
  if (TEST_BACKEND === 'ddb') await attachStore(t);
  return t;
}

/**
 * Makes a listener (with this password, for the tests that sign in with one) and a session, and
 * returns their token + id. M25 S3: `POST /v1/auth/sign-up` is gone, so this writes the same rows
 * the old route wrote, directly; `signUpWithCode` goes through the real code route.
 */
export async function signUp(t: Pick<TestDb, 'db'>, email = 'a@example.com', displayName = 'Alex', password = 'correct horse') {
  const created = await createListener(t.db, email.trim().toLowerCase(), await hashPassword(password), displayName);
  if (created === 'exists') throw new Error(`sign-up failed: ${email} exists`);
  return { token: await createSession(t.db, created.id, TEST_PEPPER), id: created.id };
}

/** A new account the way the app makes one: a code to the email, then the code and a name. */
export async function signUpWithCode(t: TestDb, email: string, displayName: string): Promise<{ status: number; token?: string; id?: string }> {
  const sent = await t.call('POST', '/v1/auth/code', { email });
  if (sent.status !== 200) return { status: sent.status };
  const res = await t.call('POST', '/v1/auth/code/verify', { email, code: t.lastCode!(email.trim().toLowerCase()), displayName });
  if (res.status !== 200) return { status: res.status };
  const j = (await res.json()) as { token: string; listener: { id: string } };
  return { status: 200, token: j.token, id: j.listener.id };
}

/*
 * M26 F0-08: the DynamoDB path, additive — TEST_BACKEND=ddb (plus DDB_ENDPOINT, DynamoDB Local in
 * ci/workflows/ddb-api.yml). The default stays Postgres/PGlite and never loads the AWS SDK: every DynamoDB
 * module is imported dynamically here, so the PGlite coverage run (apps/api/.c8rc.json counts loaded files)
 * is unchanged. Each test gets its OWN table set (`t<pid>_<n>_<rand>_main/events/cache`, created from
 * infra/tables.yaml) and drops it on close; after every `t.call` the outbox is drained, so effects are
 * deterministic (data-model.md §9).
 */
export const TEST_BACKEND: 'pg' | 'ddb' = process.env['TEST_BACKEND'] === 'ddb' ? 'ddb' : 'pg';
export const TEST_CURSOR_SECRET = 'test-cursor-secret-not-secret';

export type TestStore = { store: Store; tables: Tables; drain(): Promise<DrainResult>; close(): Promise<void> };
let storeCounter = 0;

/** A fresh table set on DynamoDB Local and a Store over it. */
export async function freshStore(opts: { clock?: Clock } = {}): Promise<TestStore> {
  const [{ createDdbClients }, { createStore, prefixedTables }, { createTableSet, deleteTableSet }, { drainOutbox }] = await Promise.all([
    import('../src/db/ddb/client.ts'), import('../src/db/ddb/store.ts'), import('../src/db/ddb/schema.ts'), import('../src/jobs/outbox.ts'),
  ]);
  const clients = createDdbClients();
  const tables = prefixedTables(`t${process.pid}_${++storeCounter}_${Math.random().toString(36).slice(2, 8)}`);
  await createTableSet(clients.raw, tables);
  const store = createStore({ clients, tables, secret: TEST_CURSOR_SECRET, ...(opts.clock ? { clock: opts.clock } : {}) });
  return {
    store,
    tables,
    drain: () => drainOutbox(store),
    close: async () => { await deleteTableSet(clients.raw, tables); clients.raw.destroy(); },
  };
}

async function attachStore(t: TestDb): Promise<void> {
  const s = await freshStore();
  t.store = s.store;
  const call = t.call;
  t.call = async (...args) => { const res = await call(...args); await s.drain(); return res; };
  const close = t.close;
  t.close = async () => { await s.close(); await close(); };
}
