// G-M28-RESTORE: a backup made from DynamoDB Local, encrypted with a test age key, restores into a second table set with equal counts per item type.
/**
 * M28 US4 (research R9). The test generates its OWN age key pair (never the owner's), seeds a table set, runs the backup scan
 * (scripts/backup-scan.ts) to JSON lines, gzips and encrypts them, then runs the restore (scripts/restore-backup.ts) into another
 * table set. Counts per table and per item type `t` must be equal, and so must every item (a Binary and a Number Set included).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('G-M28-RESTORE (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const age = await import('age-encryption');
  const { PutItemCommand, ScanCommand } = await import('@aws-sdk/client-dynamodb');
  const { freshStore } = await import('./harness.ts');
  const { createDdbClients } = await import('../src/db/ddb/client.ts');
  const { createTableSet, deleteTableSet } = await import('../src/db/ddb/schema.ts');
  const { prefixedTables } = await import('../src/db/ddb/store.ts');
  const { put } = await import('../src/db/ddb/store.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { runBackup, encodeItem } = await import('../scripts/backup-scan.ts');
  const { restoreBackup, countRestored, diffCounts, identityFrom } = await import('../scripts/restore-backup.ts');
  type Item = Record<string, import('@aws-sdk/client-dynamodb').AttributeValue>;

  const clients = createDdbClients();
  const PREFIX = `m28rst${process.pid}`;
  const scriptDir = fileURLToPath(new URL('../scripts/', import.meta.url));

  /** Seeds main (three item types, enough to need several pages and batches) and events (one type), plus two raw items the codec never writes. */
  async function seed() {
    const s = await freshStore();
    for (let i = 0; i < 70; i++) await put(s.store, 'main', encode('episode', K.episode(`e${i}`), { title: `T${i}` }));
    for (let i = 0; i < 31; i++) await put(s.store, 'main', encode('config', K.config(`c${i}`), { v: i }));
    for (let i = 0; i < 9; i++) await put(s.store, 'events', encode('dailyActive', K.ev.dailyActive('2026-10-10', `l${i}`), {}));
    // A Binary and a Number Set, and an item with no `t`: the backup keeps the wire form and counts the last as "(none)".
    await clients.raw.send(new PutItemCommand({ TableName: s.tables.main, Item: { PK: { S: 'RAW#1' }, SK: { S: 'V' }, t: { S: 'rawThing' }, blob: { B: Uint8Array.from([0, 1, 2, 255]) }, nums: { NS: ['1', '2.5'] } } }));
    await clients.raw.send(new PutItemCommand({ TableName: s.tables.events, Item: { PK: { S: 'RAW#2' }, SK: { S: 'V' } } }));
    return s;
  }

  async function dump(table: string): Promise<string[]> {
    const out: string[] = [];
    let start: Item | undefined;
    do {
      const page = await clients.raw.send(new ScanCommand({ TableName: table, ...(start ? { ExclusiveStartKey: start } : {}) }));
      for (const it of page.Items ?? []) out.push(encodeItem(it as Item));
      start = page.LastEvaluatedKey as Item | undefined;
    } while (start);
    return out.sort();
  }

  /** The backup the workflow makes: scan → JSON lines → gzip → age. */
  async function backupEncrypted(tables: { main: string; events: string }, recipient: string) {
    const lines: string[] = [];
    const counts = await runBackup({ raw: clients.raw, env: 'test', tables, out: { write: (l: string) => { lines.push(l); return true; } } });
    const e = new age.Encrypter();
    e.addRecipient(recipient);
    return { counts, encrypted: await e.encrypt(gzipSync(Buffer.from(lines.join('')))) };
  }

  test('a backup of a seeded table set, encrypted with a test key, restores into a second set with equal counts per item type and equal items', async () => {
    const s = await seed();
    const second = prefixedTables(PREFIX);
    try {
      const identity = await age.generateIdentity();
      const { counts, encrypted } = await backupEncrypted(s.tables, await age.identityToRecipient(identity));
      assert.deepEqual(counts.tables, { main: 102, events: 10 });
      assert.deepEqual(counts.byType.main, { episode: 70, config: 31, rawThing: 1 });
      assert.deepEqual(counts.byType.events, { dailyActive: 9, '(none)': 1 });

      const written = await restoreBackup({ raw: clients.raw, encrypted, identity, tables: second });
      assert.deepEqual(written, { main: 102, events: 10 });
      const got = await countRestored(clients.raw, second);
      assert.deepEqual(diffCounts(counts, got), [], 'counts per table and per item type are equal');
      assert.deepEqual(await dump(second.main), await dump(s.tables.main), 'every main item is equal, Binary and Number Set included');
      assert.deepEqual(await dump(second.events), await dump(s.tables.events), 'every events item is equal');
    } finally {
      await deleteTableSet(clients.raw, second);
      await s.close();
    }
  });

  test('a different key cannot open the backup, and a table set that already exists is refused', async () => {
    const s = await seed();
    const second = prefixedTables(`${PREFIX}b`);
    try {
      const owner = await age.generateIdentity();
      const { encrypted } = await backupEncrypted(s.tables, await age.identityToRecipient(owner));
      const stranger = await age.generateIdentity();
      await assert.rejects(restoreBackup({ raw: clients.raw, encrypted, identity: stranger, tables: second }), /no identity matched|decrypt/i);
      await deleteTableSet(clients.raw, second);
      await restoreBackup({ raw: clients.raw, encrypted, identity: owner, tables: second });
      await assert.rejects(restoreBackup({ raw: clients.raw, encrypted, identity: owner, tables: second }), /ResourceInUse|already exists|preexisting/i);
    } finally {
      await deleteTableSet(clients.raw, second);
      await s.close();
    }
  });

  test('diffCounts names every difference, per table and per type, and is empty only when equal', () => {
    const a = { tables: { main: 3, events: 1 }, byType: { main: { x: 2, y: 1 }, events: { z: 1 } } };
    assert.deepEqual(diffCounts(a, structuredClone(a)), []);
    const b = { tables: { main: 2, events: 1 }, byType: { main: { x: 2 }, events: { z: 1 } } };
    assert.deepEqual(diffCounts(a, b), ['main: expected 3 items, restored 2', 'main y: expected 1, restored 0']);
  });

  test('identityFrom takes the secret line of an age-keygen file and never accepts a file without one', () => {
    assert.equal(identityFrom('# created: x\n# public key: age1abc\nAGE-SECRET-KEY-1ABC\n'), 'AGE-SECRET-KEY-1ABC');
    assert.throws(() => identityFrom('age1abc'), /no AGE-SECRET-KEY/);
  });

  test('the command line: backup-scan.ts writes gzip JSON lines to stdout and counts.json, and the restore opens a file the age binary wrote', async () => {
    const s = await seed();
    const dir = mkdtempSync(join(tmpdir(), 'm28-restore-'));
    try {
      // The scan reads <env>-main / <env>-events, so copy the seeded items into tables of that name.
      const named = { main: `${PREFIX}c-main`, events: `${PREFIX}c-events`, cache: `${PREFIX}c-cache` };
      await createTableSet(clients.raw, named);
      try {
        const from = await runBackup({ raw: clients.raw, env: 'x', tables: s.tables, out: { write: () => true } });
        for (const role of ['main', 'events'] as const) {
          for (const line of await dump(s.tables[role])) {
            const item = JSON.parse(line, (_k, v) => (v && typeof v === 'object' && typeof v.$b64 === 'string' ? Uint8Array.from(Buffer.from(v.$b64, 'base64')) : v)) as Item;
            await clients.raw.send(new PutItemCommand({ TableName: named[role], Item: item }));
          }
        }
        const countsFile = join(dir, 'counts.json');
        const r = spawnSync(process.execPath, ['--import', 'tsx', join(scriptDir, 'backup-scan.ts'), '--env', `${PREFIX}c`, '--counts', countsFile], { env: { ...process.env, DDB_ENDPOINT: process.env['DDB_ENDPOINT']! }, maxBuffer: 64 << 20 });
        assert.equal(r.status, 0, `backup-scan exit ${r.status}: ${r.stderr}`);
        const lines = gunzipSync(r.stdout).toString('utf8').split('\n').filter(Boolean);
        assert.equal(lines.length, from.tables.main + from.tables.events);
        assert.match(String(r.stderr), /main: 102 items \(config 31, episode 70, rawThing 1\)/);
        assert.deepEqual(JSON.parse((await import('node:fs')).readFileSync(countsFile, 'utf8')).tables, { main: 102, events: 10 });
        assert.ok(!String(r.stderr).includes('Title') && !String(r.stderr).includes('T1'), 'no item value on stderr');

        // Interop: the real age binary (when installed) writes the file that the restore opens.
        const have = spawnSync('age', ['--version']);
        if (have.status === 0) {
          const identity = await age.generateIdentity();
          const recipient = await age.identityToRecipient(identity);
          const keyFile = join(dir, 'key.txt');
          writeFileSync(keyFile, `# test key\n${identity}\n`, { mode: 0o600 });
          const viaBinary = spawnSync('age', ['--encrypt', '--recipient', recipient], { input: r.stdout, maxBuffer: 64 << 20 });
          assert.equal(viaBinary.status, 0);
          const second = prefixedTables(`${PREFIX}d`);
          try {
            await restoreBackup({ raw: clients.raw, encrypted: viaBinary.stdout, identity, tables: second });
            assert.deepEqual(diffCounts(JSON.parse((await import('node:fs')).readFileSync(countsFile, 'utf8')), await countRestored(clients.raw, second)), []);
          } finally { await deleteTableSet(clients.raw, second); }

          // The owner's command: restore-backup.ts with a key FILE and the counts.json; exit 0 when equal, 1 when counts.json disagrees.
          const encFile = join(dir, 'backup.jsonl.gz.age');
          writeFileSync(encFile, viaBinary.stdout);
          const runRestore = (prefix: string, counts: string) => spawnSync(process.execPath, ['--import', 'tsx', join(scriptDir, 'restore-backup.ts'), '--file', encFile, '--identity', keyFile, '--counts', counts, '--prefix', prefix], { env: { ...process.env, DDB_ENDPOINT: process.env['DDB_ENDPOINT']! }, maxBuffer: 64 << 20 });
          const cliSet = prefixedTables(`${PREFIX}e`);
          try {
            const ok = runRestore(`${PREFIX}e`, countsFile);
            assert.equal(ok.status, 0, `restore-backup exit ${ok.status}: ${ok.stdout.toString()}${ok.stderr.toString()}`);
            assert.match(String(ok.stdout), /counts equal counts\.json/);
            assert.match(String(ok.stdout), /main: 102 items \(config 31, episode 70, rawThing 1\)/);
            assert.ok(!(String(ok.stdout) + String(ok.stderr)).includes('AGE-SECRET-KEY'), 'the key is never printed');
          } finally { await deleteTableSet(clients.raw, cliSet); }
          const wrong = JSON.parse((await import('node:fs')).readFileSync(countsFile, 'utf8'));
          wrong.byType.main.episode = 71; wrong.tables.main = 103;
          const wrongFile = join(dir, 'wrong.json');
          writeFileSync(wrongFile, JSON.stringify(wrong));
          const cliSet2 = prefixedTables(`${PREFIX}f`);
          try {
            const bad = runRestore(`${PREFIX}f`, wrongFile);
            assert.equal(bad.status, 1, `restore-backup exit ${bad.status}: ${bad.stdout.toString()}${bad.stderr.toString()}`);
            assert.match(String(bad.stdout), /DIFFERENT main episode: expected 71, restored 70/);
          } finally { await deleteTableSet(clients.raw, cliSet2); }
        }
      } finally { await deleteTableSet(clients.raw, named); }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await s.close();
    }
  });
}
