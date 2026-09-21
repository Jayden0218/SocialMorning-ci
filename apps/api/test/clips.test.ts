/**
 * quickstart A9 (clip half) + the routes in contracts/api.md. Guard G8: one clip per
 * (author, clientId) — the UNIQUE plus the repo's read-first — watched red by dropping
 * the UNIQUE from 002_graph.sql.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g189', title: '#189', showTitle: 'Reply All', enclosureUrl: 'https://cdn/189.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const D = 2_899_000;

test('A9: POST twice with one clientId is one clip (G8); the activity row is written once', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t);
  const body = { clientId: 'phone-1-abc', startMs: 872_000, endMs: 910_000, caption: 'the good bit' };
  const r1 = await t.call('POST', `/v1/episodes/${EP}/clips`, body, a.token);
  assert.equal(r1.status, 201);
  const c1 = ((await r1.json()) as { clip: { id: string; author: { displayName: string }; deleted: boolean } }).clip;
  assert.equal(c1.author.displayName, 'Alex');
  assert.equal(c1.deleted, false);
  const r2 = await t.call('POST', `/v1/episodes/${EP}/clips`, body, a.token);
  assert.equal(r2.status, 200);
  assert.equal(((await r2.json()) as { clip: { id: string } }).clip.id, c1.id);
  assert.deepEqual(await t.q('SELECT count(*)::int AS n FROM clips'), [{ n: 1 }]);
  assert.deepEqual(await t.q(`SELECT count(*)::int AS n FROM activity WHERE kind = 'clipped'`), [{ n: 1 }]);
  await t.close();
});

test('the range is validated with the shared rule: 0.5 s, 10:01 and past the known end are 422', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t);
  for (const [startMs, endMs, reason] of [[0, 500, 'too_short'], [0, 600_001, 'too_long'], [D - 1000, D + 1, 'past_end']] as const) {
    const r = await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: `c-${reason}`, startMs, endMs }, a.token);
    assert.equal(r.status, 422);
    assert.equal(((await r.json()) as { reason: string }).reason, reason);
  }
  const unregistered = await t.call('POST', `/v1/episodes/nope/clips`, { clientId: 'x', startMs: 0, endMs: 5000 }, a.token);
  assert.equal(unregistered.status, 404);
  const anon = await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'x', startMs: 0, endMs: 5000 });
  assert.equal(anon.status, 401);
  await t.close();
});

test('GET /v1/clips/:id is public and carries the episode record; DELETE is the author\'s; a deleted clip still answers with the episode (FR-005)', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = ((await (await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 10_000, endMs: 40_000, caption: 'hi' }, a.token)).json()) as { clip: { id: string } }).clip;
  const pub = await t.call('GET', `/v1/clips/${c.id}`);
  assert.equal(pub.status, 200);
  const j = (await pub.json()) as { clip: { startMs: number; deleted: boolean }; episode: { feedUrl: string; guid: string; showTitle: string; durationMs: number } };
  assert.equal(j.clip.startMs, 10_000);
  assert.deepEqual(j.episode, { id: EP, feedUrl: ep.feedUrl, guid: ep.guid, title: ep.title, showTitle: 'Reply All', enclosureUrl: ep.enclosureUrl, imageUrl: null, durationMs: D });
  assert.equal((await t.call('DELETE', `/v1/clips/${c.id}`, undefined, b.token)).status, 403);
  assert.equal((await t.call('DELETE', `/v1/clips/${c.id}`, undefined, a.token)).status, 204);
  assert.equal((await t.call('DELETE', `/v1/clips/${c.id}`, undefined, a.token)).status, 404);
  const after = (await (await t.call('GET', `/v1/clips/${c.id}`)).json()) as { clip: { deleted: boolean }; episode: { title: string } };
  assert.equal(after.clip.deleted, true);
  assert.equal(after.episode.title, '#189');
  assert.deepEqual(await t.q(`SELECT count(*)::int AS n FROM activity WHERE kind = 'clipped'`), [{ n: 0 }]);
  assert.equal((await t.call('GET', `/v1/clips/00000000-0000-4000-8000-000000000000`)).status, 404);
  await t.close();
});

test('GET /v1/episodes/:id/clips lists live clips newest first, 20 a page, with a keyset cursor', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: D });
  const a = await signUp(t);
  for (let i = 0; i < 22; i++) {
    await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: `c${i}`, startMs: i * 1000, endMs: i * 1000 + 5000 }, a.token);
    await t.q(`UPDATE clips SET created_at = now() + ($1 || ' seconds')::interval WHERE client_id = $2`, [String(i), `c${i}`]);
  }
  const p1 = (await (await t.call('GET', `/v1/episodes/${EP}/clips`)).json()) as { clips: { startMs: number }[]; next?: string };
  assert.equal(p1.clips.length, 20);
  assert.equal(p1.clips[0]!.startMs, 21_000);
  assert.ok(p1.next);
  const p2 = (await (await t.call('GET', `/v1/episodes/${EP}/clips?before=${encodeURIComponent(p1.next!)}`)).json()) as { clips: { startMs: number }[]; next?: string };
  assert.deepEqual(p2.clips.map((c) => c.startMs), [1_000, 0]);
  assert.equal(p2.next, undefined);
  await t.close();
});
