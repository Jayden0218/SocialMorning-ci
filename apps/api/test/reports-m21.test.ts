// Tests episode and transcript reports, and the Studio list where a host marks them done.
/**
 * M21 US2 (contracts/api.md "Player and transcript"): `POST /v1/reports` takes `episode` and
 * `transcript`; a transcript report carries the listener's correction and reaches the show's
 * host in the Studio (`/v1/studio/shows/:show/transcript-reports`), who marks it done.
 *
 * The break that turns it red: in `src/routes/studio/transcript-reports.ts`, drop the
 * `roleFor` check on the PATCH — the "a stranger cannot mark it done" assertion fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';
import { act } from '../src/db/repos/safety/moderation.ts';

const FEED = 'https://feeds.example.com/talk.xml';
const ep = { feedUrl: FEED, guid: 'g1', title: 'Ep One', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

const line = (offsetMs: number, suggested = 'the right words') => ({ offsetMs, original: 'the wrong words', suggested });

test('an episode report keeps a copy of the episode and the show; the owner can dismiss it', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');
  const r = await t.call('POST', '/v1/reports', { targetKind: 'episode', targetId: EP, reason: 'illegal' }, a.token);
  assert.equal(r.status, 201);
  const [row] = await t.q<{ target_kind: string; target_id: string; snapshot: { episodeTitle: string; feedUrl: string }; closed_at: string | null }>('SELECT target_kind, target_id, snapshot, closed_at FROM reports');
  assert.equal(row!.target_kind, 'episode');
  assert.equal(row!.target_id, EP);
  assert.equal(row!.snapshot.episodeTitle, 'Ep One');
  assert.equal(row!.snapshot.feedUrl, FEED);
  assert.equal(row!.closed_at, null);

  const bad = await t.call('POST', '/v1/reports', { targetKind: 'episode', targetId: 'https://x/y', reason: 'spam' }, a.token);
  assert.equal(bad.status, 422);
  const gone = await t.call('POST', '/v1/reports', { targetKind: 'episode', targetId: 'abc123', reason: 'spam' }, a.token);
  assert.equal(((await gone.json()) as { closed?: string }).closed, 'already_gone');

  // Migration 020: the action that closes it is recorded (moderation_actions takes the new kinds).
  await act(t.db, a.id, { kind: 'episode', id: EP }, 'dismiss');
  const [after] = await t.q<{ close_reason: string }>('SELECT close_reason FROM reports WHERE target_id = $1', [EP]);
  assert.equal(after!.close_reason, 'dismiss');
  await t.close();
});

test('a transcript report: one row per line, the correction kept, nothing hidden; bad bodies refused', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, ep);
  const a = await signUp(t, 'a@example.com', 'Al');

  const r1 = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: `${EP}#61000`, reason: 'other', detail: line(61_000) }, a.token);
  assert.equal(r1.status, 201);
  // the bare episode id is accepted too (contracts/api.md), stored per line
  const r2 = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: EP, reason: 'other', detail: line(90_000) }, a.token);
  assert.equal(r2.status, 201);
  const again = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: `${EP}#61000`, reason: 'other', detail: line(61_000, 'different') }, a.token);
  assert.equal(again.status, 200, 'the same line again is the same row');

  const rows = await t.q<{ target_id: string; detail: { episodeId: string; offsetMs: number; original: string; suggested: string }; snapshot: { suggested: string; episodeTitle: string } }>(
    "SELECT target_id, detail, snapshot FROM reports WHERE target_kind = 'transcript' ORDER BY target_id");
  assert.deepEqual(rows.map((x) => x.target_id), [`${EP}#61000`, `${EP}#90000`]);
  assert.deepEqual(rows[0]!.detail, { episodeId: EP, offsetMs: 61_000, original: 'the wrong words', suggested: 'the right words' });
  assert.equal(rows[0]!.snapshot.suggested, 'the right words');
  assert.equal(rows[0]!.snapshot.episodeTitle, 'Ep One');

  const hidden = (await (await t.call('GET', '/v1/me/hidden', undefined, a.token)).json()) as { reported: { kind: string }[] };
  assert.deepEqual(hidden.reported, [], 'a correction hides nothing');

  const noDetail = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: EP, reason: 'other' }, a.token);
  assert.equal(noDetail.status, 422);
  const mismatch = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: `${EP}#5`, reason: 'other', detail: line(6) }, a.token);
  assert.equal(mismatch.status, 422);
  const tooLong = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: EP, reason: 'other', detail: line(7, 'x'.repeat(501)) }, a.token);
  assert.equal(tooLong.status, 422);
  const empty = await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: EP, reason: 'other', detail: line(8, '  ') }, a.token);
  assert.equal(empty.status, 422);
  await t.close();
});

test('the Studio: the host lists the show\'s transcript reports and marks one done; a stranger cannot', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, ep);
  const host = await studioLogin(t, 'h@example.com', 'Host');
  const key = await proveClaim(t, host.id, FEED);
  const stranger = await studioLogin(t, 's@example.com', 'Stranger');
  const listener = await signUp(t, 'l@example.com', 'Mei');
  await t.call('POST', '/v1/reports', { targetKind: 'transcript', targetId: `${EP}#61000`, reason: 'other', detail: line(61_000) }, listener.token);

  type L = { items: { id: string; episodeId: string; episodeTitle: string; offsetMs: number; original: string; suggested: string; createdAt: string; status: string }[] };
  const res = await sCall(t, 'GET', `/v1/studio/shows/${key}/transcript-reports`, host);
  assert.equal(res.status, 200);
  const list = (await res.json()) as L;
  assert.equal(list.items.length, 1);
  const item = list.items[0]!;
  assert.deepEqual([item.episodeId, item.episodeTitle, item.offsetMs, item.original, item.suggested, item.status], [EP, 'Ep One', 61_000, 'the wrong words', 'the right words', 'open']);

  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/transcript-reports`, stranger)).status, 403);
  const denied = await sCall(t, 'PATCH', `/v1/studio/transcript-reports/${item.id}`, stranger, { status: 'done' });
  assert.equal(denied.status, 403, 'a stranger cannot mark it done');
  assert.equal((await sCall(t, 'PATCH', '/v1/studio/transcript-reports/not-an-id', host, { status: 'done' })).status, 404);
  assert.equal((await sCall(t, 'PATCH', `/v1/studio/transcript-reports/${item.id}`, host, { status: 'open' })).status, 422);

  const done = await sCall(t, 'PATCH', `/v1/studio/transcript-reports/${item.id}`, host, { status: 'done' });
  assert.equal(done.status, 200);
  const after = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/transcript-reports`, host)).json()) as L;
  assert.equal(after.items[0]!.status, 'done');
  const [row] = await t.q<{ close_reason: string }>('SELECT close_reason FROM reports');
  assert.equal(row!.close_reason, 'done');
  await t.close();
});
