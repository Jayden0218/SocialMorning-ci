// Pins where a moderator-removed comment still counts and where it does not.
/**
 * M26 lane LE, access-patterns.md finding 4 (behaviour kept, owner's decision still open). Behaviour kept:
 *   - "talked about" windows (discover/activity-stats.ts `talkedAbout`): `parent_id IS NULL AND deleted_at IS NULL AND
 *     host_hidden_at IS NULL` — NO `removed_at` filter: a removed comment COUNTS;
 *   - the heat curve (heat/ddb.ts): no `removed_at` filter: a removed comment's moment COUNTS;
 *   - pick-card / Updates counts (discover-extras.ts `statsFor`, POST /v1/episodes/comment-counts — lane SC's `commentCount`
 *     on DynamoDB): `removed_at IS NULL`: a removed comment does NOT count;
 *   - "rising" (explore.ts `risingChart`): `removed_at IS NULL`: it does NOT count.
 * The test runs on DynamoDB Local, so a change that "fixes" one of these by accident goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { commentRows, heatRows, seedComment, setCommentFlags } from './sc-neutral.ts';
import { computeMetrics } from '../src/db/repos/admin/metrics.ts';
import { deleteComment } from '../src/db/repos/social/comments.ts';
import { talkedAbout } from '../src/db/repos/discover/activity-stats.ts';
import { risingChart } from '../src/db/repos/discover/explore.ts';

const ep = { feedUrl: 'https://feeds.example.com/removed.xml', guid: 'r1', title: 'Removed', showTitle: 'Show', enclosureUrl: 'https://cdn/r1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

test('finding 4: a removed comment counts in "talked about" and on the heat curve, not in comment counts or "rising"', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 1_000_000, publishedAt: new Date().toISOString() });
  const a = await signUp(t);
  const b = await signUp(t, 'b-removed@example.com', 'Bea');
  await seedComment(t, { episodeId: EP, authorId: a.id, body: 'kept', offsetMs: 100_000 });
  const gone = await seedComment(t, { episodeId: EP, authorId: b.id, body: 'removed', offsetMs: 900_000 });
  await setCommentFlags(t, gone, { removed: true });

  const talked = (await talkedAbout(t.db)).find((r) => r.episodeId === EP);
  assert.equal(talked?.comments, 2, '"talked about" still counts the removed comment (no removed filter)');

  const heat = await heatRows(t, EP);
  assert.deepEqual(heat.map((h) => Number(h.bucket)).sort((x, y) => x - y), [10, 90], 'the heat curve keeps the removed comment\'s moment');

  const res = await t.call('POST', '/v1/episodes/comment-counts', { ids: [EP] });
  assert.equal(((await res.json()) as { counts: Record<string, number> }).counts[EP], 1, 'the comment count leaves it out');

  const rising = (await risingChart(t.db)).find((r) => r.episode.id === EP);
  assert.equal(rising?.score, 1, '"rising" leaves it out (+1 this week, not +2)');
  await t.close();
});

/**
 * Lane NB (gate-log "Lane NB"): the admin dashboard's comments-per-day counts every comment by its day, so a comment turned
 * into a placeholder (deleted, but it has a reply) still counts and one deleted without replies does not. The placeholder
 * has lost its author pointer, so it is counted from the placeholder index (keys.ts G5placeholder).
 */
test('NB: the dashboard\'s comments per day still counts a placeholder, not a comment deleted without replies', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 1_000_000, publishedAt: new Date().toISOString() });
  const a = await signUp(t);
  const b = await signUp(t, 'b-placeholder@example.com', 'Bea');
  const kept = await seedComment(t, { episodeId: EP, authorId: a.id, body: 'has a reply' });
  await seedComment(t, { episodeId: EP, authorId: b.id, body: 'the reply', parentId: kept });
  const leaf = await seedComment(t, { episodeId: EP, authorId: a.id, body: 'no reply' });
  const perDay = async () => {
    const m = await computeMetrics(t.db, 7);
    assert.ok(m.sections.social.ok, 'the social section answers');
    return (m.sections.social as { commentsPerDay: { value: number }[] }).commentsPerDay.reduce((n, p) => n + p.value, 0);
  };
  assert.equal(await perDay(), 3, 'three comments today');

  assert.deepEqual(await deleteComment(t.db, kept), { placeholder: true, episodeId: `${EP}` });
  assert.deepEqual(await deleteComment(t.db, leaf), { placeholder: false, episodeId: `${EP}` });
  const rows = await commentRows(t);
  assert.deepEqual(rows.map((r) => [r.id, r.author_id, r.body, r.deleted_at !== null]).sort(), [[kept, null, null, true], [rows.find((r) => r.id !== kept)!.id, b.id, 'the reply', false]].sort(),
    'one placeholder (no author, no words) and the reply are left');
  assert.equal(await perDay(), 2, 'the placeholder still counts on its day; the comment deleted without replies does not');
  await t.close();
});
