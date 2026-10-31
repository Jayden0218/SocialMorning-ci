// Tests Studio data: yesterday, top episodes, episode table and CSV matching.
/**
 * M11 US2 — Data: yesterday, top episodes, the episode table, CSV and "listeners also follow".
 *
 * The breaks that turn the guards red:
 *   G-E1 (CSV = screen): in `src/db/repos/studio/studio-numbers.ts` `episodeCsv`, write `e.comments` in the Plays column.
 *   G-L1 (hidden under 5): set `ALSO_FOLLOW_MIN` to 4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, type TestDb } from './harness.ts';
import { addEpisode, day, noon, proveClaim, sCall, studioLogin, type StudioUser } from './studio-harness.ts';
import { seedComment } from './sc-neutral.ts';
import * as S from './st-neutral.ts';

const F = 'https://feeds.example.com/f.xml';

async function get<T>(t: TestDb, who: StudioUser, path: string): Promise<T> {
  const r = await sCall(t, 'GET', path, who);
  assert.equal(r.status, 200, `${path}: ${r.status}`);
  return (await r.json()) as T;
}

async function setup(t: TestDb) {
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, F);
  await addEpisode(t, F, 'E1', 'Alpha, "the first"', 1_000_000, noon(9));
  await addEpisode(t, F, 'E2', 'Beta 第二集', 2_000_000, noon(5));
  await addEpisode(t, F, 'E3', 'Gamma', null, noon(1));
  const ls = await Promise.all(['a', 'b', 'c'].map((n) => studioLogin(t, `${n}@example.com`, n)));
  const listen = (who: string, ep: string, d: number) => S.seedListened(t, { actorId: who, episodeId: ep, day: day(d), at: noon(d) });
  await listen(ls[0]!.id, 'E2', 1); await listen(ls[1]!.id, 'E2', 1); await listen(ls[2]!.id, 'E2', 3);
  await listen(ls[0]!.id, 'E1', 0);
  await seedComment(t, { episodeId: 'E1', authorId: ls[0]!.id, body: 'hi', agoMs: Date.now() - Date.parse(noon(0)) });
  await seedComment(t, { episodeId: 'E2', authorId: ls[0]!.id, body: 'yo', agoMs: Date.now() - Date.parse(noon(1)) });
  await S.seedShare(t, { listenerId: null, targetKind: 'episode', targetId: 'E2', feedUrl: F, at: noon(1) });
  await S.seedShare(t, { listenerId: null, targetKind: 'episode', targetId: 'E2', feedUrl: F, at: noon(4) });
  return { owner, key, ls };
}

test('yesterday counts only yesterday (UTC here)', async () => {
  const t = await freshDb();
  const { owner, key } = await setup(t);
  assert.deepEqual(await get(t, owner, `/v1/studio/shows/${key}/yesterday?tz=UTC`), { plays: 2, subs: 0, comments: 1, shares: 1 });
  await t.close();
});

test('top episodes by plays, zero-play episodes left out', async () => {
  const t = await freshDb();
  const { owner, key } = await setup(t);
  const r = await get<{ items: { id: string; plays: number }[] }>(t, owner, `/v1/studio/shows/${key}/top-episodes`);
  assert.deepEqual(r.items.map((e) => [e.id, e.plays]), [['E2', 3], ['E1', 1]]);
  await t.close();
});

test('the episode table sorts, searches and pages', async () => {
  const t = await freshDb();
  const { owner, key } = await setup(t);
  type Page = { total: number; items: { id: string; plays: number; comments: number; shares: number }[] };
  const byDate = await get<Page>(t, owner, `/v1/studio/shows/${key}/episodes`);
  assert.deepEqual(byDate.items.map((e) => e.id), ['E3', 'E2', 'E1']);
  const byPlays = await get<Page>(t, owner, `/v1/studio/shows/${key}/episodes?sort=plays&dir=asc`);
  assert.deepEqual(byPlays.items.map((e) => e.id), ['E3', 'E1', 'E2']);
  const search = await get<Page>(t, owner, `/v1/studio/shows/${key}/episodes?q=${encodeURIComponent('第二')}`);
  assert.deepEqual([search.total, search.items[0]?.id, search.items[0]?.shares], [1, 'E2', 2]);
  await t.close();
});

test('G-E1: the episodes CSV carries exactly the numbers the table shows', async () => {
  const t = await freshDb();
  const { owner, key } = await setup(t);
  const table = await get<{ items: { title: string; plays: number; comments: number; shares: number; saves: number; likes: number }[] }>(t, owner, `/v1/studio/shows/${key}/episodes`);
  const res = await sCall(t, 'GET', `/v1/studio/shows/${key}/export/episodes.csv`, owner);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename=".+-episodes\.csv"/);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf], 'a UTF-8 BOM, so spreadsheets read Chinese titles (res.text() would strip it)');
  const lines = new TextDecoder().decode(bytes).trim().split('\r\n');
  assert.equal(lines[0], 'Title,Published,Plays,Completion %,Comments,Shares,Saves,Likes');
  assert.equal(lines.length - 1, table.items.length);
  assert.equal(lines.find((l) => l.startsWith('"Alpha, ""the first"""')) !== undefined, true, 'a comma and quotes are escaped');
  for (const e of table.items) {
    const line = lines.find((l) => l.includes(e.title.replace(/"/g, '""')))!;
    const cells = line.split(',').slice(-6);
    assert.deepEqual([cells[0], cells[2], cells[3], cells[4], cells[5]].map(Number), [e.plays, e.comments, e.shares, e.saves, e.likes], e.title);
  }
  const trend = await (await sCall(t, 'GET', `/v1/studio/shows/${key}/export/trend.csv?metric=plays&days=7&tz=UTC`, owner)).text();
  const json = await get<{ days: { date: string; value: number }[] }>(t, owner, `/v1/studio/shows/${key}/trend?metric=plays&days=7&tz=UTC`);
  assert.deepEqual(trend.trim().split('\r\n').slice(1), json.days.map((d) => `${d.date},${d.value}`));
  await t.close();
});

test('G-L1: "also follow" is hidden at 4 subscribers and shown at 5, never naming anyone', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, F);
  const other = 'https://feeds.example.com/other.xml';
  await addEpisode(t, other, 'O1', 'Other ep', 1000);
  const ls = await Promise.all([1, 2, 3, 4, 5].map((i) => studioLogin(t, `s${i}@example.com`, `Sub${i}`)));
  for (const l of ls.slice(0, 4)) { await S.seedSubscription(t, { listenerId: l.id, feedUrl: F }); await S.seedSubscription(t, { listenerId: l.id, feedUrl: other }); }
  assert.deepEqual(await get(t, owner, `/v1/studio/shows/${key}/also-follow`), { hidden: 'too_few' });
  await S.seedSubscription(t, { listenerId: ls[4]!.id, feedUrl: F });
  const shown = await get<{ shows: { feedUrl: string; listeners: number }[] }>(t, owner, `/v1/studio/shows/${key}/also-follow`);
  assert.deepEqual(shown.shows.map((s) => [s.feedUrl, s.listeners]), [[other, 4]]);
  assert.doesNotMatch(JSON.stringify(shown), /Sub\d|@example/);
  await t.close();
});

test('an episode page: its numbers, a normalised 100-bucket curve, comments per minute; another show\'s episode is 404', async () => {
  const t = await freshDb();
  const { owner, key, ls } = await setup(t);
  await S.seedHeat(t, 'E1', { 10: 2, 50: 4 });
  await seedComment(t, { episodeId: 'E1', authorId: ls[1]!.id, body: 'm', offsetMs: 125000 });
  await seedComment(t, { episodeId: 'E1', authorId: ls[1]!.id, body: 'n', offsetMs: 130000, agoMs: 10_000 });
  const d = await get<{ heat: number[]; commentsByMinute: { minute: number; count: number }[]; episode: { id: string } }>(t, owner, `/v1/studio/shows/${key}/episodes/E1`);
  assert.equal(d.heat.length, 100);
  assert.deepEqual([d.heat[10], d.heat[50], d.heat[0]], [0.5, 1, 0]);
  assert.deepEqual(d.commentsByMinute, [{ minute: 2, count: 2 }]);
  await addEpisode(t, 'https://feeds.example.com/x.xml', 'X1', 'Not this show', 1000);
  assert.equal((await sCall(t, 'GET', `/v1/studio/shows/${key}/episodes/X1`, owner)).status, 404);
  await t.close();
});
