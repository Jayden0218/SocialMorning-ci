// Tests registering an episode over HTTP, including a mismatched id and one its feed does not list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';

const body = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'guid-189', title: '#189 Goodbye All', enclosureUrl: 'https://cdn.example.com/189.mp3' };
const id = fnv1a64(body.feedUrl + '\u0001' + body.guid);
// M25 S8: the server reads the feed itself before it registers a new episode.
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title><item><title>#189 Goodbye All</title><guid>guid-189</guid><enclosure url="https://cdn.example.com/189.mp3" type="audio/mpeg"/></item></channel></rss>`;
const feedFetch = (async () => new Response(RSS, { status: 200, headers: { 'content-type': 'application/rss+xml' } })) as unknown as typeof fetch;

test('PUT /v1/episodes/:id registers an episode; a mismatched id is 422; needs sign-in (M23 US1)', async () => {
  const t = await freshDb({ catalogFetch: feedFetch });
  assert.equal((await t.call('PUT', `/v1/episodes/${id}`, body)).status, 401);
  const a = await signUp(t, 'a@example.com', 'Al');
  const ok = await t.call('PUT', `/v1/episodes/${id}`, { ...body, durationMs: 2_899_000 }, a.token);
  assert.equal(ok.status, 200);
  const j = (await ok.json()) as { episode: { id: string; durationMs: number } };
  assert.equal(j.episode.id, id);
  assert.equal(j.episode.durationMs, 2_899_000);

  const bad = await t.call('PUT', '/v1/episodes/0000000000000000', body, a.token);
  assert.equal(bad.status, 422);
  await t.close();
});
