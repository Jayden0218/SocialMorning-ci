// Tests listener playlists: order kept, private ones hidden from others, the caps.
/**
 * M19 US4 (quickstart A5). Guard G-M19-4: a private playlist is "not found" to anyone but its
 * owner. The break: drop `!r.is_public &&` from `getPlaylist` in src/db/repos/social/playlists.ts
 * (or the owner check); the private test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { createPlaylist } from '../src/db/repos/social/playlists.ts';

type P = { id: string; title: string; isPublic: boolean; count: number; items?: { id: string }[] };

test('make, add, reorder, rename, share; another account reads it only while public', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  for (const [id, n, title] of [['e1', 1, 'One'], ['e2', 2, 'Two'], ['e3', 3, 'Three']] as const) {
    await putEpisode(t, id, { feedUrl: 'https://f/x.xml', guid: `g${n}`, title, showTitle: 'S', enclosureUrl: `https://c/${n}.mp3` });
  }
  const made = (await (await t.call('POST', '/v1/me/playlists', { title: 'Commute' }, a.token)).json()) as P;
  assert.equal(made.isPublic, false);
  for (const e of ['e1', 'e2', 'e3']) await t.call('POST', `/v1/me/playlists/${made.id}/items`, { episodeId: e }, a.token);
  const re = (await (await t.call('PUT', `/v1/me/playlists/${made.id}/items`, { episodeIds: ['e3', 'e1'] }, a.token)).json()) as P;
  assert.deepEqual(re.items!.map((i) => i.id), ['e3', 'e1'], 'order kept, e2 removed');

  assert.equal((await t.call('GET', `/v1/playlists/${made.id}`, undefined, b.token)).status, 404, 'G-M19-4: private is not found');
  assert.equal((await t.call('GET', `/v1/playlists/${made.id}`)).status, 404);
  assert.equal((await t.call('GET', `/v1/playlists/${made.id}`, undefined, a.token)).status, 200, 'the owner reads it');
  assert.equal(((await (await t.call('GET', `/v1/listeners/${a.id}/playlists`, undefined, b.token)).json()) as { items: P[] }).items.length, 0);

  await t.call('PATCH', `/v1/me/playlists/${made.id}`, { title: 'Morning walk', isPublic: true }, a.token);
  const seen = (await (await t.call('GET', `/v1/playlists/${made.id}`, undefined, b.token)).json()) as P;
  assert.equal(seen.title, 'Morning walk');
  assert.equal(((await (await t.call('GET', `/v1/listeners/${a.id}/playlists`)).json()) as { items: P[] }).items.length, 1);

  assert.equal((await t.call('PATCH', `/v1/me/playlists/${made.id}`, { title: 'Mine now' }, b.token)).status, 404, 'not B\'s to change');
  assert.equal((await t.call('PUT', `/v1/me/playlists/${made.id}/items`, { episodeIds: ['nope'] }, a.token)).status, 404);
  assert.equal((await t.call('DELETE', `/v1/me/playlists/${made.id}`, undefined, a.token)).status, 204);
  assert.equal((await t.call('GET', `/v1/playlists/${made.id}`, undefined, a.token)).status, 404);
  await t.close();
});

test('at most 50 playlists; a title is 1–60 characters', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  assert.equal((await t.call('POST', '/v1/me/playlists', { title: '' }, a.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/me/playlists', { title: 'x'.repeat(61) }, a.token)).status, 422);
  for (let g = 1; g <= 50; g++) await createPlaylist(t.db, a.id, `p${g}`, false);
  assert.equal((await t.call('POST', '/v1/me/playlists', { title: 'one more' }, a.token)).status, 409);
  await t.close();
});
