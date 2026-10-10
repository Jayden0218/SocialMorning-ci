// Tests "listening now" stores no account and counts installs correctly.
/**
 * M12 FR-042 — "N listening now". Guard G-L1: the table stores no account — its columns are
 * exactly (episode_id, listener_hash, seen_at) — and the count is of installs in the last
 * 3 minutes. The break: add a `listener_id` column to `live_listeners` in migration 009.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, TEST_PEPPER, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { dailySalt, listenerHash } from '../src/db/repos/social/live-listeners.ts';
import { ageLive, liveColumns, liveCount, liveOlderThan, liveRows, seedLive } from './sg-neutral.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const beat = (t: TestDb, installId: string, token?: string) => t.call('PUT', `/v1/episodes/${EP}/live`, { installId }, token);
const count = async (t: TestDb) => {
  const r = await t.call('GET', `/v1/episodes/${EP}/live`);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  return ((await r.json()) as { listeningNow: number }).listeningNow;
};

test('G-L1: live_listeners has no account column — only the episode, a hash and a time', async () => {
  const t = await freshDb();
  assert.deepEqual(await liveColumns(t), ['episode_id', 'listener_hash', 'seen_at']);
  await t.close();
});

test('G-L1: two installs → 2; the same install twice → still 2; 4 minutes later → 0. Only the salted hash is stored, never the install id or the account', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 1_000_000 });
  const a = await signUp(t);
  assert.equal((await beat(t, 'install-one-aaaa', a.token)).status, 204);
  assert.equal((await beat(t, 'install-two-bbbb')).status, 204);
  assert.equal((await beat(t, 'install-one-aaaa')).status, 204);
  assert.equal(await count(t), 2);
  const rows = await liveRows(t);
  const salt = dailySalt(TEST_PEPPER, new Date());
  assert.deepEqual(rows.map((r) => r['listener_hash']).sort(), [listenerHash('install-one-aaaa', salt), listenerHash('install-two-bbbb', salt)].sort());
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes('install-one') && !dump.includes(a.id), 'neither the install id nor the account is anywhere in the rows');

  await ageLive(t, 4 * 60_000);
  assert.equal(await count(t), 0);
  await t.close();
});

test('FR-042: one write per install per minute; rows older than 10 min go on the next write; bad input is refused', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 1_000_000 });
  await beat(t, 'install-one-aaaa');
  await ageLive(t, 30_000);
  await beat(t, 'install-one-aaaa');
  assert.equal(await liveOlderThan(t, 20_000), true, 'a second heartbeat within 60 s writes nothing');
  await ageLive(t, 61_000);
  await beat(t, 'install-one-aaaa');
  assert.equal(await liveOlderThan(t, 20_000), false, 'after a minute it is written again');

  await seedLive(t, EP, 'f'.repeat(64), 11 * 60_000);
  await beat(t, 'install-two-bbbb');
  assert.equal(await liveCount(t), 2, 'the 11-minute-old row was deleted');

  assert.equal((await beat(t, 'short')).status, 422);
  assert.equal((await t.call('PUT', '/v1/episodes/0000000000000000/live', { installId: 'install-one-aaaa' })).status, 404);
  assert.equal(dailySalt('p', new Date('2026-09-29T23:59:59Z')) === dailySalt('p', new Date('2026-09-30T00:00:00Z')), false, 'the salt changes every UTC day');
  await t.close();
});
