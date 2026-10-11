// The scripts' connections: Postgres from DATABASE_URL, DynamoDB Local (DDB_ENDPOINT) or — only with --aws — the owner's AWS.
/**
 * M26 lane MIG. Table names: `--prefix <p>` → `<p>_main/_events/_cache` (a rehearsal's scratch set), or `--prod` →
 * `sm-main/sm-events/sm-cache`. One of the two must be given, so a script never writes production tables by default.
 * Real AWS needs `--aws` (src/db/ddb/client.ts refuses a non-local endpoint otherwise); there is no AWS account yet.
 * DATABASE_URL is read from the environment only (never printed); TLS unless the host is local.
 */
import postgres from 'postgres';
import { fromPostgres, type Db } from '../../src/db/db.ts';
import { createDdbClients } from '../../src/db/ddb/client.ts';
import { createStore, PROD_TABLES, prefixedTables, type Store } from '../../src/db/ddb/store.ts';

export type Args = Record<string, string | true>;

/** `--a b --c` → { a: 'b', c: true }. */
export function parseArgs(argv: readonly string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; } else out[a.slice(2)] = true;
  }
  return out;
}

export type Conn = { pg: Db; store: Store; close(): Promise<void> };

export async function connect(args: Args, opts: { pgEnv?: string } = {}): Promise<Conn> {
  const url = process.env[opts.pgEnv ?? 'DATABASE_URL'];
  if (!url) throw new Error(`${opts.pgEnv ?? 'DATABASE_URL'} is not set`);
  const host = new URL(url).hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === 'postgres';
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ...(local ? {} : { ssl: 'require' as const }) });
  if (!args['prefix'] && !args['prod']) throw new Error('name the tables: --prefix <scratch> or --prod');
  const tables = typeof args['prefix'] === 'string' ? prefixedTables(args['prefix']) : PROD_TABLES;
  const clients = createDdbClients({ allowAws: args['aws'] === true });
  const store = createStore({ clients, tables, secret: process.env['CURSOR_SECRET'] ?? 'copy-script' });
  return { pg: fromPostgres(sql), store, close: async () => { await sql.end({ timeout: 5 }); clients.raw.destroy(); } };
}
