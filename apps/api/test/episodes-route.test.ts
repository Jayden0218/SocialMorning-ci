import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb } from './harness.ts';

const body = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'guid-189', title: '#189 Goodbye All', enclosureUrl: 'https://cdn.example.com/189.mp3' };
const id = fnv1a64(body.feedUrl + '\u0001' + body.guid);

test('PUT /v1/episodes/:id registers an episode; a mismatched id is 422; needs no auth', async () => {
  const t = await freshDb();
  const ok = await t.call('PUT', `/v1/episodes/${id}`, { ...body, durationMs: 2_899_000 });
  assert.equal(ok.status, 200);
  const j = (await ok.json()) as { episode: { id: string; durationMs: number } };
  assert.equal(j.episode.id, id);
  assert.equal(j.episode.durationMs, 2_899_000);

  const bad = await t.call('PUT', '/v1/episodes/0000000000000000', body);
  assert.equal(bad.status, 422);
  await t.close();
});
