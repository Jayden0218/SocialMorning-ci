import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const D = 2_899_000;

const heatRows = (t: TestDb) => t.q<{ bucket: number; distinct_listeners: number }>('SELECT bucket, distinct_listeners FROM episode_heat WHERE episode_id = $1 ORDER BY bucket', [EP]);

// quickstart A9 + the toggle (Q2)
test('A9: reacting 20 times at one moment is one row; the 21st (a toggle) removes it', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t);
  let last: { reacted: boolean; bucket: number } | undefined;
  for (let i = 0; i < 20; i++) {
    last = (await (await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 180_000 + i * 7 }, a.token)).json()) as typeof last;
  }
  // 20 toggles = even → absent; the rows tell the truth regardless of the arithmetic.
  const rows = await t.q('SELECT * FROM reactions');
  assert.equal(rows.length, 0);
  assert.deepEqual(await heatRows(t), []);
  const on = (await (await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 180_000 }, a.token)).json()) as { reacted: boolean; bucket: number };
  assert.deepEqual(on, { reacted: true, bucket: 6 });
  assert.equal((await t.q('SELECT * FROM reactions')).length, 1);
  assert.deepEqual(await heatRows(t), [{ bucket: 6, distinct_listeners: 1 }]);
  const off = (await (await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 180_500 }, a.token)).json()) as { reacted: boolean };
  assert.equal(off.reacted, false, 'same segment → toggled off');
  assert.deepEqual(await heatRows(t), []);
  void last;
  await t.close();
});

// quickstart A16
test('A16: no duration → 409 duration_unknown and heat unavailable; a duration in the body unlocks it', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t);
  const no = await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 1000 }, a.token);
  assert.equal(no.status, 409);
  assert.equal(((await no.json()) as { error: string }).error, 'duration_unknown');
  const social = (await (await t.call('GET', `/v1/episodes/${EP}/social`)).json()) as { heat: { available: boolean } };
  assert.equal(social.heat.available, false);
  const yes = await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 1000, durationMs: D }, a.token);
  assert.equal(yes.status, 200);
  await t.close();
});

// quickstart A10 — guard G7
test('A10: a listener who both reacts and comments in one segment counts once; two listeners count twice', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 872_000 }, a.token);
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'same segment', offsetMs: 873_000 }, a.token);
  assert.deepEqual(await heatRows(t), [{ bucket: 30, distinct_listeners: 1 }]);
  await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 880_000 }, b.token);
  assert.deepEqual(await heatRows(t), [{ bucket: 30, distinct_listeners: 2 }]);
  await t.close();
});

test('FR-021: a duration arriving via PUT /episodes/:id places already-stored moments', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  const a = await signUp(t);
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'early', offsetMs: 872_000 }, a.token);
  assert.deepEqual(await heatRows(t), []);
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  assert.deepEqual(await heatRows(t), [{ bucket: 30, distinct_listeners: 1 }]);
  await t.close();
});
