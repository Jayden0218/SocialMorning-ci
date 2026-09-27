/**
 * M10b US2 — favourites, favourite comments, moments and search history follow the account.
 * Guards: G-S1 (a tombstone beats an older edit — break: make the merge ignore `deleted_at`
 * in `stampOf`) and G-P1 (rows never leave their owner — break: drop `listener_id = $1` from
 * `listAll`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

type Out = { kind: string; key: string; payload: Record<string, unknown>; updatedAt: string; deletedAt?: string };
const put = async (t: TestDb, token: string, items: unknown[]) =>
  (await (await t.call('PUT', '/v1/me/library', { items }, token)).json()) as { items: Out[] };
const find = (r: { items: Out[] }, kind: string, key: string) => r.items.find((i) => i.kind === kind && i.key === key);

test('G-S1: a removal on one phone is not revived by the other phone\'s older copy; a later edit wins', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  await put(t, a.token, [{ kind: 'fav_episode', key: 'e1', updatedAt: '2026-09-27T10:00:00.000Z' }]);
  const removed = await put(t, a.token, [{ kind: 'fav_episode', key: 'e1', updatedAt: '2026-09-27T10:00:00.000Z', deletedAt: '2026-09-27T10:05:00.000Z' }]);
  assert.ok(find(removed, 'fav_episode', 'e1')?.deletedAt, 'stored as a tombstone');
  const stale = await put(t, a.token, [{ kind: 'fav_episode', key: 'e1', updatedAt: '2026-09-27T10:00:00.000Z' }]);
  assert.ok(find(stale, 'fav_episode', 'e1')?.deletedAt, 'the stale copy does not revive it');
  // The case the tie rule cannot hide: phone B touched it at 10:03 — after it was starred,
  // before phone A removed it at 10:05. The removal is later, so it must stand. (A merge that
  // compared `updatedAt` only would revive it: 10:03 > 10:00.)
  const between = await put(t, a.token, [{ kind: 'fav_episode', key: 'e1', updatedAt: '2026-09-27T10:03:00.000Z' }]);
  assert.ok(find(between, 'fav_episode', 'e1')?.deletedAt, 'an edit older than the removal does not revive it');
  const later = await put(t, a.token, [{ kind: 'moment', key: 'm1', payload: { episodeId: 'e1', atMs: 1000, note: 'first' }, updatedAt: '2026-09-27T11:00:00.000Z' }]);
  assert.equal(find(later, 'moment', 'm1')?.payload['note'], 'first');
  const edited = await put(t, a.token, [{ kind: 'moment', key: 'm1', payload: { episodeId: 'e1', atMs: 1000, note: 'x'.repeat(900) }, updatedAt: '2026-09-27T12:00:00.000Z' }]);
  assert.equal((find(edited, 'moment', 'm1')?.payload['note'] as string).length, 500, 'notes are capped at 500');
  const tie = await put(t, a.token, [{ kind: 'moment', key: 'm1', payload: { note: 'tie' }, updatedAt: '2026-09-27T12:00:00.000Z', deletedAt: '2026-09-27T12:00:00.000Z' }]);
  assert.ok(find(tie, 'moment', 'm1')?.deletedAt, 'on a tie the tombstone wins');
  await t.close();
});

test('G-P1: another listener never sees your favourites, notes or searches', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await put(t, a.token, [
    { kind: 'search', key: 'secret term', payload: { term: 'secret term' }, updatedAt: '2026-09-27T10:00:00.000Z' },
    { kind: 'moment', key: 'm1', payload: { note: 'private note' }, updatedAt: '2026-09-27T10:00:00.000Z' },
  ]);
  const hers = (await (await t.call('GET', '/v1/me/library', undefined, b.token)).json()) as { items: Out[] };
  assert.deepEqual(hers.items, []);
  assert.equal((await t.call('GET', '/v1/me/library')).status, 401);
  await t.close();
});

test('search history keeps the newest 12 live terms', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const items = Array.from({ length: 15 }, (_, i) => ({ kind: 'search', key: `t${i}`, payload: { term: `t${i}` }, updatedAt: new Date(Date.UTC(2026, 8, 27, 10, i)).toISOString() }));
  const r = await put(t, a.token, items);
  const live = r.items.filter((i) => i.kind === 'search' && !i.deletedAt).map((i) => i.key);
  assert.equal(live.length, 12);
  assert.ok(!live.includes('t0') && live.includes('t14'));
  await t.close();
});

test('My comments: your own top-level comments with their text; a deleted one has none', async () => {
  const t = await freshDb();
  const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', enclosureUrl: 'https://cdn/1.mp3' };
  const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 600_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const c1 = (await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'loved this', offsetMs: 61_000 }, a.token)).json() as { comment: { id: string } }).comment;
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  const c2 = (await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'second', offsetMs: 5_000 }, a.token)).json() as { comment: { id: string } }).comment;
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'not hers' }, b.token);
  await t.q('UPDATE comments SET deleted_at = now() WHERE id = $1', [c2.id]);
  const mine = (await (await t.call('GET', '/v1/me/comments', undefined, a.token)).json()) as { items: { id: string; body: string | null; deleted: boolean; offsetMs: number | null; episode: { title: string } }[] };
  assert.deepEqual(mine.items.map((i) => i.id).sort(), [c1.id, c2.id].sort());
  const first = mine.items.find((i) => i.id === c1.id);
  assert.equal(first?.body, 'loved this');
  assert.equal(first?.offsetMs, 61_000);
  assert.equal(first?.episode.title, 'Ep 1');
  const gone = mine.items.find((i) => i.id === c2.id);
  assert.equal(gone?.body, null);
  assert.equal(gone?.deleted, true);
  assert.equal((await t.call('GET', '/v1/me/comments?before=nonsense', undefined, a.token)).status, 400);
  await t.close();
});
