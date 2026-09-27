/**
 * M10b US5 — "Podcasts you can watch": an episode whose feed declares a video file is
 * recorded as video once, listed newest first, hidden shows left out; an audio one never is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCard, toCard } from '../src/catalog/feed.ts';
import { videoEpisodes } from '../src/db/repos/discover-extras.ts';
import { freshDb } from './harness.ts';

const show = { feedUrl: 'https://f/v.xml', title: 'Watch Show', explicit: false, categories: [], contentHash: 'h' };
const ep = (guid: string, type: string | undefined, url: string, at: number) =>
  ({ guid, guidSource: 'guid' as const, title: guid, enclosureUrl: url, ...(type ? { enclosureType: type } : {}), publishedAt: at, explicit: false, transcripts: [], soundbites: [], contentHash: guid });

test('video episodes are listed on Discover, newest first; audio ones are not; a video stays a video', async () => {
  const t = await freshDb();
  await registerCard(t.db, toCard(show.feedUrl, show, ep('v1', 'video/mp4', 'https://cdn/v1.mp4', Date.UTC(2026, 8, 20))));
  await registerCard(t.db, toCard(show.feedUrl, show, ep('v2', undefined, 'https://cdn/v2.mov', Date.UTC(2026, 8, 25))));
  await registerCard(t.db, toCard(show.feedUrl, show, ep('a1', 'audio/mpeg', 'https://cdn/a1.mp3', Date.UTC(2026, 8, 26))));
  // A later audio-less re-registration (e.g. the phone's PUT) must not turn a video back into audio.
  await registerCard(t.db, { feedUrl: show.feedUrl, guid: 'v1', title: 'v1', showTitle: 'Watch Show', enclosureUrl: 'https://cdn/v1.mp4' });
  // (Called directly: /v1/discover also reads Apple's chart, which a test must not reach.)
  const video = await videoEpisodes(t.db);
  assert.deepEqual(video.map((v) => v.episode.guid), ['v2', 'v1'], 'newest first, audio left out');
  assert.ok(video.every((v) => v.episode.mediaKind === 'video'));
  await t.close();
});
