// Pins where a moderator-removed comment still counts and where it does not — the same on Postgres and on DynamoDB.
/**
 * M26 lane LE, access-patterns.md finding 4 (behaviour kept, owner's decision still open). Read from today's Postgres SQL:
 *   - "talked about" windows (discover/activity-stats.ts `talkedAbout`): `parent_id IS NULL AND deleted_at IS NULL AND
 *     host_hidden_at IS NULL` — NO `removed_at` filter: a removed comment COUNTS;
 *   - the heat curve (library/heat.ts): no `removed_at` filter: a removed comment's moment COUNTS;
 *   - pick-card / Updates counts (discover-extras.ts `statsFor`, POST /v1/episodes/comment-counts — lane SC's `commentCount`
 *     on DynamoDB): `removed_at IS NULL`: a removed comment does NOT count;
 *   - "rising" (explore.ts `risingChart`): `removed_at IS NULL`: it does NOT count.
 * The test runs on both backends (gate on PGlite; ddb-api on DynamoDB Local, bridge on and off), so a change on either side
 * that "fixes" one of these by accident goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { heatRows, seedComment, setCommentFlags } from './sc-neutral.ts';
import { talkedAbout } from '../src/db/repos/discover/activity-stats.ts';
import { risingChart } from '../src/db/repos/discover/explore.ts';
import { clearEpisodeHeat, insertEpisodeHeat } from '../src/db/repos/library/heat.ts';

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
  // The heat rebuild (Postgres: the comments were written straight in, so the curve is rebuilt from them; DynamoDB: the
  // marks are live — with the bridge on it rebuilds from the bridged rows, off it changes nothing).
  await clearEpisodeHeat(t.db, `${EP}`);
  await insertEpisodeHeat(t.db, `${EP}`);

  const talked = (await talkedAbout(t.db)).find((r) => r.episodeId === EP);
  assert.equal(talked?.comments, 2, '"talked about" still counts the removed comment (no removed_at filter in the SQL)');

  const heat = await heatRows(t, EP);
  assert.deepEqual(heat.map((h) => Number(h.bucket)).sort((x, y) => x - y), [10, 90], 'the heat curve keeps the removed comment\'s moment');

  const res = await t.call('POST', '/v1/episodes/comment-counts', { ids: [EP] });
  assert.equal(((await res.json()) as { counts: Record<string, number> }).counts[EP], 1, 'the comment count leaves it out');

  const rising = (await risingChart(t.db)).find((r) => r.episode.id === EP);
  assert.equal(rising?.score, 1, '"rising" leaves it out (+1 this week, not +2)');
  await t.close();
});
