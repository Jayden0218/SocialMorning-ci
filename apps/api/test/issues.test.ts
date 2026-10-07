// Tests past picks, curated issues and the full talked-about chart.
/**
 * M12 FR-070 (past picks), FR-101 (curated issues) and FR-071 (the full "Talked about" chart).
 * Picks and issues come from the picks file; nothing here fetches a feed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64, validateIssues } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import shipped from '../picks.json' with { type: 'json' };

const F = 'https://feeds.example.com/a.xml';
const G = 'https://feeds.example.com/b.xml';
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}`;
const picksRaw = {
  picks: [
    ...[10, 11, 12, 13, 14, 15, 16, 17, 18].map((d) => ({ date: day(d), feedUrl: F, guid: 'a1', why: `Pick of the ${d}th.` })),
    { date: day(18), feedUrl: G, why: 'A show pick.', order: 1 },
    { date: day(30), feedUrl: F, guid: 'a1', why: 'Tomorrow.' },
  ],
  issues: [
    { id: 'issue-1', date: day(20), title: 'First', intro: 'Two episodes.', items: [{ order: 2, feedUrl: G, note: 'The newest.' }, { order: 1, feedUrl: F, guid: 'a1', note: 'This one.' }] },
    { id: 'issue-2', date: day(25), title: 'Second', intro: 'Later.', items: [] },
    { id: 'issue-3', date: day(30), title: 'Not out yet', intro: 'Tomorrow.', items: [] },
  ],
};
const register = (t: Awaited<ReturnType<typeof freshDb>>, feedUrl: string, guid: string, title: string) =>
  putEpisode(t, `${fnv1a64(`${feedUrl}\u0001${guid}`)}`, { feedUrl, guid, title, showTitle: 'S', enclosureUrl: `https://cdn/${guid}.mp3` });

test('FR-070: past picks — 7 days a page, newest first, never the future, next until the end; episodes the server knows come as cards', async () => {
  const t = await freshDb({ picksRaw, today: () => day(29) });
  await register(t, F, 'a1', 'A one');
  type Page = { days: { date: string; picks: { feedUrl: string; why: string; episode: { title: string } | null }[] }[]; next?: string };
  const one = (await (await t.call('GET', '/v1/picks/past')).json()) as Page;
  assert.deepEqual(one.days.map((d) => d.date), [day(18), day(17), day(16), day(15), day(14), day(13), day(12)]);
  assert.deepEqual(one.days[0]!.picks.map((p) => [p.why, p.episode?.title ?? null]), [['A show pick.', null], ['Pick of the 18th.', 'A one']]);
  assert.equal(one.next, day(12));
  const two = (await (await t.call('GET', `/v1/picks/past?before=${one.next}`)).json()) as Page;
  assert.deepEqual(two.days.map((d) => d.date), [day(11), day(10)]);
  assert.equal(two.next, undefined);
  assert.equal((await t.call('GET', '/v1/picks/past?before=yesterday')).status, 422);
  await t.close();
});

test('FR-101: issues — newest first, none from the future; one issue with its items in order; unknown → 404', async () => {
  const t = await freshDb({ picksRaw, today: () => day(29) });
  await register(t, G, 'b9', 'Newest of B');
  await register(t, F, 'a1', 'A one');
  const list = (await (await t.call('GET', '/v1/issues')).json()) as { issues: { id: string; date: string; title: string }[] };
  // M21 T086: the issue number — oldest out = 1.
  assert.deepEqual(list.issues, [{ id: 'issue-2', number: 2, date: day(25), title: 'Second' }, { id: 'issue-1', number: 1, date: day(20), title: 'First' }]);
  const one = (await (await t.call('GET', '/v1/issues/issue-1')).json()) as { number: number; title: string; intro: string; items: { order: number; note: string; episode: { title: string } | null }[] };
  assert.deepEqual([one.number, one.title, one.intro], [1, 'First', 'Two episodes.']);
  assert.deepEqual(one.items.map((i) => [i.order, i.note, i.episode?.title]), [[1, 'This one.', 'A one'], [2, 'The newest.', 'Newest of B']]);
  assert.equal((await t.call('GET', '/v1/issues/issue-3')).status, 404, 'not out yet');
  assert.equal((await t.call('GET', '/v1/issues/nope')).status, 404);
  await t.close();
});

test('FR-101: the shipped picks file has one valid issue, and it names only feeds already picked', () => {
  const r = validateIssues(shipped);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.issues.length, 1);
  const picked = new Set((shipped as unknown as { picks: { feedUrl: string }[] }).picks.map((p) => p.feedUrl));
  assert.ok(r.issues[0]!.items.every((i) => picked.has(i.feedUrl)));
});

test('FR-071: the full chart is Discover\'s "Talked about" ranking, un-truncated up to limit (1–100)', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ids: string[] = [];
  for (let n = 1; n <= 12; n++) {
    await register(t, F, `c${n}`, `Chart ${n}`);
    ids.push(fnv1a64(`${F}\u0001c${n}`));
  }
  // Episode n gets n comments: the ranking is 12, 11, …, 1 — more than Discover's 10.
  for (let n = 1; n <= 12; n++) {
    for (let k = 0; k < n; k++) await t.q('INSERT INTO comments (episode_id, author_id, body) VALUES ($1, $2, $3)', [ids[n - 1], a.id, `c${k}`]);
  }
  type Chart = { items: { rank: number; score: number; episode: { title: string } }[] };
  const all = (await (await t.call('GET', '/v1/discover/chart')).json()) as Chart;
  assert.equal(all.items.length, 12);
  assert.deepEqual(all.items.slice(0, 3).map((i) => [i.rank, i.episode.title, i.score]), [[1, 'Chart 12', 24], [2, 'Chart 11', 22], [3, 'Chart 10', 20]]);
  const three = (await (await t.call('GET', '/v1/discover/chart?limit=3')).json()) as Chart;
  assert.deepEqual(three.items.map((i) => i.episode.title), ['Chart 12', 'Chart 11', 'Chart 10']);
  for (const bad of ['0', '101', 'x', '2.5']) assert.equal((await t.call('GET', `/v1/discover/chart?limit=${bad}`)).status, 422);
  await t.close();
});
