// The nightly DynamoDB backup: a parallel Scan of <env>-main and <env>-events to gzip'd JSON lines on stdout, plus counts.json.
/**
 * M28 US4 (research R9, G-M28-RESTORE). Run by `.github/workflows/backup-ddb.yml` (private repo only), which pipes stdout to `age`.
 *
 *   cd apps/api && npx tsx scripts/backup-scan.ts --env sm --aws --counts counts.json | age -r "$RECIPIENT" -o backup.jsonl.gz.age
 *   (a local rehearsal: DDB_ENDPOINT=http://localhost:8000 npx tsx scripts/backup-scan.ts --env dev --counts counts.json > backup.jsonl.gz)
 *
 * - stdout: gzip of JSON lines, one item a line: {"table":"main"|"events","item":{<DynamoDB AttributeValue map>}}. The raw wire form
 *   (not the DocumentClient's), so a restore writes back exactly what was read; a Binary value is {"$b64":"…"}.
 * - `--counts <file>`: counts.json = items per table and per item type `t` (an item without `t` counts as "(none)").
 * - stderr: the same counts, never an item or an attribute value. Exit 0 when the Scan finished; 1 on any error; 2 on usage.
 * - 4 segments by default (`--segments`), eventually consistent reads (half the cost; the nightly copy is not a transaction).
 * - cache is not backed up: it is rebuilt from the Apple and publisher feeds (data-model.md).
 * - `--aws` is required for a real AWS endpoint (the client refuses AWS otherwise, as everywhere else).
 * - `--main <table> --events <table>` name other tables (a restored copy, e.g. `reh1_main`) when counting them: docs/runbooks/recovery.md.
 */
import { writeFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import type { Writable } from 'node:stream';
import { ScanCommand, type AttributeValue, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createDdbClients } from '../src/db/ddb/client.ts';

export const BACKUP_ROLES = ['main', 'events'] as const;
export type BackupRole = (typeof BACKUP_ROLES)[number];
export type Counts = { env: string; at: string; tables: Record<BackupRole, number>; byType: Record<BackupRole, Record<string, number>> };
export type Item = Record<string, AttributeValue>;

/** JSON text of one AttributeValue map; Binary and BinarySet members become {"$b64": …} (a Uint8Array has no JSON form of its own). */
export function encodeItem(item: Item): string {
  return JSON.stringify(item, (_k, v: unknown) => (v instanceof Uint8Array ? { $b64: Buffer.from(v).toString('base64') } : v));
}

/** The inverse for one backup line: {"$b64": …} back to a Uint8Array. */
export function decodeLine(line: string): { table: BackupRole; item: Item } {
  return JSON.parse(line, (_k, v: unknown) => {
    if (v && typeof v === 'object' && typeof (v as { $b64?: unknown }).$b64 === 'string') return new Uint8Array(Buffer.from((v as { $b64: string }).$b64, 'base64'));
    return v;
  }) as { table: BackupRole; item: Item };
}

export const typeOf = (item: Item): string => item['t']?.S ?? '(none)';

export type BackupOpts = {
  raw: DynamoDBClient;
  env: string;
  /** Table names by role; default `<env>-main`, `<env>-events`. */
  tables?: Record<BackupRole, string>;
  /** Where the (uncompressed) JSON lines go; the caller gzips. */
  out: Pick<Writable, 'write'>;
  segments?: number;
  now?: () => Date;
};

/** Scans both tables, writes the lines, returns the counts. Each segment pages with ExclusiveStartKey; the SDK retries throttling. */
export async function runBackup(o: BackupOpts): Promise<Counts> {
  const segments = o.segments ?? 4;
  const tables = o.tables ?? { main: `${o.env}-main`, events: `${o.env}-events` };
  const counts: Counts = { env: o.env, at: (o.now?.() ?? new Date()).toISOString(), tables: { main: 0, events: 0 }, byType: { main: {}, events: {} } };
  for (const role of BACKUP_ROLES) {
    await Promise.all(Array.from({ length: segments }, async (_, segment) => {
      let start: Item | undefined;
      do {
        const page = await o.raw.send(new ScanCommand({ TableName: tables[role], Segment: segment, TotalSegments: segments, ...(start ? { ExclusiveStartKey: start } : {}) }));
        for (const item of page.Items ?? []) {
          o.out.write(`{"table":"${role}","item":${encodeItem(item)}}\n`);
          counts.tables[role]++;
          const t = typeOf(item);
          counts.byType[role][t] = (counts.byType[role][t] ?? 0) + 1;
        }
        start = page.LastEvaluatedKey;
      } while (start);
    }));
  }
  return counts;
}

/** The counts for the log: numbers and type names only. */
export function summarise(c: Counts): string {
  return BACKUP_ROLES.map((r) => `${r}: ${c.tables[r]} items (${Object.entries(c.byType[r]).sort().map(([t, n]) => `${t} ${n}`).join(', ') || 'none'})`).join('\n');
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]): Promise<number> {
  const env = arg(argv, '--env');
  if (!env || !/^[a-z][a-z0-9-]*$/.test(env)) { console.error('usage: backup-scan.ts --env <sm|stg|…> [--aws] [--counts counts.json] [--segments 4] [--main t --events t] > backup.jsonl.gz'); return 2; }
  const segments = Number(arg(argv, '--segments') ?? 4);
  if (!Number.isInteger(segments) || segments < 1 || segments > 16) { console.error('--segments must be 1 to 16'); return 2; }
  const named = { main: arg(argv, '--main') ?? `${env}-main`, events: arg(argv, '--events') ?? `${env}-events` };
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(named.main) || !/^[A-Za-z0-9_.-]{3,255}$/.test(named.events)) { console.error('--main / --events must be DynamoDB table names'); return 2; }
  const clients = createDdbClients({ allowAws: argv.includes('--aws') });
  const gzip = createGzip();
  gzip.pipe(process.stdout);
  const flushed = new Promise<void>((res, rej) => { process.stdout.on('error', rej); gzip.on('error', rej); gzip.on('end', res); });
  try {
    const counts = await runBackup({ raw: clients.raw, env, tables: named, segments, out: gzip });
    gzip.end();
    await flushed;
    const file = arg(argv, '--counts');
    if (file) writeFileSync(file, JSON.stringify(counts, null, 2) + '\n');
    console.error(summarise(counts));
    return 0;
  } catch (e) {
    console.error(`backup failed: ${(e as Error).name}`); // the name only: a message can carry a table ARN or a key
    return 1;
  } finally {
    clients.raw.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
