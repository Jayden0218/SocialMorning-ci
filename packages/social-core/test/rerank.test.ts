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

test('A6: no more than three of one category in the list', () => {
  const sameGenre = Array.from({ length: 8 }, (_, i) => s(cand(`g${i}`, `https://f/g${i}`, 1318), 9 - i * 0.1));
  const spread = Array.from({ length: 8 }, (_, i) => s(cand(`x${i}`, `https://f/x${i}`, 1400 + i), 1));
  const out = rerank([...sameGenre, ...spread], NONE);
  assert.equal(out.filter((x) => x.candidate.genreId === 1318).length, MAX_PER_GENRE_TOP20);
});

test('A6: the hand-picked episode is index 0 even when it scores last', () => {
  const pick = s(cand('pick', 'https://f/pick', 1, 'pick'), -99);
  const rest = [1, 2, 3].map((i) => s(cand(`r${i}`, `https://f/r${i}`, 10 + i), 10));
  const out = rerank([...rest, pick], NONE);
  assert.equal(out[0]!.candidate.episodeId, 'pick');
  assert.equal(out.length, 4);
});

test('an episode with no category is exempt from the category cap but not from the show cap', () => {
  const noGenre = Array.from({ length: 5 }, (_, i) => s(cand(`n${i}`, `https://f/n${i}`, null), 5));
  const out = rerank(noGenre, NONE);
  assert.equal(out.length, 5, 'null genre never trips the category cap');

  const oneShow = Array.from({ length: 5 }, (_, i) => s(cand(`m${i}`, 'https://f/same', null), 5));
  assert.equal(rerank(oneShow, NONE).length, 1, 'but the show cap still bites');
});

test('the list ends short rather than breaking a rule', () => {
  const out = rerank(Array.from({ length: 30 }, (_, i) => s(cand(`z${i}`, 'https://f/only', 1318), 5)), NONE);
  assert.equal(out.length, 1);
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
