// Tests the Studio's retention curve, live count, demographics floor, and scheduled announcements.
/**
 * M19 US12 (quickstart A8, A10). Guard G-M19-8: Demographics never shows a group under 10. The
 * break: make `bucket` in src/db/repos/studio/demographics.ts return the raw count; the '<10'
 * test goes red. Guard G-M19-9: a scheduled announcement is not on the show page or in host
 * notices before its time (drop `release_at <= now()` in either read).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { retention } from '../src/db/repos/studio/retention.ts';
import { demographics } from '../src/db/repos/studio/demographics.ts';

const FEED = 'https://f/x.xml';

test('retention: the share of starters still listening at each minute', async () => {
  const t = await freshDb();
  const ls = [] as string[];
  for (let i = 0; i < 4; i++) ls.push((await signUp(t, `r${i}@example.com`, `R${i}`)).id);
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, duration_ms) VALUES ('e1', $1, 'g', 'Ep', 'Show', 'https://c/x.mp3', 180000)", [FEED]);
  // two hear all three minutes, one stops after the first, one hears only minute 2 (split over two days)
  const put = (l: string, day: string, ranges: number[][]) => t.q("INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, 'e1', $2, 'd', $3::jsonb)", [l, day, JSON.stringify(ranges)]);
  await put(ls[0]!, '2026-10-01', [[0, 180000]]);
  await put(ls[1]!, '2026-10-01', [[0, 90000]]);
  await put(ls[1]!, '2026-10-02', [[90000, 180000]]);
  await put(ls[2]!, '2026-10-01', [[0, 60000]]);
  await put(ls[3]!, '2026-10-01', [[60000, 120000]]);
  assert.deepEqual(await retention(t.db, 'e1', 180000), [0.75, 0.75, 0.5]);
  assert.deepEqual(await retention(t.db, 'nothing', null), []);
  await t.close();
});

test('G-M19-8: demographics hides every group under 10', async () => {
  const t = await freshDb();
  for (let i = 0; i < 13; i++) {
    const u = await signUp(t, `d${i}@example.com`, `D${i}`);
    await t.q('UPDATE listeners SET age_range = $2, gender = $3 WHERE id = $1', [u.id, i < 11 ? '25-34' : '45-54', i < 2 ? 'woman' : null]);
    await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-09-20T10:00:00.000Z' }] }, u.token);
  }
  const d = await demographics(t.db, FEED);
  assert.equal(d.total, 13);
  assert.deepEqual(d.age, [{ key: '25-34', count: 11 }, { key: '45-54', count: '<10' }]);
  assert.deepEqual(d.gender, [{ key: 'woman', count: '<10' }], 'blank answers are not a group');
  await t.close();
});

test('G-M19-9: a scheduled announcement waits for its time in the show extras and host notices', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-09-20T10:00:00.000Z' }] }, a.token);
  await t.q("INSERT INTO announcements (feed_url, body, images, release_at) VALUES ($1, 'Now', '[\"https://img/1.jpg\"]', now() - interval '1 hour'), ($1, 'Later', '[]', now() + interval '1 day')", [FEED]);
  const notices = (await (await t.call('GET', '/v1/me/host-notices', undefined, a.token)).json()) as { items: { body: string; images: string[] }[] };
  assert.deepEqual(notices.items.map((n) => n.body), ['Now']);
  assert.deepEqual(notices.items[0]!.images, ['https://img/1.jpg']);
  const extras = (await (await t.call('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(FEED)}`)).json()) as { announcements: { body: string }[] };
  assert.deepEqual(extras.announcements.map((n) => n.body), ['Now']);
  await t.close();
});

test('the monthly report counts the month\'s listening, comments and clips', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1', $1, 'g1', 'One', 'Show', 'https://c/1.mp3'), ('e2', $1, 'g2', 'Two', 'Show', 'https://c/2.mp3')", [FEED]);
  await t.q("INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, 'e1', '2026-09-03', 'd', '[[0, 600000]]'), ($1, 'e2', '2026-09-20', 'd', '[[0, 120000]]'), ($1, 'e2', '2026-10-01', 'd', '[[0, 999999]]')", [a.id]);
  await t.q("INSERT INTO comments (episode_id, author_id, body, created_at) VALUES ('e1', $1, 'hi', '2026-09-10T10:00:00Z')", [a.id]);
  const r = (await (await t.call('GET', '/v1/me/report?month=2026-09', undefined, a.token)).json()) as { minutes: number; shows: number; episodes: number; topEpisodes: { id: string }[]; comments: number; clips: number };
  assert.equal(r.minutes, 12);
  assert.equal(r.shows, 1);
  assert.equal(r.episodes, 2);
  assert.deepEqual(r.topEpisodes.map((e) => e.id), ['e1', 'e2']);
  assert.equal(r.comments, 1);
  assert.equal(r.clips, 0);
  assert.equal((await t.call('GET', '/v1/me/report?month=2026-13', undefined, a.token)).status, 422);
  await t.close();
});
