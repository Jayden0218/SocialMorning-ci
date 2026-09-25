/**
 * M8 (quickstart A6) — MMR plus the two hard rules.
 *
 * MMR makes a varied list likely. It does not make it certain, and "likely" is not what
 * FR-014 says. So the caps run as filters during selection, and when nothing left can
 * satisfy them the list ends short rather than breaking them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PER_GENRE_TOP20, pairSimilarity, rerank, SIM_SAME_GENRE, SIM_SAME_SHOW, TOP10, type Scored } from '../src/rerank.ts';
import type { RecCandidate } from '../src/rank.ts';
import type { Neighbour } from '../src/swing.ts';

const cand = (id: string, feedUrl: string, genreId: number | null = 1318, channel: RecCandidate['channel'] = 'talked'): RecCandidate => ({
  episodeId: id, feedUrl, genreId, channel,
  publishedAt: null, subscribed: false, neighbourSim: 0, genreMatch: false,
  socialCount: 0, talkedScore: 0, impressions: 0,
});
const s = (c: RecCandidate, score: number): Scored => ({ candidate: c, score });
const NONE = new Map<string, readonly Neighbour[]>();

test('A6: five episodes of one show → exactly one of them survives into the top 10', () => {
  const hoggers = [0, 1, 2, 3, 4].map((i) => s(cand(`hog${i}`, 'https://f/hog', 100 + i), 10 - i * 0.1));
  const others = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => s(cand(`o${i}`, `https://f/o${i}`, 200 + i), 5));
  const out = rerank([...hoggers, ...others], NONE);

  const top10 = out.slice(0, TOP10);
  assert.equal(top10.filter((x) => x.candidate.feedUrl === 'https://f/hog').length, 1);
  assert.equal(new Set(top10.map((x) => x.candidate.feedUrl)).size, top10.length, 'no show twice');
});

test('A6: no more than three of one category, while other categories still have candidates', () => {
  // Enough distinct-category candidates to fill the list without ever needing to repeat,
  // so the cap binds. (Amended FR-014 only yields when the list would otherwise be short.)
  const sameGenre = Array.from({ length: 8 }, (_, i) => s(cand(`g${i}`, `https://f/g${i}`, 1318), 9 - i * 0.1));
  const spread = Array.from({ length: 25 }, (_, i) => s(cand(`x${i}`, `https://f/x${i}`, 1400 + i), 1));
  const out = rerank([...sameGenre, ...spread], NONE);
  assert.equal(out.length, 20);
  assert.equal(out.filter((x) => x.candidate.genreId === 1318).length, MAX_PER_GENRE_TOP20);
});

test('A6: the hand-picked episode is index 0 even when it scores last', () => {
  const pick = s(cand('pick', 'https://f/pick', 1, 'pick'), -99);
  const rest = [1, 2, 3].map((i) => s(cand(`r${i}`, `https://f/r${i}`, 10 + i), 10));
  const out = rerank([...rest, pick], NONE);
  assert.equal(out[0]!.candidate.episodeId, 'pick');
  assert.equal(out.length, 4);
});

test('an episode with no category is exempt from the category cap; the show cap binds while other shows remain', () => {
  const noGenre = Array.from({ length: 5 }, (_, i) => s(cand(`n${i}`, `https://f/n${i}`, null), 5));
  assert.equal(rerank(noGenre, NONE).length, 5, 'null genre never trips the category cap');

  // Five from one show, and one other show available: the top 10 takes one of each first.
  const oneShow = Array.from({ length: 5 }, (_, i) => s(cand(`m${i}`, 'https://f/same', null), 5));
  const other = s(cand('other', 'https://f/other', null), 1);
  const out = rerank([...oneShow, other], NONE);
  assert.deepEqual(out.slice(0, 2).map((x) => x.candidate.feedUrl), ['https://f/same', 'https://f/other'],
    'the show cap holds until every show is represented');
});

test('FR-014 amended: one show with thirty episodes fills the list rather than showing one', () => {
  // Before 2026-09-26 this returned exactly 1 item, which is what L2 hit on the phone.
  const out = rerank(Array.from({ length: 30 }, (_, i) => s(cand(`z${i}`, 'https://f/only', 1318), 5)), NONE);
  assert.equal(out.length, 20);
  assert.equal(new Set(out.map((x) => x.candidate.episodeId)).size, 20, 'twenty distinct episodes, not one repeated');
});

test('MMR prefers variety at equal score: a Swing neighbour is held back behind an unrelated show', () => {
  const neighbours = new Map<string, readonly Neighbour[]>([
    ['https://f/b', [{ show: 'https://f/a', sim: 0.95 }]],
  ]);
  const a = s(cand('a', 'https://f/a', null), 5);
  const near = s(cand('b', 'https://f/b', null), 4.9);
  const far = s(cand('c', 'https://f/c', null), 4.8);
  const out = rerank([a, near, far], neighbours, { theta: 0.5 });
  assert.deepEqual(out.map((x) => x.candidate.episodeId), ['a', 'c', 'b'], 'the near-duplicate drops behind the lower-scoring unrelated one');

  // With θ = 1 the diversity term is switched off and pure score order returns.
  assert.deepEqual(rerank([a, near, far], neighbours, { theta: 1 }).map((x) => x.candidate.episodeId), ['a', 'b', 'c']);
});

test('pairSimilarity: same show, then same category, then Swing, then nothing', () => {
  const a = cand('a', 'https://f/a', 1318);
  assert.equal(pairSimilarity(a, cand('a2', 'https://f/a', 9999), NONE), SIM_SAME_SHOW);
  assert.equal(pairSimilarity(a, cand('b', 'https://f/b', 1318), NONE), SIM_SAME_GENRE);
  assert.equal(pairSimilarity(cand('a', 'https://f/a', null), cand('b', 'https://f/b', null), NONE), 0);
  const n = new Map<string, readonly Neighbour[]>([['https://f/a', [{ show: 'https://f/z', sim: 0.3 }, { show: 'https://f/b', sim: 0.7 }]]]);
  assert.equal(pairSimilarity(cand('a', 'https://f/a', null), cand('b', 'https://f/b', 4), n), 0.7);
  assert.equal(pairSimilarity(cand('a', 'https://f/a', null), cand('q', 'https://f/q', 4), n), 0, 'not a neighbour');
});

test('size is respected, and an empty input gives an empty list', () => {
  const many = Array.from({ length: 30 }, (_, i) => s(cand(`e${i}`, `https://f/e${i}`, null), 30 - i));
  assert.equal(rerank(many, NONE).length, 20);
  assert.equal(rerank(many, NONE, { size: 3 }).length, 3);
  assert.deepEqual(rerank([], NONE), []);
});

/**
 * FR-014 as amended 2026-09-26, after L2 failed on the phone.
 *
 * The old behaviour was correct to the letter and useless in practice: a listener with
 * three subscribed shows and no chart filler got a list of **three**, because every
 * remaining candidate repeated a show already chosen. Diversity is a preference over a
 * full list, not over an empty one.
 *
 * The break that turns these red: set `allowance` back to a constant 0 in `rerank`.
 */
test('FR-014 amended: three shows and nothing else fills the list instead of ending at three', () => {
  const pool = ['a', 'b', 'c'].flatMap((show) =>
    Array.from({ length: 6 }, (_, i) => s(cand(`${show}${i}`, `https://f/${show}`, null), 10 - i)),
  );
  const out = rerank(pool, NONE);
  assert.equal(out.length, 18, 'every candidate is used rather than the list ending at 3');

  // …and the strict rule is still honoured first: the first three are one per show.
  assert.equal(new Set(out.slice(0, 3).map((x) => x.candidate.feedUrl)).size, 3);
});

test('FR-014 amended: an unrepresented show is always preferred to repeating one', () => {
  const many = Array.from({ length: 5 }, (_, i) => s(cand(`hog${i}`, 'https://f/hog', null), 10));
  const one = s(cand('other', 'https://f/other', null), 1); // much lower score
  const out = rerank([...many, one], NONE);
  assert.equal(out[1]!.candidate.episodeId, 'other', 'the low-scoring new show still comes before a repeat');
});

test('FR-014 amended: the caps still bind while other shows remain', () => {
  const hoggers = Array.from({ length: 5 }, (_, i) => s(cand(`h${i}`, 'https://f/hog', null), 10 - i * 0.1));
  const others = Array.from({ length: 9 }, (_, i) => s(cand(`o${i}`, `https://f/o${i}`, null), 5));
  const out = rerank([...hoggers, ...others], NONE);
  const top10 = out.slice(0, TOP10);
  assert.equal(top10.filter((x) => x.candidate.feedUrl === 'https://f/hog').length, 1, 'still one per show in the top 10');
});
