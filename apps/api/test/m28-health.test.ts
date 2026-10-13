// M28 US3 (G-M28-HEALTH): the outbox health check emails once per problem and once when it clears, and never says what is in an entry.
/**
 * Guard G-M28-HEALTH (specs/029-m28-enterprise-hardening, tasks T028, T034, T035).
 * Breaks: (1) in `src/jobs/health.ts` remove the `condition:` of the state update -> "two concurrent runs" and "a second run" see 2 emails;
 *         (2) put `JSON.stringify(first)` / the payload into the email text -> "no payload, id or error text" goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('m28 health (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { testClock } = await import('./fixtures.ts');
  const { tx } = await import('../src/db/ddb/tx.ts');
  const { enqueue, drainOutbox, parkedOutbox, discardParked } = await import('../src/jobs/outbox.ts');
  const { checkOutboxHealth } = await import('../src/jobs/health.ts');
  type Mail = { to: string; subject: string; text: string };

  const MARK = 'PAYLOAD-MARK-7731';
  const setup = async () => {
    const clock = testClock('2026-10-12T08:00:00Z');
    const s = await freshStore({ clock });
    const mail: Mail[] = [];
    const mailer = { send: async (m: Mail) => { mail.push(m); } };
    const run = () => checkOutboxHealth(s.store, { mailer, to: 'owner@example.test', log: () => {} });
    return { clock, s, mail, mailer, run };
  };
  const putEntry = async (s: Awaited<ReturnType<typeof freshStore>>, kind = 'stuck') => {
    const t = tx(s.store);
    const id = enqueue(t, s.store, { kind, payload: { note: MARK }, id: `entry-${MARK}` });
    await t.commit();
    return id;
  };

  test('a pending entry older than 15 minutes: one problem email; a second run sends nothing; once cleared, one clear email', async () => {
    const { clock, s, mail, run } = await setup();
    assert.deepEqual(await run(), { oldestAgeMs: 0, parked: 0, state: 'ok', emailed: 0 });
    assert.equal(mail.length, 0, 'a healthy outbox sends nothing');

    const id = await putEntry(s);
    clock.advance(10 * 60_000);
    assert.equal((await run()).emailed, 0, '10 minutes is not yet a problem');
    clock.advance(6 * 60_000);
    const r = await run();
    assert.equal(r.state, 'bad');
    assert.equal(r.emailed, 1);
    assert.equal(mail.length, 1);
    assert.equal(mail[0]!.subject, 'SocialNet: outbox problem');
    assert.equal(mail[0]!.to, 'owner@example.test');
    assert.match(mail[0]!.text, /docs\/runbooks\/alarms\.md#outbox-health/);

    clock.advance(60 * 60_000);
    assert.equal((await run()).emailed, 0, 'the same problem an hour later: no second email');
    assert.equal(mail.length, 1);

    await drainOutbox(s.store, { stuck: async () => {} });
    assert.ok(id);
    const clear = await run();
    assert.equal(clear.state, 'ok');
    assert.equal(clear.emailed, 1);
    assert.equal(mail.length, 2);
    assert.equal(mail[1]!.subject, 'SocialNet: outbox clear');
    assert.equal((await run()).emailed, 0);
    assert.equal(mail.length, 2);
    await s.close();
  });

  test('a parked entry is a problem even when nothing is old; discarding it clears', async () => {
    const { s, mail, run } = await setup();
    const id = await putEntry(s, 'poison');
    for (let i = 0; i < 10; i++) await drainOutbox(s.store, { poison: async () => { throw new Error(`fail ${MARK}`); } });
    assert.equal((await parkedOutbox(s.store)).length, 1);
    const r = await run();
    assert.deepEqual([r.parked, r.state, r.emailed], [1, 'bad', 1]);
    await discardParked(s.store, id);
    assert.deepEqual([(await run()).state, mail.length], ['ok', 2]);
    await s.close();
  });

  test('two concurrent runs send one email', async () => {
    const { clock, s, mail, run } = await setup();
    await putEntry(s);
    clock.advance(20 * 60_000);
    const out = await Promise.all([run(), run(), run()]);
    assert.equal(out.reduce((n, r) => n + r.emailed, 0), 1);
    assert.equal(mail.length, 1);
    await s.close();
  });

  test('the email holds no payload, id or error text', async () => {
    const { clock, s, mail, run } = await setup();
    await putEntry(s, 'poison');
    for (let i = 0; i < 10; i++) await drainOutbox(s.store, { poison: async () => { throw new Error(`fail ${MARK}`); } });
    // A second entry is still pending (old, with the marker in its payload and its error): the email may count it, never show it.
    const t = tx(s.store);
    enqueue(t, s.store, { kind: 'queued-kind', payload: { note: MARK }, id: `queued-${MARK}` });
    await t.commit();
    await drainOutbox(s.store, { 'queued-kind': async () => { throw new Error(`fail ${MARK}`); } });
    clock.advance(30 * 60_000);
    await run();
    assert.equal(mail.length, 1);
    const all = `${mail[0]!.subject}\n${mail[0]!.text}`;
    for (const needle of [MARK, 'entry-', 'queued', 'poison', 'fail ']) assert.ok(!all.includes(needle), `the body must not contain "${needle}"`);
    await s.close();
  });

  test('never throws: a failing mailer hands the transition back so the next run sends it', async () => {
    const { clock, s, mail, mailer } = await setup();
    await putEntry(s);
    clock.advance(20 * 60_000);
    let up = false;
    const flaky = { send: async (m: Mail) => { if (!up) throw new Error('smtp down'); await mailer.send(m); } };
    const lines: string[] = [];
    const first = await checkOutboxHealth(s.store, { mailer: flaky, to: 'o@example.test', log: (l) => lines.push(l) });
    assert.equal(first.emailed, 0);
    assert.ok(lines.some((l) => l.startsWith('health: error')));
    up = true;
    const second = await checkOutboxHealth(s.store, { mailer: flaky, to: 'o@example.test', log: () => {} });
    assert.equal(second.emailed, 1);
    assert.equal(mail.length, 1);
    // No mailer / no recipient: no state change, no throw.
    assert.equal((await checkOutboxHealth(s.store, { log: () => {} })).emailed, 0);
    await s.close();
  });

  test('POST /v1/internal/rebuild {step:"health"} answers { done, counts: { oldestAgeMs, parked, state, emailed } } and emails the ALERT_EMAIL once', async () => {
    const { freshDb } = await import('./harness.ts');
    const t = await freshDb({ jobToken: 'tok-health' });
    process.env['ALERT_EMAIL'] = 'alerts@example.test';
    try {
      const call = async () => (await (await t.call('POST', '/v1/internal/rebuild', { step: 'health' }, 'tok-health')).json()) as { done: boolean; counts: Record<string, unknown> };
      const ok = await call();
      assert.equal(ok.done, true);
      assert.deepEqual(Object.keys(ok.counts).sort(), ['emailed', 'oldestAgeMs', 'parked', 'state']);
      assert.equal(ok.counts['state'], 'ok');
      const q = tx(t.store);
      enqueue(q, t.store, { kind: 'm28-route-poison', payload: { note: MARK } });
      await q.commit();
      for (let i = 0; i < 10; i++) await drainOutbox(t.store, { 'm28-route-poison': async () => { throw new Error('x'); } });
      const before = t.mail!.length;
      const bad = await call();
      assert.deepEqual([bad.counts['state'], bad.counts['parked'], bad.counts['emailed']], ['bad', 1, 1]);
      assert.equal(t.mail!.length, before + 1);
      assert.equal(t.mail![before]!.to, 'alerts@example.test');
      assert.equal((await call()).counts['emailed'], 0);
      assert.equal(t.mail!.length, before + 1);
      assert.equal((await t.call('POST', '/v1/internal/rebuild', { step: 'health' }, 'wrong')).status, 401);
    } finally {
      delete process.env['ALERT_EMAIL'];
      await t.close();
    }
  });
}
