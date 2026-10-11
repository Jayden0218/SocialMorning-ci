// Lane ST guards on DynamoDB Local: a scheduled episode goes live once, one proven claim per feed, rollups equal a recount, one approval posts once.
/**
 * M26 lane ST (tasks.md ST-T09). Each guard names the break that turns it red (seen red on `lane-st-red`):
 *
 * - G-M26-ST1 (ST-64 → a timer): a scheduled Studio episode whose time has come goes live EXACTLY once, however many
 *   timers and readers fire at once and again — one app episode, one promotion, the episode off the `Q#scheduled` queue.
 *   Break: in src/db/repos/studio/ddb/hosted.ts, drop "not promoted yet" — `!e['promotedAt']` in `waiting` and
 *   `attribute_not_exists(#p)` in `promoteHostedEpisode`'s condition.
 * - G-M26-ST2 (the old partial unique index `creator_claims_one_proven`): two listeners whose codes are both in the live
 *   feed prove at the same moment — one is proven, the other is told `taken`; one `U#PROVEN`, one owner role copy.
 *   Break: in src/db/repos/studio/ddb/claims.ts `proveInTx`, drop the `attribute_not_exists(PK)` condition on `U#PROVEN`.
 * - G-M26-ST3 (data-model.md §7 C): the hourly rollups made through the real write paths (a reaction, a saved episode, a
 *   listen, a share — and then an un-react and an un-save) equal a recount of the day's facts, hour by hour; and the
 *   nightly check repairs a rollup that drifted. Break: in src/db/repos/studio/ddb/facts.ts `refreshFact`, drop the
 *   `rollAdd(…, -1)` when a fact goes (the delete branch).
 * - G-M26-ST4 (lane's pick — review mode, M24 US8): two hosts approving the same held comment at the same moment post it
 *   ONCE. Break: in src/db/repos/studio/ddb/comments.ts `dropHeld`, drop the `attribute_exists(PK)` condition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('lane ST guards (need DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { fnv1a64 } = await import('@socialmorning/social-core');
  const { freshDb, signUp } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { proveClaim, sCall, studioLogin } = await import('./studio-harness.ts');
  const { moveHostedEpisode } = await import('./st-neutral.ts');
  const { acScan } = await import('./fixtures.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { get, update } = await import('../src/db/ddb/store.ts');
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  const H = await import('../src/db/repos/studio/ddb/hosted.ts');
  const F = await import('../src/db/repos/studio/ddb/facts.ts');
  const { createClaim, verifyClaim } = await import('../src/db/repos/studio/creator.ts');
  const { merge } = await import('../src/db/repos/library/library.ts');
  const { replaceRanges } = await import('../src/db/repos/library/listened.ts');
  const { commentControl, approveHeld } = await import('../src/db/repos/studio/comment-policy.ts');
  const { listComments } = await import('../src/db/repos/social/comments.ts');

  test('G-M26-ST1: a scheduled episode goes live once, at its time, even if the timer fires twice', async () => {
    const t = await freshDb({ publicBase: 'https://api.example.test' } as never);
    const me = await studioLogin(t, 'c@example.com', 'Creator');
    const made = await sCall(t, 'POST', '/v1/studio/hosted-shows', me, { title: 'Timer Show' });
    const { show } = (await made.json()) as { show: { id: string; feedUrl: string } };
    const hosted = (await H.hostedById(t.store!, t.db, show.id))!;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    await H.publishEpisode(t.store!, t.db, hosted, me.id, { title: 'Later', description: '', audioUrl: 'https://blob.example/a.mp3', audioBytes: 10, audioType: 'audio/mpeg', durationMs: 60_000, publishAt: later });
    assert.equal(await H.promoteScheduled(t.store!, t.db), 0, 'not before its time');
    assert.equal((await acScan(t.store!, 'main', 'episode')).filter((e) => e['feedUrl'] === show.feedUrl).length, 0);
    await moveHostedEpisode(t, 'Later', 1_000); // its time has come
    // Two timers and a reader at once, then the timer again.
    const raced = await Promise.all([H.promoteScheduled(t.store!, t.db), H.promoteScheduled(t.store!, t.db), H.promoteDue(t.store!, t.db, hosted).then(() => 0)]);
    const again = await H.promoteScheduled(t.store!, t.db);
    await H.promoteDue(t.store!, t.db, hosted);
    const eps = (await acScan(t.store!, 'main', 'episode')).filter((e) => e['feedUrl'] === show.feedUrl);
    assert.equal(eps.length, 1, 'one app episode');
    const [e] = await acScan(t.store!, 'main', 'hostedEpisode');
    assert.ok(e!['promotedAt'], 'marked promoted');
    assert.equal(e!['G4PK'], undefined, 'off the scheduled queue');
    // Exactly one of all those calls promoted it (the reader's promoteDue counts through the promotedAt it wrote).
    const byTimers = raced[0]! + raced[1]! + again;
    assert.ok(byTimers <= 1, `timers promoted ${byTimers} times`);
    const promotedAt = String(e!['promotedAt']);
    assert.equal(await H.promoteScheduled(t.store!, t.db), 0);
    assert.equal(await H.promoteHostedEpisode(t.store!, t.db, hosted, e!), false, 'a stale copy of the episode cannot promote it again');
    assert.equal(String((await get(t.store!, 'main', { PK: String(e!['PK']), SK: String(e!['SK']) }))!['promotedAt']), promotedAt, 'promoted at one moment, never moved');
    await t.close();
  });

  test('G-M26-ST2: two proofs of one feed at the same moment leave one proven claim', async () => {
    const FEED = 'https://feeds.example.com/contested.xml';
    let arrived = 0;
    let release: () => void = () => {};
    const both = new Promise<void>((r) => { release = r; });
    let text = '';
    const f = (async () => { arrived++; if (arrived === 2) release(); await both; return new Response(`<rss><channel><description>${text}</description></channel></rss>`); }) as unknown as typeof fetch;
    const t = await freshDb();
    const a = await signUp(t, 'a@example.com', 'Ann');
    const b = await signUp(t, 'b@example.com', 'Ben');
    const ca = await createClaim(t.db, a.id, FEED);
    const cb = await createClaim(t.db, b.id, FEED);
    text = `${ca.code} ${cb.code}`;
    const [ra, rb] = await Promise.all([verifyClaim(t.db, f, a.id, ca.id), verifyClaim(t.db, f, b.id, cb.id)]);
    const results = [ra, rb].map((r) => (typeof r === 'string' ? r : r.status)).sort();
    assert.deepEqual(results, ['proven', 'taken'], `one proven, one taken: ${JSON.stringify(results)}`);
    const proven = await acScan(t.store!, 'main', 'provenClaim');
    assert.equal(proven.length, 1);
    const winner = proven[0]!['listenerId'];
    const owners = (await acScan(t.store!, 'main', 'roles')).filter((r) => r['role'] === 'owner');
    assert.deepEqual(owners.map((r) => String(r['PK'])), [`L#${String(winner)}`], 'one owner role copy, the winner\'s');
    const claims = await acScan(t.store!, 'main', 'claim');
    assert.equal(claims.filter((c) => c['status'] === 'proven').length, 1, 'one claim says proven');
    await t.close();
  });

  test('G-M26-ST3: the hourly rollups equal a recount of the day; the nightly check repairs drift', async () => {
    const FEED = 'https://feeds.example.com/rolled.xml';
    const t = await freshDb();
    const owner = await studioLogin(t, 'o@example.com', 'Owner');
    await proveClaim(t, owner.id, FEED);
    const E1 = fnv1a64(FEED + '\u0001g1');
    const E2 = fnv1a64(FEED + '\u0001g2');
    await putEpisode(t, E1, { feedUrl: FEED, guid: 'g1', title: 'One', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
    await putEpisode(t, E2, { feedUrl: FEED, guid: 'g2', title: 'Two', enclosureUrl: 'https://cdn/2.mp3', durationMs: 1_000_000 });
    const ls = [await signUp(t, 'x@example.com', 'X'), await signUp(t, 'y@example.com', 'Y'), await signUp(t, 'z@example.com', 'Z')];
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    // Likes: X twice on E1 (one like), Y on E1 and E2; saves: X and Z save E2; plays: X and Y listen to E1; shares: 2.
    await t.call('PUT', `/v1/episodes/${E1}/reactions`, { offsetMs: 10_000 }, ls[0]!.token);
    await t.call('PUT', `/v1/episodes/${E1}/reactions`, { offsetMs: 500_000 }, ls[0]!.token);
    await t.call('PUT', `/v1/episodes/${E1}/reactions`, { offsetMs: 10_000 }, ls[1]!.token);
    await t.call('PUT', `/v1/episodes/${E2}/reactions`, { offsetMs: 10_000 }, ls[1]!.token);
    await merge(t.db, ls[0]!.id, [{ kind: 'fav_episode', key: E2, updatedAt: now }]);
    await merge(t.db, ls[2]!.id, [{ kind: 'fav_episode', key: E2, updatedAt: now }]);
    for (const l of ls.slice(0, 2)) await replaceRanges(t.db, l.id, 'phone', [{ episodeId: E1, day: today, ranges: [[0, 600_000]] }]);
    await t.call('POST', '/v1/shares', { targetKind: 'episode', targetId: E1, feedUrl: FEED }, ls[2]!.token);
    await t.call('POST', '/v1/shares', { targetKind: 'show', targetId: FEED, feedUrl: FEED });
    await drainOutbox(t.store!);
    const fk = K.feedKey(FEED);
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    const check = async (label: string) => {
      const [want, have] = await Promise.all([F.recountDay(t.store!, fk, today), F.storedDay(t.store!, fk, today)]);
      for (const m of ['plays', 'likes', 'saves', 'shares'] as const) assert.deepEqual(Object.fromEntries(have[m]), Object.fromEntries(want[m]), `${label}: ${m} rollup = recount`);
      return want;
    };
    const first = await check('after the writes');
    assert.deepEqual([sum(first.likes), sum(first.saves), sum(first.plays), sum(first.shares)], [3, 2, 2, 2], 'the day really has things in it');
    // Undo: X takes both reactions back (no like left), Z un-saves.
    await t.call('PUT', `/v1/episodes/${E1}/reactions`, { offsetMs: 10_000 }, ls[0]!.token);
    await t.call('PUT', `/v1/episodes/${E1}/reactions`, { offsetMs: 500_000 }, ls[0]!.token);
    await merge(t.db, ls[2]!.id, [{ kind: 'fav_episode', key: E2, updatedAt: new Date(Date.now() + 1000).toISOString(), deletedAt: new Date(Date.now() + 1000).toISOString() }]);
    await drainOutbox(t.store!);
    const second = await check('after the undo');
    assert.deepEqual([sum(second.likes), sum(second.saves)], [2, 1]);
    // Drift: a likes rollup is wrong; the nightly check sets it back to the recount.
    const hour = [...second.likes.keys()][0]!;
    await update(t.store!, 'events', K.stRollup(fk, 'likes', hour), { update: 'ADD #n :n', names: { '#n': 'n' }, values: { ':n': 5 } });
    assert.ok((await F.checkRollups(t.store!, today)) >= 1, 'the check repaired something');
    await check('after the nightly check');
    await t.close();
  });

  test('G-M26-ST4: two approvals of one held comment at the same moment post it once', async () => {
    const FEED = 'https://feeds.example.com/review.xml';
    const t = await freshDb();
    const EP = fnv1a64(FEED + '\u0001g1');
    await putEpisode(t, EP, { feedUrl: FEED, guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
    const owner = await studioLogin(t, 'o@example.com', 'Host');
    const key = await proveClaim(t, owner.id, FEED);
    await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'review' });
    const mei = await signUp(t, 'mei@example.com', 'Mei');
    const held = await commentControl(t.db, { id: EP, feed_url: FEED }, mei.id, { body: 'Please approve me' });
    assert.ok(held);
    const outcomes = await Promise.allSettled([approveHeld(t.db, FEED, held.id), approveHeld(t.db, FEED, held.id)]);
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1, 'one approval wins, the other finds nothing waiting');
    await drainOutbox(t.store!);
    const visible = (await listComments(t.db, EP)).filter((c) => c.body === 'Please approve me');
    assert.equal(visible.length, 1, 'the comment is posted once');
    assert.equal((await acScan(t.store!, 'main', 'heldComment')).length, 0);
    await t.close();
  });
}
