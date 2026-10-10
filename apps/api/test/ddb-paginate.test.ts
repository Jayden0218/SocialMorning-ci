// Tests paging on DynamoDB Local: lists cross the 1 MB page (guard G-M26-2), filtered pages, resume keys, cursors, GSI lag, faults.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb paging (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { put, get, queryPage } = await import('../src/db/ddb/store.ts');
  const { queryAll, countAll } = await import('../src/db/ddb/paginate.ts');
  const { batchWriteAll, batchGetAll } = await import('../src/db/ddb/batch.ts');
  const { encodeCursor, decodeCursor } = await import('../src/db/ddb/cursor.ts');
  const { withGsiLag, withFaults } = await import('../src/db/ddb/test-wrappers.ts');

  const PAD = 'x'.repeat(100_000); // ~100 KB per item: 12 items ≈ 1.2 MB, more than one 1 MB page
  async function bigPartition(store: Parameters<typeof put>[0], n: number) {
    // Lane SC: the comment type is strict now (codec.ts), so these test-only rows are typed `config` (an open type) at comment keys.
    await batchWriteAll(store, 'main', Array.from({ length: n }, (_, i) => ({
      put: encode('config', K.comment('ep1', `2026-10-10T00:00:${String(i).padStart(2, '0')}.000Z`, `c${i}`), { n: i, pad: PAD, keep: i >= n - 2 }),
    })));
  }
  const byEpisode = { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :c)', ExpressionAttributeValues: { ':pk': 'EP#ep1', ':c': 'C#' }, ConsistentRead: true };

  test('G-M26-2: a list bigger than 1 MB comes back whole; one raw Query stops at the 1 MB page', async () => {
    const s = await freshStore();
    await bigPartition(s.store, 12);
    const one = await queryPage(s.store, 'main', byEpisode);
    assert.ok((one.Items?.length ?? 0) < 12, `one page holds fewer than 12 (got ${one.Items?.length})`);
    assert.ok(one.LastEvaluatedKey, 'the page says there is more');
    const all = await queryAll(s.store, 'main', byEpisode);
    assert.equal(all.items.length, 12);
    assert.ok(all.pages >= 2);
    assert.deepEqual(all.items.map((i) => i['n']), Array.from({ length: 12 }, (_, i) => i), 'in sort-key order, none twice');
    assert.equal(all.lastKey, undefined);
    assert.equal(await countAll(s.store, 'main', byEpisode), 12);
    await s.close();
  });

  test('G-M26-2: a filter that empties the first 1 MB page still finds the matches after it', async () => {
    const s = await freshStore();
    await bigPartition(s.store, 12);
    const filtered = { ...byEpisode, FilterExpression: '#k = :t', ExpressionAttributeNames: { '#k': 'keep' }, ExpressionAttributeValues: { ...byEpisode.ExpressionAttributeValues, ':t': true } };
    // On AWS the 1 MB cap applies BEFORE the filter (Query.Pagination.html). DynamoDB Local applied it after the
    // filter here (run 37997674553: the first filtered page held both matches), so the empty page is made with
    // `Limit`, which caps the items read before the filter on both.
    const first = await queryPage(s.store, 'main', { ...filtered, Limit: 3 });
    assert.equal(first.Items?.length, 0, 'the first page is empty after the filter');
    assert.ok(first.LastEvaluatedKey);
    const paged = await queryAll(s.store, 'main', { ...filtered, Limit: 3 });
    assert.deepEqual(paged.items.map((i) => i['n']), [10, 11], 'the loop goes past empty pages');
    assert.ok(paged.pages >= 4);
    const all = await queryAll(s.store, 'main', filtered);
    assert.deepEqual(all.items.map((i) => i['n']), [10, 11]);
    await s.close();
  });

  test('max stops inside a page and resumes after the last RETURNED item (no item skipped or repeated)', async () => {
    const s = await freshStore();
    await batchWriteAll(s.store, 'main', Array.from({ length: 30 }, (_, i) => ({ put: encode('notification', K.notification('L1', `2026-10-10T00:00:${String(i).padStart(2, '0')}.000Z`, `n${i}`), { id: i }) }))); // lane SG: notification is a strict type (id is allowed)
    const q = { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': 'L#L1' }, ConsistentRead: true };
    const seen: number[] = [];
    let start: Record<string, unknown> | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await queryAll(s.store, 'main', { ...q, ...(start ? { ExclusiveStartKey: start } : {}) }, { max: 7, keep: (it) => Number(it['id']) % 2 === 0 });
      seen.push(...r.items.map((i) => Number(i['id'])));
      if (!r.lastKey) break;
      start = r.lastKey;
    }
    assert.deepEqual(seen, Array.from({ length: 15 }, (_, i) => i * 2));
    await s.close();
  });

  test('batch get/write: more than 100 keys and 25 writes are chunked', async () => {
    const s = await freshStore();
    await batchWriteAll(s.store, 'main', Array.from({ length: 130 }, (_, i) => ({ put: encode('config', K.config(`b${i}`), { i }) })));
    const got = await batchGetAll(s.store, 'main', Array.from({ length: 130 }, (_, i) => K.config(`b${i}`)));
    assert.equal(got.length, 130);
    await batchWriteAll(s.store, 'main', Array.from({ length: 130 }, (_, i) => ({ delete: K.config(`b${i}`) })));
    assert.equal((await batchGetAll(s.store, 'main', [K.config('b0'), K.config('b129')])).length, 0);
    await s.close();
  });

  test('cursors: round-trip a resume key; a tampered or foreign cursor is null', () => {
    const key = { PK: 'L#a', SK: 'NOTIF#2026-10-10T00:00:00.000Z#n1', G1PK: 'AUTH#a', n: 3 };
    const c = encodeCursor(key, 'secret');
    assert.deepEqual(decodeCursor(c, 'secret'), key);
    assert.equal(decodeCursor(c, 'other'), null);
    const [body, sig] = c.split('.');
    const forged = Buffer.from(JSON.stringify({ PK: 'L#victim', SK: 'X' })).toString('base64url');
    assert.equal(decodeCursor(`${forged}.${sig}`, 'secret'), null);
    assert.equal(decodeCursor(`${body}`, 'secret'), null);
    assert.equal(decodeCursor('', 'secret'), null);
    assert.equal(decodeCursor('a.b.c', 'secret'), null);
  });

  test('GSI lag wrapper: an own write is invisible on a GSI until settle(); the base table sees it at once', async () => {
    const s = await freshStore();
    const lag = withGsiLag(s.store);
    const item = encode('comment', K.comment('ep9', '2026-10-10T00:00:00Z', 'c1'), { body: 'hi' }, { gsi: K.G1('L1', 'comment', '2026-10-10T00:00:00Z', 'c1') });
    await put(lag, 'main', item);
    const byAuthor = { IndexName: 'GSI1', KeyConditionExpression: 'G1PK = :a', ExpressionAttributeValues: { ':a': 'AUTH#L1' } };
    assert.equal((await queryAll(lag, 'main', byAuthor)).items.length, 0, 'not yet in the index');
    assert.ok(await get(lag, 'main', K.comment('ep9', '2026-10-10T00:00:00Z', 'c1')), 'base table read sees it');
    lag.settle();
    assert.equal((await queryAll(lag, 'main', byAuthor)).items.length, 1);
    await s.close();
  });

  test('fault injection by key prefix: only the matching command and partition fail', async () => {
    const s = await freshStore();
    await put(s.store, 'main', encode('config', K.config('discover_settings'), { a: 1 }));
    await put(s.store, 'main', encode('config', K.config('other'), { a: 1 }));
    const broken = withFaults(s.store, [{ command: 'GetCommand', prefix: 'CFG#discover' }]);
    await assert.rejects(get(broken, 'main', K.config('discover_settings')), /injected fault/);
    assert.ok(await get(broken, 'main', K.config('other')));
    await s.close();
  });
}
