// Guards of the account lane on DynamoDB: one account per email under a race, a deletion that resumes after a crash, one GetItem per authenticated request.
/**
 * M26 lane AC (tasks.md AC-T10). Each guard was broken on mirror branch `lane-ac-red`, seen red, restored:
 * - G-M26-AC1 — two (here ten) sign-ups racing for one email make ONE account: the `U#EMAIL#` item is
 *   claimed with attribute_not_exists in the same transaction as the listener item.
 *   Break: in src/db/repos/account/ddb/listeners.ts createListener, drop the `claimUnique(…)` line.
 * - G-M26-AC2 — a deletion job killed half-way (a fault injected on the listener's partition) finishes on
 *   the next run and leaves no item of the listener, no session, no U#EMAIL, no push-token owner.
 *   Break: in src/db/repos/account/ddb/deletion.ts runDueDeletions, drop the `resumeJobs(…)` line.
 * - G-M26-AC3 — an authenticated request on a warm session costs exactly ONE GetItem (the session item
 *   carries copies of the listener; no listener read, no write).
 *   Break: in src/db/repos/account/ddb/sessions.ts listenerForTokenRows, add `await getListener(h, s.listenerId);`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb account guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp, TEST_PEPPER } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { wrapStore } = await import('../src/db/ddb/store.ts');
  const { withFaults } = await import('../src/db/ddb/test-wrappers.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { createListener } = await import('../src/db/repos/account/listeners.ts');
  const { listenerForToken } = await import('../src/auth/session.ts');
  const { saveToken } = await import('../src/db/repos/account/push.ts');
  const { putQueue } = await import('../src/db/repos/account/queue.ts');
  const { setInterests } = await import('../src/db/repos/account/interests.ts');
  const { runDueDeletions } = await import('../src/db/repos/account/deletion.ts');
  const { listenerItemsLeft } = await import('../src/db/repos/account/ddb/deletion.ts');
  const { acCount, acHasItem, acScan, acSessions } = await import('./fixtures.ts');
  const { makeDeletionsDue } = await import('./ac-neutral.ts');

  test('G-M26-AC1: ten sign-ups racing for one email make one account, and the U#EMAIL item names it', async () => {
    const t = await freshDb();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => createListener(t.db, 'race@example.com', 'scrypt$x', `Racer ${i}`)));
    const made = results.filter((r) => r !== 'exists');
    assert.equal(made.length, 1, `${made.length} accounts were made for one email`);
    assert.equal(results.filter((r) => r === 'exists').length, 9);
    assert.equal(await acCount(t.store!, 'main', 'listener'), 1);
    const owner = (await acScan(t.store!, 'main', 'unique')).find((u) => u['PK'] === K.U.email('race@example.com').PK);
    assert.equal(owner?.['owner'], (made[0] as { id: string }).id);
    await t.close();
  });

  test('G-M26-AC2: a deletion killed half-way finishes on the next run; nothing of the listener is left', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'gone@example.com', 'Gone');
    const b = await signUp(t, 'stays@example.com', 'Stays');
    await t.call('POST', '/v1/auth/sign-in', { email: 'gone@example.com', password: 'correct horse' });
    await saveToken(t.db, a.id, 'ExponentPushToken[gonegonegone]', 'ios');
    await putQueue(t.db, a.id, ['e1', 'e2'], 0, 'phone');
    await setInterests(t.db, a.id, [1301, 1303]);
    assert.equal((await t.call('PUT', '/v1/me/push-prefs', { popular: false }, a.token)).status, 204);
    assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token)).status, 202);
    assert.equal((await acSessions(t.store!, a.id)).length, 0, 'signed out everywhere at the request');
    await makeDeletionsDue(t);

    // The crash: every BatchWrite on the listener's partition fails, half-way through the job.
    const faulty = withFaults(t.store!, [{ command: 'BatchWriteCommand', prefix: K.L(a.id) }]);
    const first = await runDueDeletions(withStore(t.db, faulty), {});
    assert.deepEqual(first, { deleted: 0, failed: 1 }, 'the first run stops at the fault');
    assert.ok((await listenerItemsLeft(t.store!, a.id)) > 0, 'the crash left items behind');
    const job = (await acScan(t.store!, 'main', 'job')).find((j) => j['id'] === a.id);
    assert.ok(job && job['done'] !== true, 'the job is still open');
    assert.match(String(job['lastError']), /injected fault/);

    // The next hourly run (no fault) resumes it from where it stopped.
    const second = await runDueDeletions(t.db, {});
    assert.equal(second.deleted, 1, 'the open job finished');
    assert.equal(await listenerItemsLeft(t.store!, a.id), 0, 'no item of the listener is left');
    assert.equal(await acHasItem(t.store!, K.U.email('gone@example.com')), false, 'the email is free');
    assert.equal(await acHasItem(t.store!, K.pushTokenOwner('ExponentPushToken[gonegonegone]')), false, 'the push token is gone');
    assert.equal((await acSessions(t.store!, a.id)).length, 0);
    assert.equal((await t.call('GET', '/v1/me', undefined, b.token)).status, 200, 'the other account is untouched');
    assert.equal(await listenerItemsLeft(t.store!, b.id) > 0, true);
    await t.close();
  });

  test('G-M26-AC3: a warm session is authenticated with exactly one GetItem', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'warm@example.com', 'Warm');
    assert.equal((await t.call('GET', '/v1/me', undefined, a.token)).status, 200); // records today's app use once
    const sent: string[] = [];
    const counting = wrapStore(t.store!, (cmd, next) => { sent.push(cmd.constructor.name); return next(cmd); });
    const who = await listenerForToken(withStore(t.db, counting), a.token, TEST_PEPPER);
    assert.equal(who?.id, a.id);
    assert.equal(who?.display_name, 'Warm', 'the name comes from the session item');
    assert.deepEqual(sent, ['GetCommand'], 'one GetItem, nothing else');
    await t.close();
  });

  test('AC-T04 adminTx: a small change and its audit item commit together (numeric ids); a change over 98 items writes the audit first', async () => {
    const { freshStore } = await import('./harness.ts');
    const { adminTx } = await import('../src/auth/admin-tx.ts');
    const { encode } = await import('../src/db/ddb/codec.ts');
    const { TxCancelled } = await import('../src/db/ddb/tx.ts');
    const s = await freshStore();
    const ctx = { adminId: 'a1', device: 'test' };
    const id1 = await adminTx(s.store, ctx, { area: 'safety', action: 'word.add', target: 'w' }, {
      before: null, after: { word: 'x' }, write: (t) => { t.put('main', encode('config', K.config('words-test'), { words: ['x'] })); },
    });
    const id2 = await adminTx(s.store, ctx, { area: 'safety', action: 'word.add', target: 'w2' }, {
      before: null, after: { word: 'y' }, write: (t) => { t.put('main', encode('config', K.config('words-test2'), { words: ['y'] })); },
    });
    assert.deepEqual([id1, id2], [1, 2]);
    // A failing change leaves no audit item (and no id is used).
    await assert.rejects(adminTx(s.store, ctx, { area: 'safety', action: 'word.add', target: 'w3' }, {
      before: null, after: null, write: (t) => { t.put('main', encode('config', K.config('words-test'), { words: [] }), { condition: 'attribute_not_exists(PK)' }); },
    }), TxCancelled);
    const big = await adminTx(s.store, ctx, { area: 'safety', action: 'bulk', target: '150' }, {
      before: null, after: { n: 150 }, write: (t) => { for (let i = 0; i < 150; i++) t.put('main', encode('config', K.config(`bulk-${i}`), { i })); },
    });
    assert.equal(big, 3);
    const audits = (await acScan(s.store, 'main', 'audit')).sort((a, b) => String(a['SK']).localeCompare(String(b['SK'])));
    assert.deepEqual(audits.map((a) => [a['id'], a['action'] ?? null, a['complete'] ?? null]), [[1, 'word.add', null], [2, 'word.add', null], [3, 'bulk', false], [3, null, true]]);
    assert.equal((audits[2]!['keys'] as string[]).length, 150, 'the audit-first record names every key');
    assert.equal(await acCount(s.store, 'main', 'config'), 152);
    await s.close();
  });
}
