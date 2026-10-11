// Guards of the social-graph lane on DynamoDB: follow counts under conflicts, the live-listener allowlist, notice dedupe, the feed fan-out.
/**
 * M26 lane SG (tasks.md SG-T09). Each guard was broken on mirror branch `lane-sg-red`, seen red, restored:
 * - G-M26-SG1 — 50 parallel follows/unfollows, with every third transaction cancelled (TransactionConflict, the
 *   conflict wrapper), leave both directions and both counters consistent: each listener's `followerCount` /
 *   `followingCount` equals its FOLLOWER# / FOLLOW# items, and every edge has its twin.
 *   Break: in src/db/repos/social/graph-ddb/follows.ts addEdge, move the two counter updates out of the transaction
 *   (separate UpdateItems before the commit) — a cancelled and retried follow then counts twice.
 * - G-M26-SG2 — the live-listener item never carries a listener id or name: its type is a strict allowlist
 *   (`episodeId`, `listenerHash`, `seenAt`), a signed-in heartbeat stores only those, and `encode` refuses more.
 *   Break: in src/db/ddb/codec.ts make `liveListener` attrs 'open'.
 * - G-M26-SG3 — the same notification event delivered twice (at once, and again with its ref keys in another order)
 *   writes ONE notice: the NDEDUP# item rides in the notice's transaction.
 *   Break: in src/db/repos/social/graph-ddb/notifications.ts planNotice, drop the `if (dedupe) t.put(…)` line.
 * - G-M26-SG4 — the Following feed shows a followed listener's new activity once the outbox has drained (fan-out on
 *   write), never their hidden activity, and an unfollow takes the actor's items out of the inbox.
 *   Break: in src/db/repos/social/graph-ddb/activity.ts writeAct, drop the `enqueue(… 'sg:fanout' …)` line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb social-graph guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp, dbOf } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { withConflicts } = await import('../src/db/ddb/test-wrappers.ts');
  const { encode, ITEM_TYPES, PERSON_ATTRS, CodecError } = await import('../src/db/ddb/codec.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { follow, unfollow } = await import('../src/db/repos/social/follows.ts');
  const { notify } = await import('../src/db/repos/social/notifications.ts');
  const { feedFor } = await import('../src/db/repos/social/activity.ts');
  const { recordActivity } = await import('../src/db/repos/social/graph-ddb/activity.ts');
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  const { acScan } = await import('./fixtures.ts');
  const { putEpisode } = await import('./put-episode.ts');

  test('G-M26-SG1: 50 parallel follows/unfollows with cancelled transactions leave both directions and both counts consistent', async () => {
    const t = await freshDb();
    const people: string[] = [];
    for (let i = 0; i < 5; i++) people.push((await signUp(t, `p${i}@example.com`, `P${i}`)).id);
    const conflicts = withConflicts(t.store!, (n) => n % 3 === 0);
    const db = withStore(t.db, conflicts);
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n; };
    const ops = Array.from({ length: 50 }, () => {
      const a = people[rnd(5)]!;
      let b = people[rnd(5)]!;
      if (b === a) b = people[(people.indexOf(a) + 1) % 5]!;
      return rnd(3) === 0 ? unfollow(db, a, b) : follow(db, a, b);
    });
    const settled = await Promise.allSettled(ops);
    assert.ok(settled.filter((s) => s.status === 'fulfilled').length >= 25, 'most operations went through');
    assert.ok(conflicts.cancelled() > 0, 'the wrapper cancelled transactions');
    const follows = await acScan(t.store!, 'main', 'follow');
    const followers = await acScan(t.store!, 'main', 'follower');
    assert.ok(follows.length > 0, 'some follows stand');
    const pair = (i: Record<string, unknown>) => `${String(i['PK']).slice(2)}>${String(i['otherId'])}`;
    assert.deepEqual(follows.map(pair).sort(), followers.map((i) => `${String(i['otherId'])}>${String(i['PK']).slice(2)}`).sort(), 'every FOLLOW# has its FOLLOWER# twin');
    for (const id of people) {
      const l = await (await import('./fixtures.ts')).itemAt(t.store!, 'listener', K.listener(id));
      const out = follows.filter((i) => String(i['PK']) === K.L(id)).length;
      const inn = followers.filter((i) => String(i['PK']) === K.L(id)).length;
      assert.equal(Number(l?.['followingCount'] ?? 0), out, `${id}: followingCount = FOLLOW# items`);
      assert.equal(Number(l?.['followerCount'] ?? 0), inn, `${id}: followerCount = FOLLOWER# items`);
    }
    await t.close();
  });

  test('G-M26-SG2: the live-listener item holds only episode, salted hash and time — never an account id or name', async () => {
    const t = await freshDb();
    const EP = 'live-guard-ep';
    await putEpisode(t, EP, { feedUrl: 'https://feeds.example.com/l.xml', guid: 'l1', title: 'Live', enclosureUrl: 'https://cdn.example.com/l.mp3' });
    const a = await signUp(t, 'live@example.com', 'Livia Listener');
    assert.equal((await t.call('PUT', `/v1/episodes/${EP}/live`, { installId: 'install-live-guard' }, a.token)).status, 204);
    const allow = ITEM_TYPES.liveListener.attrs as readonly string[];
    for (const p of PERSON_ATTRS) assert.ok(!allow.includes(p), `the allowlist has no ${p}`);
    assert.throws(() => encode('liveListener', K.ev.live(EP, 'h'), { episodeId: EP, listenerHash: 'h', seenAt: new Date().toISOString(), listenerId: a.id }), CodecError, 'an account id is refused');
    assert.throws(() => encode('liveListener', K.ev.live(EP, 'h'), { episodeId: EP, listenerHash: 'h', seenAt: new Date().toISOString(), displayName: 'Livia Listener' }), CodecError, 'a name is refused');
    const items = await acScan(t.store!, 'events', 'liveListener');
    assert.equal(items.length, 1);
    for (const name of Object.keys(items[0]!)) assert.ok(['PK', 'SK', 't', 'ttl', ...allow].includes(name), `unexpected attribute ${name}`);
    const dump = JSON.stringify(items);
    assert.ok(!dump.includes(a.id) && !dump.includes('Livia') && !dump.includes('install-live-guard'), 'no account, name or install id anywhere in the item');
    await t.close();
  });

  test('G-M26-SG3: one notification event delivered twice (at once, then with its ref in another order) is one notice', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'n1@example.com', 'Nia');
    const b = await signUp(t, 'n2@example.com', 'Ned');
    const ref = { commentId: '00000000-0000-4000-8000-0000000000c1', episodeId: 'ep-dedupe' };
    const twice = await Promise.all([notify(t.db, { recipientId: a.id, actorId: b.id, kind: 'like', ref }), notify(t.db, { recipientId: a.id, actorId: b.id, kind: 'like', ref })]);
    assert.deepEqual(twice.filter(Boolean).length, 1, 'exactly one of the two deliveries wrote');
    assert.equal(await notify(t.db, { recipientId: a.id, actorId: b.id, kind: 'like', ref: { episodeId: ref.episodeId, commentId: ref.commentId } }), false, 'the same ref, keys in another order');
    const notes = (await acScan(t.store!, 'main', 'notification')).filter((n) => n['recipientId'] === a.id);
    assert.equal(notes.length, 1, 'one notice stored');
    assert.equal(await notify(t.db, { recipientId: a.id, actorId: b.id, kind: 'reply', ref }), true, 'a reply is not deduplicated');
    await t.close();
  });

  test('G-M26-SG4: the feed shows a followed listener\'s activity after the outbox drains; hidden never; unfollow empties the inbox', async () => {
    const t = await freshDb();
    // Bridge off: only the fan-out can put the item in the feed (no Postgres activity rows to merge).
    const db = withStore(dbOf(t.pg), t.store!, { bridge: false });
    const EP = 'feed-guard-ep';
    await putEpisode({ db }, EP, { feedUrl: 'https://feeds.example.com/f.xml', guid: 'f1', title: 'Feed ep', enclosureUrl: 'https://cdn.example.com/f.mp3' });
    const a = await signUp({ db }, 'fa@example.com', 'Fay');
    const b = await signUp({ db }, 'fb@example.com', 'Bob');
    assert.equal(await follow(db, a.id, b.id), 'followed');
    await drainOutbox(t.store!);
    const id = await recordActivity(t.store!, db, { actorId: b.id, kind: 'commented', episodeId: EP, momentMs: 1000, refId: '00000000-0000-4000-8000-0000000000f1' });
    await recordActivity(t.store!, db, { actorId: b.id, kind: 'listened', episodeId: EP, day: '2026-10-10', hidden: true });
    assert.deepEqual((await feedFor(db, a.id)).items, [], 'nothing before the outbox runs');
    await drainOutbox(t.store!);
    const shown = (await feedFor(db, a.id)).items;
    assert.deepEqual(shown.map((r) => [r.id, r.kind, r.actor_name, r.episode_title]), [[String(id), 'commented', 'Bob', 'Feed ep']], 'the comment, not the hidden listen');
    await unfollow(db, a.id, b.id);
    await drainOutbox(t.store!);
    assert.deepEqual((await feedFor(db, a.id)).items, []);
    const inbox = (await acScan(t.store!, 'events', 'feedInbox')).filter((p) => String(p['PK']) === `FEED#${a.id}`);
    assert.equal(inbox.length, 0, 'the unfollowed actor\'s pointers left the inbox');
    await t.close();
  });
}
