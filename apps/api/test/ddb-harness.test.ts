// Tests the DynamoDB test harness: a per-test table set from infra/tables.yaml, every index usable, dropped at close.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb harness (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { DescribeTableCommand, ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
  const { createDdbClients, isLocalEndpoint } = await import('../src/db/ddb/client.ts');
  const { tableDefs } = await import('../src/db/ddb/schema.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const { put, get, queryPage } = await import('../src/db/ddb/store.ts');
  const K = await import('../src/db/ddb/keys.ts');

  test('the client refuses real AWS: a non-local endpoint, or no endpoint, without allowAws', () => {
    assert.throws(() => createDdbClients({ endpoint: 'https://dynamodb.ap-southeast-1.amazonaws.com' }), /not local/);
    assert.throws(() => createDdbClients({ endpoint: '' }), /allowAws/);
    assert.equal(isLocalEndpoint('http://localhost:8000'), true);
    assert.equal(isLocalEndpoint('https://dynamodb.us-east-1.amazonaws.com'), false);
  });

  test('freshStore makes main/events/cache from infra/tables.yaml with the six GSIs + E1, and drops them at close', async () => {
    const started = Date.now();
    const s = await freshStore();
    const createdMs = Date.now() - started;
    const { raw } = createDdbClients();
    const main = await raw.send(new DescribeTableCommand({ TableName: s.tables.main }));
    assert.deepEqual(main.Table?.GlobalSecondaryIndexes?.map((g) => g.IndexName).sort(), ['GSI1', 'GSI2', 'GSI3', 'GSI4', 'GSI5', 'GSI6']);
    const events = await raw.send(new DescribeTableCommand({ TableName: s.tables.events }));
    assert.deepEqual(events.Table?.GlobalSecondaryIndexes?.map((g) => g.IndexName), ['EV1']);
    const cache = await raw.send(new DescribeTableCommand({ TableName: s.tables.cache }));
    assert.equal(cache.Table?.GlobalSecondaryIndexes, undefined);
    assert.equal(Object.keys(tableDefs()).length, 3);

    // Every GSI answers a query for an item that carries its key.
    const gsi = { G1PK: 'AUTH#a', G1SK: 'comment#1', G2PK: 'SHEPS#x', G2SK: '1', G3PK: 'GENREEPS#1', G3SK: '1', G4PK: 'Q#t', G4SK: '1', G5PK: 'REF#r#1', G5SK: '1', G6PK: 'NAME#al', G6SK: 'a' };
    await put(s.store, 'main', encode('episode', K.episode('e1'), { title: 'T' }, { gsi }));
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const out = await queryPage(s.store, 'main', { IndexName: `GSI${n}`, KeyConditionExpression: '#p = :p', ExpressionAttributeNames: { '#p': `G${n}PK` }, ExpressionAttributeValues: { ':p': gsi[`G${n}PK` as keyof typeof gsi] } });
      assert.equal(out.Items?.length, 1, `G${n} finds the item`);
    }
    await put(s.store, 'events', encode('dailyActive', K.ev.dailyActive('2026-10-10', 'a'), {}, { gsi: K.E1('2026-10-10', 'da', 'a') }));
    const e1 = await queryPage(s.store, 'events', { IndexName: 'EV1', KeyConditionExpression: 'E1PK = :p', ExpressionAttributeValues: { ':p': 'DAY#2026-10-10' } });
    assert.equal(e1.Items?.length, 1);
    assert.ok(await get(s.store, 'main', K.episode('e1')));

    await s.close();
    const left = await raw.send(new ListTablesCommand({}));
    assert.ok(!(left.TableNames ?? []).some((n) => n.startsWith(s.tables.main.replace(/_main$/, ''))), 'the set is dropped');
    raw.destroy();
    console.log(`ddb harness: table set created in ${createdMs} ms`);
  });

  test('two table sets are independent (per-test isolation)', async () => {
    const a = await freshStore();
    const b = await freshStore();
    await put(a.store, 'main', encode('config', K.config('x'), { v: 1 }));
    assert.ok(await get(a.store, 'main', K.config('x')));
    assert.equal(await get(b.store, 'main', K.config('x')), undefined);
    await a.close();
    await b.close();
  });
}
