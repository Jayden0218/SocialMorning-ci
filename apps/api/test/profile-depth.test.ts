// Tests that a profile is read in a few rounds of DynamoDB calls, not one call after another.
/**
 * 038 (device check r10-clip, red in runs 41980693503 and 42006670939): the Profile page said "Couldn't reach the server."
 * because `GET /v1/listeners/:id` answered after 8-10 s on a slow CI runner while every other request answered in under 1 s.
 * The profile read made its DynamoDB calls one after another (about 20 in a row), so a runner where each call takes
 * 0.4 s crosses the app's 10 s limit on this request alone. The reads that do not depend on each other now go out together.
 *
 * What is measured: the "depth" of the calls. A call's depth is 1 + the deepest call that had already answered when it
 * was sent; calls sent together share a depth. Every call is held 15 ms so calls sent together overlap. Depth does not
 * depend on how fast DynamoDB Local is. The break that turns it red: await the reads in `profile()` one by one again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import { wrapStore, type Store } from '../src/db/ddb/store.ts';
import { withStore } from '../src/db/backend-ddb.ts';
import { profile } from '../src/db/repos/social/graph-ddb/profiles.ts';

const ep = { feedUrl: 'https://feeds.example.com/d.xml', guid: 'g1', title: 'Ep 1', showTitle: 'Show', enclosureUrl: 'https://cdn/1.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);
const today = () => new Date().toISOString().slice(0, 10);

/** A Store that records each call's depth (see the header). */
function depthStore(store: Store) {
  let answered = 0; // the deepest depth that has answered so far
  const st = { calls: 0, depth: 0 };
  const wrapped = wrapStore(store, async (cmd, next) => {
    const mine = answered + 1;
    st.calls++;
    st.depth = Math.max(st.depth, mine);
    await new Promise((r) => setTimeout(r, 15));
    try { return await next(cmd); } finally { answered = Math.max(answered, mine); }
  });
  return Object.assign(wrapped, { st });
}

/** At most this many rounds. Measured before the change: see the gate log (038). */
const MAX_DEPTH = 8;

for (const who of ['self', 'another listener', 'signed out'] as const) {
  test(`a profile read by ${who} takes at most ${MAX_DEPTH} rounds of DynamoDB calls`, async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
      const a = await signUp(t);
      const b = await signUp(t, 'b@example.com', 'Bea');
      await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
      await t.call('PUT', '/v1/me/listened', { deviceId: 'pb', days: [{ episodeId: EP, day: today(), ranges: [[0, 360_000]] }] }, b.token);
      await t.call('POST', `/v1/episodes/${EP}/clips`, { clientId: 'k', startMs: 0, endMs: 30_000 }, b.token);
      await t.call('POST', `/v1/episodes/${EP}/comments`, { body: 'hi', offsetMs: 5 }, b.token);
      const slow = depthStore(t.store);
      const viewer = who === 'self' ? b.id : who === 'another listener' ? a.id : undefined;
      const p = await profile({ store: slow, db: withStore(undefined, slow) }, b.id, viewer, today());
      assert.ok(p, 'the profile is found');
      assert.equal(p.displayName, 'Bea');
      assert.ok(p.recent.length > 0, 'the recent activity is read');
      console.log(`profile depth (${who}): ${slow.st.depth} rounds, ${slow.st.calls} calls`);
      assert.ok(slow.st.depth <= MAX_DEPTH, `${slow.st.depth} rounds (${slow.st.calls} calls) > ${MAX_DEPTH}`);
    } finally {
      await t.close();
    }
  });
}
