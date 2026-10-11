// Guards of the Discover lane on DynamoDB: hidden stays hidden even when pinned, pins first, a whole similarity generation or none, one of two racing list saves.
/**
 * M26 lane DV (tasks.md DV-T08). Each guard was broken on mirror branch `lane-dv-red`, seen red, restored:
 * - G-M26-DV1 — a hidden show and a hidden episode leave every Discover list and For You at once, even where the owner
 *   pinned them: the treasure hunt (signed out and in), "Podcasts you can watch", the New shows chart, the plaza, the
 *   category page, For You.
 *   Break: in src/db/repos/discover/ddb/explore.ts huntRows, drop `!hidden.has(e.feed_url) && !hiddenEps.has(e.id)`.
 * - G-M26-DV2 — the M25 rule: a category's pins sit first in the owner's slot order (Hot), and the `pinned` list the
 *   phone keeps first under For you and Newest is in that slot order too; later pages never repeat a pin.
 *   Break: in src/db/repos/discover/ddb/lists.ts activeFor, drop `a.pins.sort(pinOrder)`.
 * - G-M26-DV3 — a similarity rebuild moves readers to the new generation only when it is complete: mid-rebuild every
 *   reader sees the old neighbourhood whole (and its age), never a mix; at the end, the new one.
 *   Break: in src/db/repos/discover/ddb/similarity.ts rebuildSimilarity, also set `generation` to the new one when a
 *   new build starts (readers then see the half-written generation).
 * - G-M26-DV4 — two saves of one list that raced (both read the same version) — one wins, the other is 409 `changed`
 *   and leaves nothing; the list holds exactly the winner's row.
 *   Break: in src/db/repos/discover/ddb/lists.ts docWrite, drop the version condition (`condition` always true).
 * Plus (not a guard): an account deletion removes the listener's listen-index items.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb discover guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp, dbOf } = await import('./harness.ts');
  const { catalogFetch, FX } = await import('./admin-harness.ts');
  const { seedCacheRow } = await import('./lb-seed.ts');
  const { hideFeeds } = await import('./sf-neutral.ts');
  const { seedEpisode, seedListen } = await import('./dv-neutral.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const { wrapStore } = await import('../src/db/ddb/store.ts');
  const { GetCommand, TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  const { acScan } = await import('./fixtures.ts');
  const { putOverride, listOverrides } = await import('../src/db/repos/discover/lists.ts');
  const { rebuildSimilarity, neighboursOf, similarityAgeHours } = await import('../src/db/repos/discover/similarity.ts');
  const { merge } = await import('../src/db/repos/library/subscriptions.ts');
  const { deleteAccount } = await import('../src/db/repos/account/delete-account.ts');
  const { hideEpisodeWithReason } = await import('../src/db/repos/studio/hidden-episodes.ts');

  const HID = 'https://feeds.example.com/hidden.xml';
  const OK = 'https://feeds.example.com/ok.xml';
  const now = new Date().toISOString();
  type Ep = { id: string; feedUrl: string };

  test('G-M26-DV1: a hidden show and a hidden episode leave every list and For You, even pinned', async () => {
    const t = await freshDb({ catalogFetch: catalogFetch(), picksRaw: [], collectionsRaw: [] } as never);
    const owner = await signUp(t, 'o@example.com', 'Owner');
    const me = await signUp(t, 'me@example.com', 'Me');
    await seedCacheRow(t, `feed:${HID}`, { show: { title: 'Hidden Show', author: 'H' }, episodes: [], warnings: [] });
    // A show to be hidden whole (h1, a video in Comedy) and one episode to be hidden on its own (ok2).
    await seedEpisode(t, { id: 'h1', feedUrl: HID, guid: 'h1', title: 'Hidden one', showTitle: 'Hidden Show', publishedAt: now, genreId: 1303, mediaKind: 'video' });
    await seedEpisode(t, { id: 'ok1', feedUrl: OK, guid: 'ok1', title: 'Fine', showTitle: 'Ok Show', publishedAt: '2026-01-01T00:00:00Z', genreId: 1303 });
    await seedEpisode(t, { id: 'ok2', feedUrl: OK, guid: 'ok2', title: 'Hidden episode', showTitle: 'Ok Show', publishedAt: now, genreId: 1303, mediaKind: 'video' });
    for (const list of ['hunt', 'video', 'new', 'plaza', 'category:1303']) {
      await putOverride(t.db, list, list === 'hunt' || list === 'video' ? { kind: 'pin', feedUrl: HID, guid: 'h1', position: 1 } : { kind: 'pin', feedUrl: HID, position: 1 }, owner.id);
    }
    await putOverride(t.db, 'hunt', { kind: 'pin', feedUrl: OK, guid: 'ok2', position: 2 }, owner.id);
    await putOverride(t.db, 'video', { kind: 'pin', feedUrl: OK, guid: 'ok2', position: 2 }, owner.id);

    type Items = { items: Ep[] };
    const hunt = async (token?: string) => ((await (await t.call('GET', '/v1/discover/hunt', undefined, token)).json()) as Items).items.map((e) => e.id);
    const video = async () => ((await (await t.call('GET', '/v1/discover')).json()) as { video?: { episode: Ep }[] }).video?.map((v) => v.episode.id) ?? [];
    const newChart = async () => ((await (await t.call('GET', '/v1/discover/chart?kind=new')).json()) as { items: { episode: Ep }[] }).items.map((i) => i.episode.feedUrl);
    const plaza = async () => ((await (await t.call('GET', '/v1/discover/plaza')).json()) as { items: { feedUrl: string }[] }).items.map((s) => s.feedUrl);
    const category = async () => ((await (await t.call('GET', '/v1/categories/1303')).json()) as { shows: { feedUrl: string }[]; pinned?: string[] });
    const forYou = async () => ((await (await t.call('GET', '/v1/for-you?interests=1303')).json()) as { items: { episode: Ep }[] }).items.map((i) => i.episode.id);

    // Before: the pins are served (so "gone" below means hidden, not never there).
    assert.ok((await hunt()).includes('h1'), 'before: the pinned hidden-to-be episode leads the hunt');
    assert.ok((await newChart()).includes(HID));
    assert.ok((await category()).shows.some((s) => s.feedUrl === HID));

    await hideFeeds(t, owner.id, [HID]);
    await hideEpisodeWithReason(t.db, OK, 'ok2', owner.id, 'test'); // lane ST's repo (hidden episodes are its items)

    for (const [who, got] of [['signed out', await hunt()], ['signed in', await hunt(me.token)]] as const) {
      assert.deepEqual(got.filter((id) => id === 'h1' || id === 'ok2'), [], `hunt (${who}): no hidden show or episode, pinned or not`);
    }
    assert.deepEqual((await video()).filter((id) => id === 'h1' || id === 'ok2'), [], 'video: nothing hidden');
    assert.equal((await newChart()).includes(HID), false, 'New shows chart: the hidden show is gone');
    assert.equal((await plaza()).includes(HID), false, 'plaza: gone');
    const cat = await category();
    assert.equal(cat.shows.some((s) => s.feedUrl === HID), false, 'category: gone');
    assert.equal((cat.pinned ?? []).includes(HID), false, 'category: not in the pinned list either');
    assert.deepEqual((await forYou()).filter((id) => id === 'h1' || id === 'ok2'), [], 'For You: nothing hidden');
    await t.close();
  });

  test('G-M26-DV2: category pins sit first in slot order, the pinned list keeps that order, later pages repeat no pin', async () => {
    const t = await freshDb({ catalogFetch: catalogFetch(), picksRaw: [], collectionsRaw: [] } as never);
    const owner = await signUp(t, 'o@example.com', 'Owner');
    const A = 'https://feeds.example.com/pin-a.xml';
    const B = 'https://feeds.example.com/pin-b.xml';
    for (const [u, title] of [[A, 'Show A'], [B, 'Show B']] as const) await seedCacheRow(t, `feed:${u}`, { show: { title, author: 'x' }, episodes: [], warnings: [] });
    // A is pinned first (slot 2), B second (slot 1): the slot, not the order made, decides.
    await putOverride(t.db, 'category:1303', { kind: 'pin', feedUrl: A, position: 2 }, owner.id);
    await putOverride(t.db, 'category:1303', { kind: 'pin', feedUrl: B, position: 1 }, owner.id);
    const page0 = (await (await t.call('GET', '/v1/categories/1303')).json()) as { shows: { feedUrl: string; pinned?: true }[]; pinned?: string[] };
    assert.deepEqual(page0.pinned, [B, A], 'the phone keeps these first under For you and Newest, in slot order');
    assert.deepEqual(page0.shows.slice(0, 2).map((s) => [s.feedUrl, s.pinned]), [[B, true], [A, true]], 'Hot: the pins first, in slot order');
    assert.ok(page0.shows.length > 2, 'the chart follows');
    const page1 = (await (await t.call('GET', '/v1/categories/1303?page=1')).json()) as { shows: { feedUrl: string }[]; pinned?: string[] };
    assert.equal(page1.shows.some((s) => s.feedUrl === A || s.feedUrl === B), false, 'a later page repeats no pin');
    assert.deepEqual(page1.pinned, [B, A]);
    await t.close();
  });

  test('G-M26-DV3: a similarity rebuild moves readers only when complete — mid-rebuild they see the old generation whole', async () => {
    const t = await freshDb();
    const S = ['https://s.example/a.xml', 'https://s.example/b.xml', 'https://s.example/c.xml'];
    const sub = async (id: string, feeds: string[]) => merge(t.db, id, feeds.map((feedUrl) => ({ feedUrl, createdAt: '2026-09-20T10:00:00.000Z' })) as never);
    const people = [];
    for (const n of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) people.push(await signUp(t, `${n}@example.com`, n));
    try {
    // Three listeners liking A and B (as foryou-safety's A15: enough for Swing to learn a pair).
    for (const p of people.slice(0, 3)) await sub(p.id, [S[0]!, S[1]!]);
    let r = await rebuildSimilarity(t.db, undefined, 200);
    assert.equal(r.done, true);
    const old = await neighboursOf(t.db, S);
    assert.ok(old.size > 0, 'the first generation learned something');
    assert.equal(old.has(S[2]!), false);
    const oldAge = await similarityAgeHours(t.db);

    // New likes bring show C in; rebuild one show per chunk and read between chunks.
    for (const p of people) await sub(p.id, S);
    r = await rebuildSimilarity(t.db, undefined, 1);
    assert.equal(r.done, false, 'the rebuild is half-way');
    assert.deepEqual(await neighboursOf(t.db, S), old, 'mid-rebuild: the old neighbourhood, whole — never a mix');
    const midAge = await similarityAgeHours(t.db);
    assert.ok(oldAge !== null && midAge !== null && midAge >= oldAge, 'mid-rebuild: the age is still the old generation\'s');
    let guard = 0;
    while (!r.done && guard++ < 10) r = await rebuildSimilarity(t.db, r.next, 1);
    assert.equal(r.done, true);
    const fresh = await neighboursOf(t.db, S);
    assert.ok(fresh.has(S[2]!), 'once complete, readers see the new generation (show C has neighbours)');
    } finally { await t.close(); }
  });

  test('G-M26-DV4: two saves of one list that raced — one wins, the other is 409 changed and leaves nothing', async () => {
    const t = await freshDb();
    const owner = await signUp(t, 'o@example.com', 'Owner');
    // Both saves read the list before either writes (the race made certain): the writes wait until both reads are in.
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((r) => { release = r; });
    const gated = wrapStore(t.store!, async (cmd, next) => {
      const pk = String((cmd.input as { Key?: { PK?: string } }).Key?.PK ?? '');
      if (cmd instanceof GetCommand && pk === 'LIST#trending') { const out = await next(cmd); if (++reads === 2) release(); return out; }
      if (cmd instanceof TransactWriteCommand && JSON.stringify(cmd.input).includes('LIST#trending')) await bothRead;
      return next(cmd);
    });
    const db = withStore(dbOf(t.pg), gated);
    const results = await Promise.allSettled([
      putOverride(db, 'trending', { kind: 'pin', feedUrl: FX, guid: 'one', position: 1 }, owner.id),
      putOverride(db, 'trending', { kind: 'pin', feedUrl: FX, guid: 'two', position: 1 }, owner.id),
    ]);
    const won = results.filter((r) => r.status === 'fulfilled');
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    assert.equal(won.length, 1, `${won.length} of two racing saves were kept`);
    assert.equal((lost[0]?.reason as { code?: string } | undefined)?.code, 'changed', 'the loser is told it changed elsewhere');
    const rows = await listOverrides(t.db, 'trending');
    assert.equal(rows.length, 1, 'the list holds exactly one row');
    assert.equal(rows[0]!.id, (won[0] as PromiseFulfilledResult<{ id: string }>).value.id, 'the winner\'s');
    await t.close();
  });

  test('account deletion removes the listener\'s listen-index items (not a guard)', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'a@example.com', 'Al');
    const b = await signUp(t, 'b@example.com', 'Bo');
    await seedEpisode(t, { id: 'e1', feedUrl: OK, guid: 'e1', title: 'One' });
    await seedListen(t, a.id, 'e1');
    await seedListen(t, b.id, 'e1');
    assert.equal((await acScan(t.store!, 'events', 'listenMark')).length, 2);
    await deleteAccount(t.db, a.id);
    const left = await acScan(t.store!, 'events', 'listenMark');
    assert.deepEqual(left.map((i) => i['actorId']), [b.id], 'only the other listener\'s listen is left');
    await t.close();
  });
}
