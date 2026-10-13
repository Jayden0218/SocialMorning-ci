// M28 US3 (G-M28-PARK): an outbox entry that keeps failing is parked after 10 tries, never lost, and the owner can retry or discard it.
/**
 * Guard G-M28-PARK (specs/029-m28-enterprise-hardening, tasks T027, T032).
 * Break: in `src/jobs/outbox.ts` `drainOutbox`, remove the `entry.attempts + 1 >= OUTBOX_PARK_AFTER` branch
 * (every failure then just counts up) -> "the entry is parked after 10 tries" and "the 11th drain" go red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('m28 outbox parking (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { aCall, adminSetup, auditRows } = await import('./admin-harness.ts');
  const { freshDb, signUp } = await import('./harness.ts');
  const { tx } = await import('../src/db/ddb/tx.ts');
  const { enqueue, drainOutbox, pendingOutbox, parkedOutbox, retryParked, discardParked, OUTBOX_PARK_AFTER } = await import('../src/jobs/outbox.ts');

  const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T;

  test('the entry is parked after 10 tries; the 11th drain does not call the handler; retry brings it back with attempts 0; discard removes it', async () => {
    const s = await freshStore();
    let calls = 0;
    const handlers = { boom: async () => { calls++; throw new Error('down'); } };
    const t = tx(s.store);
    const id = enqueue(t, s.store, { kind: 'boom', payload: { secret: 'PAYLOAD-MARK' } });
    await t.commit();

    assert.equal(OUTBOX_PARK_AFTER, 10);
    let parkedNow = 0;
    for (let i = 1; i <= 10; i++) parkedNow += (await drainOutbox(s.store, handlers)).parked;
    assert.equal(calls, 10);
    assert.equal(parkedNow, 1, 'the entry is parked after 10 tries');
    assert.equal((await pendingOutbox(s.store)).length, 0, 'gone from OUTBOX#');
    const parked = await parkedOutbox(s.store);
    assert.equal(parked.length, 1);
    assert.equal(parked[0]!['id'], id);
    assert.equal(parked[0]!['attempts'], 10);
    assert.match(String(parked[0]!['parkedAt']), /^\d{4}-/);
    assert.match(String(parked[0]!['PK']), /^PARKED#/);
    assert.deepEqual(parked[0]!['payload'], { secret: 'PAYLOAD-MARK' }, 'nothing is dropped');

    const again = await drainOutbox(s.store, handlers);
    assert.equal(calls, 10, 'the 11th drain does not call the handler');
    assert.deepEqual(again, { done: 0, failed: 0, kept: [], parked: 0 });

    assert.equal(await retryParked(s.store, id), true);
    const back = await pendingOutbox(s.store);
    assert.equal(back.length, 1);
    assert.equal(back[0]!['attempts'], 0);
    assert.equal(back[0]!['parkedAt'], undefined);
    assert.equal((await parkedOutbox(s.store)).length, 0);
    assert.equal(await retryParked(s.store, id), false, 'no longer parked');

    for (let i = 1; i <= 10; i++) await drainOutbox(s.store, handlers);
    assert.equal(await discardParked(s.store, id), true);
    assert.equal((await parkedOutbox(s.store)).length, 0);
    assert.equal((await pendingOutbox(s.store)).length, 0);
    assert.equal(await discardParked(s.store, id), false);
    await s.close();
  });

  test('a drain that lost the race (attempts changed) does not park', async () => {
    const s = await freshStore();
    const { update } = await import('../src/db/ddb/store.ts');
    const t = tx(s.store);
    enqueue(t, s.store, { kind: 'boom' });
    await t.commit();
    const [entry] = await pendingOutbox(s.store);
    await update(s.store, 'main', { PK: String(entry!['PK']), SK: String(entry!['SK']) }, { update: 'SET attempts = :n', values: { ':n': 9 } });
    // The in-memory entry says attempts 9 (one failure from parking) while another drain bumped it to 10 in between.
    const racing = { boom: async () => { await update(s.store, 'main', { PK: String(entry!['PK']), SK: String(entry!['SK']) }, { update: 'SET attempts = :n', values: { ':n': 10 } }); throw new Error('down'); } };
    const r = await drainOutbox(s.store, racing);
    assert.equal(r.parked, 0, 'the condition on attempts failed, nothing moved');
    assert.equal((await pendingOutbox(s.store)).length, 1);
    assert.equal((await parkedOutbox(s.store)).length, 0);
    await s.close();
  });

  test('inserted = done + pending + parked + discarded over a mixed run', async () => {
    const s = await freshStore();
    const handlers = {
      ok: async () => {},
      boom: async () => { throw new Error('down'); },
    };
    const kinds = ['ok', 'ok', 'ok', 'boom', 'boom', 'boom', 'boom', 'nobody'];
    const t = tx(s.store);
    const ids = kinds.map((kind) => enqueue(t, s.store, { kind }));
    await t.commit();
    let done = 0;
    for (let i = 0; i < 10; i++) done += (await drainOutbox(s.store, handlers)).done;
    // 3 done; 4 boom + 1 unknown parked (10 failures each)
    assert.equal(done, 3);
    assert.equal((await parkedOutbox(s.store)).length, 5);
    assert.equal((await pendingOutbox(s.store)).length, 0);
    const boomIds = ids.filter((_, i) => kinds[i] === 'boom');
    await retryParked(s.store, boomIds[0]!);
    let discarded = 0;
    if (await discardParked(s.store, boomIds[1]!)) discarded++;
    const pending = (await pendingOutbox(s.store)).length;
    const parked = (await parkedOutbox(s.store)).length;
    assert.equal(done + pending + parked + discarded, ids.length);
    assert.deepEqual([done, pending, parked, discarded], [3, 1, 3, 1]);
    await s.close();
  });

  test('admin routes: owner only; the list has no payload; retry and discard are audited (safety, outbox_retry / outbox_discard)', async () => {
    const { t, owner, other } = await adminSetup();
    const q = tx(t.store);
    const a = enqueue(q, t.store, { kind: 'm28-park-a', payload: { secret: 'PAYLOAD-MARK' } });
    const b = enqueue(q, t.store, { kind: 'm28-park-b', payload: { secret: 'PAYLOAD-MARK' } });
    await q.commit();
    const handlers = { 'm28-park-a': async () => { throw new Error('down a'); }, 'm28-park-b': async () => { throw new Error('down b'); } };
    for (let i = 0; i < 10; i++) await drainOutbox(t.store, handlers);

    assert.equal((await aCall(t, 'GET', '/v1/admin/outbox/parked', other)).status, 403, 'a non-admin');
    assert.equal((await aCall(t, 'GET', '/v1/admin/outbox/parked')).status < 500 && (await aCall(t, 'GET', '/v1/admin/outbox/parked')).status >= 400, true, 'signed out');
    const res = await aCall(t, 'GET', '/v1/admin/outbox/parked', owner);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('PAYLOAD-MARK'), 'no payload in the list');
    const list = JSON.parse(text) as { items: { id: string; kind: string; attempts: number; lastError: string; parkedAt: string; createdAt: string }[] };
    assert.deepEqual(list.items.map((i) => i.id).sort(), [a, b].sort());
    assert.deepEqual(Object.keys(list.items[0]!).sort(), ['attempts', 'createdAt', 'id', 'kind', 'lastError', 'parkedAt']);

    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${a}/retry`, other)).status, 403);
    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${a}/retry`, owner)).status, 200);
    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${a}/retry`, owner)).status, 404, 'already moved');
    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${b}/discard`, owner, {})).status, 422, 'a reason is needed');
    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${b}/discard`, owner, { reason: 'x'.repeat(201) })).status, 422);
    assert.equal((await aCall(t, 'POST', `/v1/admin/outbox/parked/${b}/discard`, owner, { reason: 'poison' })).status, 200);
    assert.equal((await json<{ items: unknown[] }>(aCall(t, 'GET', '/v1/admin/outbox/parked', owner))).items.length, 0);
    assert.equal((await pendingOutbox(t.store)).filter((i) => i['id'] === a).length, 1, 'retried entry is pending again');

    const rows = (await auditRows(t)).filter((r) => r.area === 'safety' && r.action.startsWith('outbox_'));
    assert.deepEqual(rows.map((r) => r.action).sort(), ['outbox_discard', 'outbox_retry']);
    assert.ok(rows.find((r) => r.action === 'outbox_retry')!.target.includes(a));
    assert.ok(rows.find((r) => r.action === 'outbox_discard')!.target.includes('poison'));
    await t.close();
  });

  test('/mod page: the owner sees the pending and parked counts and the list (no payload); Retry and Discard work and are audited; a stale form is refused', async () => {
    const t = await freshDb();
    const o = await signUp(t, 'o@example.com', 'Owner');
    t.setOwner!(o.id);
    const web = (method: string, path: string, body?: Record<string, string>, cookie?: string) => t.app.request(path, {
      method, headers: { ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? new URLSearchParams(body).toString() : undefined, redirect: 'manual',
    });
    const r = await web('POST', '/mod/login', { email: 'o@example.com', password: 'correct horse' });
    const cookie = r.headers.get('set-cookie')!.split(';')[0]!;
    await web('POST', '/mod/code', { code: t.lastCode!('o@example.com') }, cookie);

    const q = tx(t.store);
    const a = enqueue(q, t.store, { kind: 'm28-mod-a', payload: { secret: 'PAYLOAD-MARK' } });
    const b = enqueue(q, t.store, { kind: 'm28-mod-b', payload: { secret: 'PAYLOAD-MARK' } });
    await q.commit();
    const fail = { 'm28-mod-a': async () => { throw new Error('down a'); }, 'm28-mod-b': async () => { throw new Error('down b'); } };
    for (let i = 0; i < 10; i++) await drainOutbox(t.store, fail);

    const html = await (await web('GET', '/mod', undefined, cookie)).text();
    assert.match(html, /Outbox: 0 pending · 2 parked/);
    assert.ok(html.includes('m28-mod-a') && html.includes('down a'));
    assert.ok(!html.includes('PAYLOAD-MARK'), 'no payload on the page');
    const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;

    assert.equal((await web('POST', '/mod/outbox', { csrf: 'nope', id: a, action: 'retry' }, cookie)).status, 403, 'stale form');
    assert.equal((await web('POST', '/mod/outbox', { csrf, id: b, action: 'discard' }, cookie)).status, 422, 'a discard needs a reason');
    assert.equal((await web('POST', '/mod/outbox', { csrf, id: a, action: 'retry' }, cookie)).status, 303);
    assert.equal((await web('POST', '/mod/outbox', { csrf, id: b, action: 'discard', reason: 'poison' }, cookie)).status, 303);
    assert.equal((await web('POST', '/mod/outbox', { csrf, id: b, action: 'discard', reason: 'again' }, cookie)).status, 303, 'already gone: refresh, no error');
    assert.equal((await web('POST', '/mod/outbox', { csrf, id: a, action: 'retry' }, undefined)).status, 403, 'no cookie');
    assert.equal((await parkedOutbox(t.store)).length, 0);
    const rows = (await auditRows(t)).filter((x) => x.area === 'safety' && x.action.startsWith('outbox_'));
    assert.deepEqual(rows.map((x) => x.action).sort(), ['outbox_discard', 'outbox_retry']);
    await t.close();
  });
}
