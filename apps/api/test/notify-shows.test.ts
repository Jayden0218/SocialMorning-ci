/**
 * M12 FR-093 — per-show notifications. Every live subscription is listed, on by default; a
 * show turned off is skipped by the M10b new-episode sender (and only that show).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { fanOutNewEpisode } from '../src/db/repos/push.ts';

const A = 'https://feeds.example.com/a.xml';
const B = 'https://feeds.example.com/b.xml';

test('FR-093: list, turn one show off, and the sender skips that show only', async () => {
  const t = await freshDb();
  const me = await signUp(t);
  const now = Date.now();
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: A, createdAt: new Date(now - 2000).toISOString() }, { feedUrl: B, createdAt: new Date(now - 1000).toISOString() }] }, me.token);
  await t.call('PUT', `/v1/episodes/${fnv1a64(`${A}\u0001a1`)}`, { feedUrl: A, guid: 'a1', title: 'A1', showTitle: 'Show A', enclosureUrl: 'https://cdn/a1.mp3' });
  await t.call('POST', '/v1/me/push-tokens', { token: 'ExponentPushToken[aaaaaaaaaaaa]', platform: 'ios' }, me.token);

  assert.equal((await t.call('GET', '/v1/me/notify/shows')).status, 401);
  const list = async () => ((await (await t.call('GET', '/v1/me/notify/shows', undefined, me.token)).json()) as { shows: { feedUrl: string; title: string | null; enabled: boolean }[] }).shows;
  assert.deepEqual(await list(), [{ feedUrl: B, title: null, enabled: true }, { feedUrl: A, title: 'Show A', enabled: true }]);

  assert.equal((await t.call('PUT', `/v1/me/notify/shows/${encodeURIComponent(A)}`, { enabled: false }, me.token)).status, 204);
  assert.deepEqual((await list()).map((s) => [s.feedUrl, s.enabled]), [[B, true], [A, false]]);
  assert.equal((await t.call('PUT', `/v1/me/notify/shows/${encodeURIComponent('ftp://x')}`, { enabled: false }, me.token)).status, 422);
  assert.equal((await t.call('PUT', `/v1/me/notify/shows/${encodeURIComponent(A)}`, { enabled: 'no' }, me.token)).status, 422);

  const sent: string[] = [];
  const f = (async (_i: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as { body: string }[];
    sent.push(...batch.map((m) => m.body));
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
  }) as typeof fetch;
  await fanOutNewEpisode(t.db, f, { id: 'ep-a2', feedUrl: A, title: 'A2', showTitle: 'Show A' });
  await fanOutNewEpisode(t.db, f, { id: 'ep-b2', feedUrl: B, title: 'B2', showTitle: 'Show B' });
  assert.deepEqual(sent, ['B2'], 'the show turned off is skipped; the other still notifies');

  await t.call('PUT', `/v1/me/notify/shows/${encodeURIComponent(A)}`, { enabled: true }, me.token);
  await fanOutNewEpisode(t.db, f, { id: 'ep-a3', feedUrl: A, title: 'A3', showTitle: 'Show A' });
  assert.deepEqual(sent, ['B2', 'A3'], 'turned back on, it notifies again');
  await t.close();
});
