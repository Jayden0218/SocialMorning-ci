/**
 * M8 (quickstart A1, A2 · guard G-R2) — Swing show-to-show similarity.
 *
 * The property that matters is not "similar things come out similar". It is that a
 * **small circle counts for less**: two people who like all the same things are weak
 * evidence that any two of those things are alike. That is the whole reason Swing was
 * chosen over cosine ItemCF for an app whose user base is one group of friends.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestNeighbourSim, swingSimilarity, type Liker } from '../src/swing.ts';

const liker = (id: string, ...shows: string[]): Liker => ({ listenerId: id, shows });

test('A1: a pair from a small circle contributes less than a pair of independent listeners', () => {
  // CLIQUE: u1 and u2 like all eight of the same shows — a 微信群.
  const clique = [
    liker('u1', 'A', 'B', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'),
    liker('u2', 'A', 'B', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'),
    liker('u3', 'A', 'B'),
  ];
  // INDEPENDENT: three listeners who share only A and B.
  const independent = [
    liker('v1', 'A', 'B', 'x1'),
    liker('v2', 'A', 'B', 'y1'),
    liker('v3', 'A', 'B'),
  ];

  // Raw scores are normalised globally, so compare within one run: put both worlds in
  // one input with disjoint shows and disjoint listeners.
  const both = swingSimilarity([
    ...clique,
    ...independent.map((l) => ({ listenerId: l.listenerId, shows: l.shows.map((s) => (s === 'A' ? 'P' : s === 'B' ? 'Q' : s)) })),
  ]);

  const cliquePair = both.get('A')!.find((n) => n.show === 'B')!.sim;
  const independentPair = both.get('P')!.find((n) => n.show === 'Q')!.sim;
  assert.ok(cliquePair < independentPair, `small circle ${cliquePair} should count for less than independents ${independentPair}`);
  assert.equal(independentPair, 1, 'the strongest pair in the run normalises to 1');
});

test('A2 (G-R2): a show with 2 likers appears nowhere; with 3 it does', () => {
  const likers = [
    liker('u1', 'thin', 'thick', 'other'),
    liker('u2', 'thin', 'thick', 'other'),
    liker('u3', 'thick', 'other'),
  ];
  const n = swingSimilarity(likers);
  assert.equal(n.has('thin'), false, '2 likers is below MIN_LIKERS');
  assert.ok(n.has('thick'), '3 likers qualifies');
  assert.ok(n.has('other'));
  // Lowering the floor lets the thin show in — which is exactly the break G-R2 watches.
  assert.ok(swingSimilarity(likers, { minLikers: 1 }).has('thin'));
});

test('one shared listener is not evidence: Swing needs a PAIR of co-likers', () => {
  const likers = [
    liker('u1', 'A', 'B'),
    liker('u2', 'A', 'C'),
    liker('u3', 'A', 'D'),
    liker('u4', 'B', 'C'), liker('u5', 'B', 'C'), liker('u6', 'B', 'C'),
  ];
  const n = swingSimilarity(likers);
  // A and B share only u1 → nothing. B and C share u4, u5, u6 → a score.
  assert.equal((n.get('A') ?? []).find((x) => x.show === 'B'), undefined);
  assert.ok(n.get('B')!.some((x) => x.show === 'C'));
});

test('duplicates in the input count once; the result is symmetric, sorted, and capped', () => {
  const likers = [
    liker('u1', 'A', 'A', 'B', 'C'),
    { listenerId: 'u1', shows: ['A', 'B', 'C'] },
    liker('u2', 'A', 'B', 'C'),
    liker('u3', 'A', 'B', 'C'),
  ];
  const n = swingSimilarity(likers);
  assert.deepEqual(n.get('A')!.map((x) => x.show), ['B', 'C'], 'ties break by show name, so the order is stable');
  assert.equal(n.get('A')!.find((x) => x.show === 'B')!.sim, n.get('B')!.find((x) => x.show === 'A')!.sim, 'symmetric');
  assert.equal(swingSimilarity(likers, { maxNeighbours: 1 }).get('A')!.length, 1, 'capped');
  assert.equal(swingSimilarity(likers, { alpha: 500 }).get('A')![0]!.sim, 1, 'alpha only scales; the top pair still normalises to 1');
});

test('nothing in, nothing out — and a listener who likes one thing cannot make a neighbour', () => {
  assert.equal(swingSimilarity([]).size, 0);
  assert.equal(swingSimilarity([liker('u1', 'A'), liker('u2', 'A'), liker('u3', 'A')]).size, 0, 'one show cannot be similar to itself');
});

test('bestNeighbourSim: the strongest link into what the listener already likes, else 0', () => {
  const n = new Map([['A', [{ show: 'B', sim: 0.9 }, { show: 'C', sim: 0.4 }]]]);
  assert.equal(bestNeighbourSim(n, 'A', new Set(['C', 'B'])), 0.9);
  assert.equal(bestNeighbourSim(n, 'A', new Set(['C'])), 0.4);
  assert.equal(bestNeighbourSim(n, 'A', new Set(['Z'])), 0);
  assert.equal(bestNeighbourSim(n, 'unknown-show', new Set(['B'])), 0);
});
