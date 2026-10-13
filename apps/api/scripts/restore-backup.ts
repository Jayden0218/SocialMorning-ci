// The owner's restore check: decrypt a nightly backup, load it into DynamoDB Local, print counts, compare with counts.json.
/**
 * M28 US4 (research R9, G-M28-RESTORE). Run on the OWNER'S machine, against DynamoDB Local only (the client refuses real AWS here).
 *
 *   scripts/ddb-local.sh                                        # starts DynamoDB Local on :8000
 *   cd apps/api && DDB_ENDPOINT=http://localhost:8000 npx tsx scripts/restore-backup.ts \
 *       --file backup.jsonl.gz.age --identity ~/.socialmorning/backup-key.txt --counts counts.json [--prefix restore]
 *
 * - `--identity`: the age identity file (age-keygen output). Its path is the only thing this script takes; the key is read into memory,
 *   used to decrypt, and never printed. Claude never runs this against the owner's key.
 * - Decrypts as a stream with the `age-encryption` package (the same format the `age` binary writes in backup-ddb.yml), gunzips, and
 *   writes 25 items at a time into `<prefix>_main` and `<prefix>_events`, created from infra/tables.yaml. Existing tables: refused.
 * - Then Scans the restored tables, prints counts per table and per item type `t`, and compares them with `--counts`.
 *   Exit 0 = equal; 1 = a difference (each printed); 2 = usage or a start error.
 * - Prints counts and type names only; never an item.
 */
import { createReadStream, readFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { BatchWriteItemCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Decrypter } from 'age-encryption';
import { createDdbClients } from '../src/db/ddb/client.ts';
import { createTableSet } from '../src/db/ddb/schema.ts';
import { prefixedTables, type Tables } from '../src/db/ddb/store.ts';
import { BACKUP_ROLES, decodeLine, runBackup, summarise, type BackupRole, type Counts, type Item } from './backup-scan.ts';

/** The secret key line of an age-keygen file (`AGE-SECRET-KEY-1…`); comments are skipped. Throws without echoing the file. */
export function identityFrom(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.startsWith('AGE-SECRET-KEY-'));
  if (!line) throw new Error('no AGE-SECRET-KEY line in the identity file');
  return line;
}

/** Plain-text lines of a decrypted, gunzipped backup stream. */
export async function* backupLines(encrypted: Readable | Uint8Array, identity: string): AsyncGenerator<{ table: BackupRole; item: Item }> {
  const d = new Decrypter();
  d.addIdentity(identity);
  const input = encrypted instanceof Uint8Array ? Readable.from([encrypted]) : encrypted;
  const plain = await d.decrypt(Readable.toWeb(input) as ReadableStream<Uint8Array>);
  const lines = createInterface({ input: Readable.fromWeb(plain as import('node:stream/web').ReadableStream<Uint8Array>).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const parsed = decodeLine(line);
    if (!BACKUP_ROLES.includes(parsed.table)) throw new Error(`unknown table role in the backup: ${String(parsed.table)}`);
    yield parsed;
  }
}

/** BatchWriteItem with the unprocessed items retried. */
async function writeBatch(raw: DynamoDBClient, table: string, items: Item[]): Promise<void> {
  let pending: Item[] = items;
  for (let attempt = 0; pending.length; attempt++) {
    if (attempt > 8) throw new Error(`restore: ${pending.length} items still unprocessed after 8 tries`);
    if (attempt) await new Promise((r) => setTimeout(r, Math.min(2000, 50 * 2 ** attempt)));
    const out = await raw.send(new BatchWriteItemCommand({ RequestItems: { [table]: pending.map((Item) => ({ PutRequest: { Item } })) } }));
    pending = (out.UnprocessedItems?.[table] ?? []).map((r) => r.PutRequest!.Item!);
  }
}

export type RestoreOpts = { raw: DynamoDBClient; encrypted: Readable | Uint8Array; identity: string; tables: Tables };

/** Creates the table set, loads every item, returns how many items were written per table. */
export async function restoreBackup(o: RestoreOpts): Promise<Record<BackupRole, number>> {
  await createTableSet(o.raw, o.tables);
  const written: Record<BackupRole, number> = { main: 0, events: 0 };
  const buf: Record<BackupRole, Item[]> = { main: [], events: [] };
  const flush = async (role: BackupRole) => {
    const items = buf[role].splice(0);
    if (items.length) { await writeBatch(o.raw, o.tables[role], items); written[role] += items.length; }
  };
  for await (const { table, item } of backupLines(o.encrypted, o.identity)) {
    buf[table].push(item);
    if (buf[table].length === 25) await flush(table);
  }
  for (const role of BACKUP_ROLES) await flush(role);
  return written;
}

/** Counts of the restored tables, by the same code that counted the backup. */
export async function countRestored(raw: DynamoDBClient, tables: Tables, env = 'restore'): Promise<Counts> {
  return runBackup({ raw, env, tables: { main: tables.main, events: tables.events }, out: { write: () => true } });
}

/** Every difference between the backup's counts and the restored counts, one string each; empty when equal. */
export function diffCounts(expected: Pick<Counts, 'tables' | 'byType'>, got: Pick<Counts, 'tables' | 'byType'>): string[] {
  const out: string[] = [];
  for (const role of BACKUP_ROLES) {
    if (expected.tables[role] !== got.tables[role]) out.push(`${role}: expected ${expected.tables[role]} items, restored ${got.tables[role]}`);
    for (const t of new Set([...Object.keys(expected.byType[role]), ...Object.keys(got.byType[role])])) {
      const a = expected.byType[role][t] ?? 0;
      const b = got.byType[role][t] ?? 0;
      if (a !== b) out.push(`${role} ${t}: expected ${a}, restored ${b}`);
    }
  }
  return out;
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]): Promise<number> {
  const file = arg(argv, '--file');
  const idFile = arg(argv, '--identity');
  const countsFile = arg(argv, '--counts');
  const prefix = arg(argv, '--prefix') ?? 'restore';
  if (!file || !idFile || !countsFile || !/^[A-Za-z][A-Za-z0-9_]*$/.test(prefix)) {
    console.error('usage: DDB_ENDPOINT=http://localhost:8000 restore-backup.ts --file <backup.jsonl.gz.age> --identity <age key file> --counts <counts.json> [--prefix restore]');
    return 2;
  }
  if (!process.env['DDB_ENDPOINT']) { console.error('DDB_ENDPOINT is not set: this script restores into DynamoDB Local only (scripts/ddb-local.sh)'); return 2; }
  let expected: Counts;
  let identity: string;
  try {
    expected = JSON.parse(readFileSync(countsFile, 'utf8')) as Counts;
    identity = identityFrom(readFileSync(idFile, 'utf8'));
  } catch (e) { console.error(`cannot read the inputs: ${(e as Error).message}`); return 2; }
  const clients = createDdbClients(); // no allowAws: a non-local endpoint is refused
  const tables = prefixedTables(prefix);
  try {
    await restoreBackup({ raw: clients.raw, encrypted: createReadStream(file), identity, tables });
    const got = await countRestored(clients.raw, tables);
    console.log(`restored into ${tables.main} and ${tables.events}`);
    console.log(summarise(got));
    const diffs = diffCounts(expected, got);
    if (diffs.length) { for (const d of diffs) console.log(`DIFFERENT ${d}`); console.log(`${diffs.length} difference(s): the restore does NOT match counts.json`); return 1; }
    console.log('counts equal counts.json');
    return 0;
  } catch (e) {
    console.error(`restore failed: ${(e as Error).name}: ${(e as Error).message.slice(0, 200)}`);
    return 2;
  } finally {
    clients.raw.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
