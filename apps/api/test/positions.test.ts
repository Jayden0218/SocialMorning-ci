import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

type Row = { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean; receivedAt: string; deviceId: string };

async function put(t: TestDb, token: string, deviceId: string, o: Partial<Row> & { offsetMs: number }) {
  const res = await t.call('PUT', '/v1/me/positions', {
    deviceId, observations: [{ episodeId: EP, finished: false, progressSeq: 1, explicitSeek: false, ...o }],
  }, token);
  return { status: res.status, body: (await res.json()) as { positions: Row[] } & { error?: string; episodeId?: string } };
}

test('A3 over HTTP: 16:00 stands against a later 15:00; finished is sticky; a newer explicit seek goes backwards', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_899_000 });
  const a = await signUp(t);

  const r1 = await put(t, a.token, 'phone1', { offsetMs: 960_000, progressSeq: 5 });
  assert.equal(r1.status, 200);
  assert.deepEqual([r1.body.positions[0]!.offsetMs, r1.body.positions[0]!.deviceId], [960_000, 'phone1']);

  const r2 = await put(t, a.token, 'phone2', { offsetMs: 900_000, progressSeq: 9 });
  assert.equal(r2.body.positions[0]!.offsetMs, 960_000, 'progress never goes backwards');
  assert.equal(r2.body.positions[0]!.deviceId, 'phone1', 'the standing row is still phone1\'s');

  const r3 = await put(t, a.token, 'phone2', { offsetMs: 300_000, explicitSeek: true, progressSeq: 10 });
  assert.equal(r3.body.positions[0]!.offsetMs, 300_000, 'a newer explicit seek wins backwards');
  assert.equal(r3.body.positions[0]!.deviceId, 'phone2');

  const r4 = await put(t, a.token, 'phone1', { offsetMs: 2_899_000, finished: true, progressSeq: 6 });
  assert.equal(r4.body.positions[0]!.finished, true);
  const r5 = await put(t, a.token, 'phone1', { offsetMs: 100, progressSeq: 7 });
  assert.equal(r5.body.positions[0]!.finished, true, 'sticky');
  assert.equal(r5.body.positions[0]!.offsetMs, 2_899_000);

  const list = (await (await t.call('GET', '/v1/me/positions', undefined, a.token)).json()) as { positions: Row[]; serverTime: string };
  assert.equal(list.positions.length, 1);
  assert.ok(list.serverTime);
  await t.close();
});

test('an unknown episode is 404 and names it; auth is required; since filters', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const r = await put(t, a.token, 'p', { offsetMs: 1 });
  assert.equal(r.status, 404);
  assert.equal(r.body.episodeId, EP);
  assert.equal((await t.call('PUT', '/v1/me/positions', { deviceId: 'p', observations: [] })).status, 401);
  await t.call('PUT', `/v1/episodes/${EP}`, ep);
  await put(t, a.token, 'p', { offsetMs: 5 });
  const future = (await (await t.call('GET', '/v1/me/positions?since=2099-01-01T00:00:00Z', undefined, a.token)).json()) as { positions: Row[] };
  assert.deepEqual(future.positions, []);
  assert.equal((await t.call('GET', '/v1/me/positions?since=garbage', undefined, a.token)).status, 422);
  await t.close();
});
