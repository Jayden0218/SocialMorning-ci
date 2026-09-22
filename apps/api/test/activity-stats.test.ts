/** T010 (guard G2): a private listener's listens count 0; comments, clips and reactions count; the shape carries no ids of people. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { talkedAbout } from '../src/db/repos/activity-stats.ts';

const ep = { feedUrl: 'https://feeds.example.com/x.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

test('G2: A private + B public both listen 6 min; A and B comment; B clips and reacts → listeners 1, comments 2, clips 1, reactions 1', async () => {
  const t = await freshDb();
  await t.call('PUT', `/v1/episodes/${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t);
  const b = await signUp(t, 'b@example.com', 'Bea');
  await t.call('PUT', '/v1/me/privacy', { privateListening: true }, a.token);
  for (const [tok, dev] of [[a.token, 'pa'], [b.token, 'pb']] as const) {
    await t.call('PUT', '/v1/me/listened', { deviceId: dev, days: [{ episodeId: EP, day: '2026-09-22', ranges: [[0, 360_000]] }] }, tok);
  }
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'a', offsetMs: 1 }, a.token);
  const root = ((await (await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'b', offsetMs: 2 }, b.token)).json()) as { comment: { id: string } }).comment;
  await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'reply (not counted)', parentId: root.id }, b.token);
  await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 0, endMs: 30_000 }, b.token);
  await t.call('PUT', `/v1/episodes/${EP}/reactions`, { offsetMs: 5_000 }, b.token);
  const rows = await talkedAbout(t.db);
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], newestAt: rows[0]!.newestAt > 0 }, { key: EP, episodeId: EP, listeners: 1, comments: 2, clips: 1, reactions: 1, newestAt: true });
  assert.equal(JSON.stringify(rows).includes(a.id), false);
  assert.equal(JSON.stringify(rows).includes('Alex'), false);
  // An episode with nothing is not a row; the feed filter works.
  await t.call('PUT', `/v1/episodes/other`, { ...ep, guid: 'g2', title: 'quiet' });
  assert.equal((await talkedAbout(t.db)).length, 1);
  assert.equal((await talkedAbout(t.db, 7, 'https://feeds.example.com/nope.xml')).length, 0);
  assert.equal((await talkedAbout(t.db, 7, ep.feedUrl)).length, 1);
  await t.close();
});
