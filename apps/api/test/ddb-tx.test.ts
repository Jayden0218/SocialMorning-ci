// Tests transactions on DynamoDB Local: the 100-item limit (guard G-M26-1), cancellation reasons, uniqueness, conflicts, sequences.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb transactions (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { encode } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { get } = await import('../src/db/ddb/store.ts');
  const { tx, MAX_TX_ITEMS, TxTooLargeError, TxCancelled, TxDuplicateKeyError } = await import('../src/db/ddb/tx.ts');
  const { claimUnique, uniqueOwner, moveUnique } = await import('../src/db/ddb/unique.ts');
  const { withRetry, isConflict, isConditionFailed, withVersionRetry } = await import('../src/db/ddb/retry.ts');
  const { withConflicts } = await import('../src/db/ddb/test-wrappers.ts');
  const { nextSeq, readSeq, seqTxUpdate } = await import('../src/db/ddb/seq.ts');
  const { queryAll } = await import('../src/db/ddb/paginate.ts');

  const cfg = (i: number) => encode('config', K.config(`n${i}`), { i });

  test('G-M26-1: a 100-item transaction commits; a 101-item one is refused before it is sent and writes nothing', async () => {
    const s = await freshStore();
    assert.equal(MAX_TX_ITEMS, 100);
    const ok = tx(s.store);
    for (let i = 0; i < 100; i++) ok.put('main', cfg(i));
    await ok.commit();
    assert.ok(await get(s.store, 'main', K.config('n99')));

    let sent = 0;
    const counting = { ...s.store, send: (c: { input: object }) => { sent++; return s.store.send(c); } };
    const big = tx(counting);
    for (let i = 100; i < 201; i++) big.put('main', cfg(i));
    assert.equal(big.size, 101);
    await assert.rejects(big.commit(), (e: unknown) => e instanceof TxTooLargeError && e.count === 101);
    assert.equal(sent, 0, 'nothing reached DynamoDB');
    assert.equal(await get(s.store, 'main', K.config('n100')), undefined);
    await s.close();
  });

  test('two actions on one item are refused locally (DynamoDB would cancel the whole transaction)', async () => {
    const s = await freshStore();
    const t = tx(s.store).put('main', cfg(1)).update('main', K.config('n1'), { update: 'SET i = :i', values: { ':i': 2 } });
    await assert.rejects(t.commit(), TxDuplicateKeyError);
    await s.close();
  });

  test('a cancelled transaction names the failed item by label; the others report None; nothing is written', async () => {
    const s = await freshStore();
    await tx(s.store).put('main', cfg(2)).commit();
    const t = tx(s.store)
      .put('main', cfg(1), { label: 'first' })
      .put('main', cfg(2), { condition: 'attribute_not_exists(PK)', label: 'second' });
    const err = await t.commit().then(() => undefined, (e: unknown) => e);
    assert.ok(err instanceof TxCancelled, String(err));
    assert.deepEqual(err.reasons.map((r) => r.code), ['None', 'ConditionalCheckFailed']);
    assert.ok(err.failed('second'));
    assert.ok(!err.failed('first'));
    assert.ok(isConditionFailed(err));
    assert.equal(await get(s.store, 'main', K.config('n1')), undefined, 'all or nothing');
    await s.close();
  });

  test('uniqueness: a second claim of the same email cancels; a move frees the old value', async () => {
    const s = await freshStore();
    await claimUnique(tx(s.store), K.U.email('A@Example.com'), 'L1').commit();
    assert.equal(await uniqueOwner(s.store, K.U.email('a@example.com')), 'L1');
    const err = await claimUnique(tx(s.store), K.U.email('a@example.com'), 'L2').commit().then(() => undefined, (e: unknown) => e);
    assert.ok(err instanceof TxCancelled && err.failed('unique:EMAIL'));
    await moveUnique(tx(s.store), K.U.email('a@example.com'), K.U.email('b@example.com'), 'L1').commit();
    assert.equal(await uniqueOwner(s.store, K.U.email('a@example.com')), undefined);
    assert.equal(await uniqueOwner(s.store, K.U.email('b@example.com')), 'L1');
    await s.close();
  });

  test('conflict injection: a cancelled-by-conflict transaction is retried and succeeds; retries stop after 3', async () => {
    const s = await freshStore();
    const once = withConflicts(s.store, (n) => n === 1);
    let attempts = 0;
    await withRetry(async () => { attempts++; await tx(once).put('main', cfg(7)).commit(); });
    assert.equal(attempts, 2);
    assert.equal(once.cancelled(), 1);
    assert.ok(await get(s.store, 'main', K.config('n7')));

    const always = withConflicts(s.store, () => true);
    let tries = 0;
    const err = await withRetry(async () => { tries++; await tx(always).put('main', cfg(8)).commit(); }, { baseMs: 1 }).then(() => undefined, (e: unknown) => e);
    assert.equal(tries, 3);
    assert.ok(isConflict(err));
    assert.ok(err instanceof TxCancelled && err.conflict && err.reasons[0]?.code === 'TransactionConflict' && err.reasons.length === 1);
    await s.close();
  });

  test('sequences: nextSeq issues increasing numbers; an in-transaction id uses a version check and retries on a race', async () => {
    const s = await freshStore();
    assert.equal(await nextSeq(s.store, 'chat'), 1);
    assert.equal(await nextSeq(s.store, 'chat', 3), 2);
    assert.equal(await readSeq(s.store, 'chat'), 4);

    const write = async () => withVersionRetry(async () => {
      const seen = await readSeq(s.store, 'audit');
      const id = seen + 1;
      const t = tx(s.store).put('main', encode('audit', K.audit('2026-10-10T00:00:00Z', id), { id }), { condition: 'attribute_not_exists(PK)' });
      seqTxUpdate(t, 'audit', seen);
      await t.commit();
      return id;
    }, { tries: 10, baseMs: 1 });
    const ids = await Promise.all([write(), write(), write(), write()]);
    assert.deepEqual([...ids].sort((a, b) => a - b), [1, 2, 3, 4], 'no duplicates, no gaps');
    const { items } = await queryAll(s.store, 'main', { KeyConditionExpression: 'PK = :p', ExpressionAttributeValues: { ':p': 'AUDIT#2026-10' } });
    assert.equal(items.length, 4);
    assert.deepEqual(items.map((i) => i['id']), [1, 2, 3, 4], 'padded keys sort as numbers');
    await s.close();
  });
}
