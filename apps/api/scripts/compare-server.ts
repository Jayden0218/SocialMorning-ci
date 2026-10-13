// The DynamoDB build as a local-only server for the cutover comparison: maintenance read as off, no network, sessions on request.
/**
 * M28 US1 (contracts/compare-cli.md, research R1). NEW side of `compare.ts`. Script only — never deployed: G-M28-CMP3 fails
 * if `lambda-entry`, `vercel-entry`, `server` or `worker-entry` (or anything they import) reaches this file.
 *
 * - `createApp` on the tables of `--prefix <set>` (`dev` → `dev-main…`, `sm`/`stg` → `sm-main…`, any other → `<set>_main…`).
 *   DynamoDB Local through `DDB_ENDPOINT`, or `--aws` (credentials from the environment; the runbook uses `sm-claude-ops`).
 * - The maintenance item is read as absent INSIDE THIS PROCESS only (`withoutMaintenance`): during the freeze the live switch is on
 *   and would answer 503 to every compared route. The override is this file's alone; nothing in `src/` can import it.
 * - Outside fetches (Apple, Expo, Groq, images, audio) answer 503 `offline`, so a difference is data, never network.
 * - Listens on 127.0.0.1 only. Refuses: `APP_ENV=prod` without `--aws`; `--aws` without credentials; a non-local `DDB_ENDPOINT`.
 *
 *   cd apps/api && DDB_ENDPOINT=http://localhost:8000 npx tsx scripts/compare-server.ts --prefix <set> [--port 4102]
 *   cd apps/api && npx tsx scripts/compare-server.ts --prefix reh1 --aws [--port 4102]   (the rehearsal copy, owner's account)
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { createApp } from '../src/app.ts';
import { createSession } from '../src/auth/session.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import { createDdbClients, isLocalEndpoint, type Clients } from '../src/db/ddb/client.ts';
import { createStore, prefixedTables, wrapStore, type Store, type Tables } from '../src/db/ddb/store.ts';
import { tablesFor } from '../src/config.ts';
import { listenerByEmail } from '../src/db/repos/account/listeners.ts';
import { partition, queue } from '../src/db/repos/safety/ddb/common.ts';
import { compareFetch, offlineFetch } from './compare-http.ts';

export type Env = Record<string, string | undefined>;
export type CompareServerOpts = { prefix: string; aws: boolean; port: number };

/** `--a b --c` → { a: 'b', c: true }. */
export function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = true;
  }
  return out;
}

// A static key pair is detected by its key id alone: the SDK reads the secret half itself and fails clearly
// without it. Naming that variable here would trip the mirror's secret scan (scripts/secret-scan.sh), by design.
const hasAwsCredentials = (env: Env): boolean =>
  Boolean(env['AWS_ACCESS_KEY_ID'] || env['AWS_PROFILE'] || env['AWS_WEB_IDENTITY_TOKEN_FILE'] || env['AWS_CONTAINER_CREDENTIALS_RELATIVE_URI'] || env['AWS_CONTAINER_CREDENTIALS_FULL_URI']);

/** The refusals of the contract (the rules of `config.ts`); returns the tables and the local endpoint (none with `--aws`). Throws a message that names the flag or variable. */
export function checkCompareStart(o: CompareServerOpts, env: Env = process.env): { tables: Tables; endpoint: string | undefined } {
  if (!/^[a-z][a-z0-9_]{0,30}$/.test(o.prefix)) throw new Error(`--prefix: "${o.prefix}" must be lowercase letters, digits or _ and start with a letter`);
  const appEnv = env['APP_ENV'] ?? (env['VERCEL_ENV'] === 'production' ? 'prod' : 'dev');
  if (appEnv === 'prod' && !o.aws) throw new Error('APP_ENV=prod is refused without --aws (a local DynamoDB must never stand in for production)');
  const endpoint = env['DDB_ENDPOINT'] || undefined;
  if (endpoint && !isLocalEndpoint(endpoint)) throw new Error(`DDB_ENDPOINT: "${endpoint}" is not a local endpoint; real AWS is reached with --aws and no endpoint`);
  if (o.aws) {
    if (endpoint) throw new Error('--aws with DDB_ENDPOINT set: choose DynamoDB Local or AWS, not both');
    if (!hasAwsCredentials(env)) throw new Error('--aws needs AWS credentials in the environment (AWS_PROFILE or the key pair); none found');
  } else if (!endpoint) {
    throw new Error('DDB_ENDPOINT: set a local DynamoDB (e.g. http://localhost:8000), or pass --aws with credentials');
  }
  const tables = o.prefix === 'dev' || o.prefix === 'sm' || o.prefix === 'stg' ? tablesFor(o.prefix) : prefixedTables(o.prefix);
  return { tables, endpoint };
}

/** A Store that reads the maintenance item as absent (this process only; see the header). */
export function withoutMaintenance(store: Store): Store {
  return wrapStore(store, (cmd, next) => {
    if (cmd instanceof GetCommand && (cmd.input.Key as { PK?: string } | undefined)?.PK === 'CFG#maintenance') return Promise.resolve({});
    return next(cmd);
  });
}

/** The app on `store` with the comparison's rules, plus the `/_compare/*` routes. */
export function compareApp(store: Store): (req: Request, env?: unknown) => Promise<Response> {
  const db = withStore(undefined, withoutMaintenance(store));
  const pepper = randomBytes(24).toString('base64url'); // this process's own: its sessions are its own
  const app = createApp({
    db, pepper, catalogFetch: offlineFetch, pushFetch: offlineFetch, imageFetch: offlineFetch, audioFetch: offlineFetch, groqFetch: offlineFetch,
    resolveHost: async () => ['93.184.216.34'], today: () => new Date().toISOString().slice(0, 10),
  });
  return compareFetch({
    app,
    mint: (id) => createSession(db, id, pepper, 'compare'),
    // The most active: followers + following, then id. Over the `Q#listeners` queue (an owner-page read, fine for a rehearsal).
    sample: async (n) => (await queue(store, 'listeners'))
      .filter((l) => !l['suspendedAt'])
      .map((l) => ({ id: String(l['id']), score: Number(l['followerCount'] ?? 0) + Number(l['followingCount'] ?? 0) }))
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, n).map((l) => l.id),
    episode: async (id) => {
      const counts = new Map<string, number>();
      for (const i of await partition(store, 'main', `L#${id}`, { prefix: 'CMT#' })) counts.set(String(i['episodeId']), (counts.get(String(i['episodeId'])) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0];
    },
    byEmail: async (email) => (await listenerByEmail(db, email.trim().toLowerCase()))?.id,
  });
}

export type Running = { url: string; port: number; close(): Promise<void> };

/** Starts the server on 127.0.0.1 (`port` 0 = a free one). Throws the refusals above before opening anything. */
export async function startCompareServer(o: CompareServerOpts, env: Env = process.env): Promise<Running> {
  const { tables, endpoint } = checkCompareStart(o, env);
  const clients: Clients = createDdbClients({ ...(endpoint ? { endpoint } : {}), allowAws: o.aws });
  const store = createStore({ clients, tables, secret: 'compare-cursor-secret' }); // one fixed secret: two servers on one data set then sign a cursor alike
  const handler = compareApp(store);
  const server = await new Promise<ReturnType<typeof serve>>((ok) => { const s = serve({ fetch: handler, port: o.port, hostname: '127.0.0.1' }, () => ok(s)); });
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`, port,
    close: () => new Promise<void>((done) => { server.close(() => { clients.raw.destroy(); done(); }); (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); }),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args['prefix'] !== 'string') { console.error('usage: compare-server.ts --prefix <set> [--aws] [--port 4102]'); process.exit(2); }
  const opts: CompareServerOpts = { prefix: args['prefix'], aws: args['aws'] === true, port: Number(typeof args['port'] === 'string' ? args['port'] : 4102) };
  const run = await startCompareServer(opts);
  const { tables } = checkCompareStart(opts);
  console.log(`compare-server (new, DynamoDB ${opts.aws ? 'AWS' : 'Local'}) on ${run.url}: tables ${tables.main}, ${tables.events}, ${tables.cache}; maintenance read as off in this process only`);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => { void run.close().finally(() => process.exit(0)); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(2); });
}
