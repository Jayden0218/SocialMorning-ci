/** The phone-side filter is the server's rule over cached payloads (research R1). */
import { hiddenKey } from '@socialmorning/social-core';
import { filterClips, filterComments, filterFeed, filterListeners } from '../src/safety/filter';
import type { Clip, Comment, FeedItem } from '../src/social/api';

const c = (id: string, authorId: string | null, parentId: string | null = null, replies?: Comment[]): Comment =>
  ({ id, authorId, displayName: authorId, body: 'b', offsetMs: 1, parentId, createdAt: '2026-09-22T00:00:00Z', deleted: false, ...(replies ? { replies } : {}) });

it('filterComments: blocked authors out, a blocked reply under a kept parent is a placeholder, reported ids out; no sets → unchanged', () => {
  const comments = [c('t1', 'A', null, [c('r1', 'B', 't1'), c('r2', 'C', 't1')]), c('t2', 'B', null, [c('r3', 'A', 't2')]), c('t3', 'C')];
  const out = filterComments(comments, { blocked: new Set(['B']), hidden: new Set([hiddenKey('comment', 't3')]) });
  expect(out.map((x) => x.id)).toEqual(['t1']);
  expect(out[0]!.replies!.map((r) => `${r.id}:${r.blocked ? 'blocked' : r.body}`)).toEqual(['r1:blocked', 'r2:b']);
  expect(out[0]!.replies![0]).toMatchObject({ deleted: true, blocked: true, authorId: null, body: null, parentId: 't1' });
  expect(filterComments(comments, { blocked: new Set(), hidden: new Set() })).toEqual(comments);
});

it('filterClips / filterFeed / filterListeners', () => {
  const clip = (id: string, a: string): Clip => ({ id, author: { id: a, displayName: a }, episodeId: 'e', startMs: 0, endMs: 1000, caption: '', createdAt: '', deleted: false });
  expect(filterClips([clip('k1', 'A'), clip('k2', 'B'), clip('k3', 'A')], { blocked: new Set(['B']), hidden: new Set([hiddenKey('clip', 'k3')]) }).map((k) => k.id)).toEqual(['k1']);
  const item = (id: number, a: string): FeedItem => ({ id, kind: 'commented', actor: { id: a, displayName: a }, episode: { id: 'e', title: 't', showTitle: null, imageUrl: null }, momentMs: null, refId: null, createdAt: '' });
  expect(filterFeed([item(1, 'A'), item(2, 'B')], { blocked: new Set(['B']), hidden: new Set() }).map((i) => i.id)).toEqual([1]);
  expect(filterListeners([{ id: 'A', displayName: 'A' }, { id: 'B', displayName: 'B' }, { id: 'C', displayName: 'C' }], { blocked: new Set(['B']), hidden: new Set([hiddenKey('profile', 'C')]) }).map((l) => l.id)).toEqual(['A']);
});
