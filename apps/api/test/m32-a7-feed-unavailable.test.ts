// Tests M32 T049 (review finding A7): a feed that cannot be read is `feed_unavailable` (503), not "not in its show's feed" (404).
/** Guard — the break that turns it red: put `.catch(() => undefined)` back on findEpisodeInFeed in routes/library/episodes.ts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';

const FEED = 'https://pub.example/feed.xml';
const GUID = 'g-1';
const ID = fnv1a64(FEED + '\u0001' + GUID);
const put = (t: Awaited<ReturnType<typeof freshDb>>, token: string) => t.call('PUT', `/v1/episodes/${ID}`, { feedUrl: FEED, guid: GUID, title: 'T', enclosureUrl: 'https://cdn.example/a.mp3' }, token);
const RSS = '<rss version="2.0"><channel><title>S</title><item><guid>other</guid><title>Other</title><enclosure url="https://cdn.example/o.mp3" type="audio/mpeg"/></item></channel></rss>';

test('A7: a feed that fails to load is 503 feed_unavailable and the cause is logged', async () => {
  const logged: unknown[][] = [];
  const realWarn = console.warn; const realErr = console.error;
  console.warn = (...a: unknown[]) => { logged.push(a); }; console.error = (...a: unknown[]) => { logged.push(a); };
  const t = await freshDb({ catalogFetch: (async () => { throw new Error('getaddrinfo ENOTFOUND pub.example'); }) as unknown as typeof fetch });
  try {
    const a = await signUp(t, 'a7@example.com', 'A7');
    const r = await put(t, a.token);
    console.warn = realWarn; console.error = realErr;
    assert.equal(r.status, 503);
    assert.equal(((await r.json()) as { error: string }).error, 'feed_unavailable');
    assert.ok(logged.some((l) => l.map(String).join(' ').includes('ENOTFOUND')), 'the cause is logged');
  } finally { console.warn = realWarn; console.error = realErr; await t.close(); }
});

test('A7: a feed that loads but does not list the guid is still 404 not_found', async () => {
  const t = await freshDb({ catalogFetch: (async () => new Response(RSS)) as unknown as typeof fetch });
  try {
    const a = await signUp(t, 'a7b@example.com', 'A7b');
    const r = await put(t, a.token);
    assert.equal(r.status, 404);
    assert.equal(((await r.json()) as { error: string }).error, 'not_found');
  } finally { await t.close(); }
});
