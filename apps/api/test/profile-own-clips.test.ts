// Tests that a maker's own profile read lists the clips they made.
/**
 * 035 T044 (device check B6; FR-007). The maker's own page showed no way to their clip. The server side of that: `GET
 * /v1/listeners/:ownId` must carry the `clipped` item (with the clip id in `refId`, so the page can open it). Finding: it
 * does (the gap was in the app, which hid `recent` on your own page; see gate-log.md), so this test guards the server half
 * from here on. Seen red by dropping the activity write in `clips.ts` (the clip is made but no `clipped` row is recorded).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Episode 1', showTitle: 'Journey Morning', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
type Prof = { profile: { id: string; recent: { kind: string; refId: string | null; momentMs: number | null }[] } };

test('B6: my own profile lists my clip, with its id', async () => {
  const t = await freshDb();
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 60_000 });
  const me = await signUp(t);
  const made = await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'c1', startMs: 0, endMs: 6_000 }, me.token);
  assert.equal(made.status, 201);
  const clipId = ((await made.json()) as { clip: { id: string } }).clip.id;
  const own = (await (await t.call('GET', `/v1/listeners/${me.id}`, undefined, me.token)).json()) as Prof;
  const clipped = own.profile.recent.filter((r) => r.kind === 'clipped');
  assert.equal(clipped.length, 1);
  assert.equal(clipped[0]?.refId, clipId);
  assert.equal(clipped[0]?.momentMs, 0);
  await t.close();
});
