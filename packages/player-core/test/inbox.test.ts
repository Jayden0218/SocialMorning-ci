import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxOf } from '../src/inbox.ts';

const F = 'https://f/a.xml';
const base = { subscriptions: [{ feedUrl: F, subscribedAt: 1_000 }], positions: new Set<string>(), completeDownloads: new Set<string>(), left: new Set<string>() };

// quickstart A5 — guard G5
test('A5: before-subscription, played, dismissed and downloaded episodes are out; the new one is in', () => {
  const episodes = [
    { id: 'old', feedUrl: F, publishedAt: 999 },
    { id: 'new', feedUrl: F, publishedAt: 2_000 },
    { id: 'newer', feedUrl: F, publishedAt: 3_000 },
    { id: 'played', feedUrl: F, publishedAt: 2_500 },
    { id: 'gone', feedUrl: F, publishedAt: 2_600 },
    { id: 'dl', feedUrl: F, publishedAt: 2_700 },
    { id: 'undated', feedUrl: F },
    { id: 'other', feedUrl: 'https://f/b.xml', publishedAt: 5_000 },
  ];
  const out = inboxOf({ ...base, episodes, positions: new Set(['played']), left: new Set(['gone']), completeDownloads: new Set(['dl']) });
  assert.deepEqual(out, ['newer', 'new']);
});

// SC-007
test('SC-007: a show with 500 back-catalogue episodes gives an empty inbox; the next published one appears', () => {
  const episodes = Array.from({ length: 500 }, (_, i) => ({ id: `b${i}`, feedUrl: F, publishedAt: i }));
  assert.deepEqual(inboxOf({ ...base, episodes }), []);
  assert.deepEqual(inboxOf({ ...base, episodes: [...episodes, { id: 'fresh', feedUrl: F, publishedAt: 1_000 }] }), ['fresh']);
});
