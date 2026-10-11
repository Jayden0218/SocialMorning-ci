// Lane SC guards on DynamoDB Local: exact counters under racing writes, statuses gone at 24 h, placeholders kept, one pin per episode, numeric chat cursors.
/**
 * M26 lane SC (tasks.md SC-T09). Each guard names the break that turns it red (seen red on `lane-sc-red`):
 *
 * - G-M26-SC1 (§7 A: counters in the row's own transaction): five listeners each reply to one comment and like it at
 *   the same moment — the same listener's reply and like touch the same comment item, and the first transactions are
 *   cancelled by a conflict — and each like is sent twice: `replyCount` and `likeCount` end exactly at 5.
 *   Break: in src/db/repos/social/ddb/sc-common.ts `commitRetry`, try once (tries = 1).
 * - G-M26-SC2 (constitution: a voice status is deleted 24 h after posting; TTL is not the rule): at 24 h + 1 s, with no
 *   TTL run, the status is in no read (following list, single read, live count, replies route check, suggestions),
 *   and the hourly sweep deletes its recording from the store and every item of it.
 *   Break: in src/db/repos/social/ddb/voice-posts.ts `postsOf`, drop the `isLive` filter (return every post).
 * - G-M26-SC3 (M23 US4 / FR-010): deleting a comment that has a reply leaves a placeholder — no words, author, moment,
 *   heat mark — with the reply under it, and a new reply can still be posted to it.
 *   Break: in src/db/repos/social/ddb/comments.ts `deleteComment`, skip the `hasReplies` check (always remove).
 * - G-M26-SC4 (the old partial unique index `comments_one_pinned`): two hosts pinning two comments at once leave
 *   exactly one pinned comment. Break: in src/db/repos/social/ddb/comment-extras.ts `pinEnd`, drop the condition on
 *   the SOCIAL item (`conds.join(' AND ')`).
 * - G-M26-SC5 (data-model.md §2: chat ids stay numbers): with 12 messages, `?before=<id>` pages by number (id 10 comes
 *   after id 9). Break: in src/db/repos/social/ddb/chat.ts `M`, drop the padding (`M#${id}`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('lane SC guards (need DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, signUp } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { withStore, pgOf } = await import('../src/db/backend-ddb.ts');
  const { get, wrapStore } = await import('../src/db/ddb/store.ts');
  const { withConflicts } = await import('../src/db/ddb/test-wrappers.ts');
  const { TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  const K = await import('../src/db/ddb/keys.ts');
  const { heatCurve } = await import('../src/heat/ddb.ts');
  const { createComment, deleteComment, listComments } = await import('../src/db/repos/social/comments.ts');
  const { like } = await import('../src/db/repos/social/comment-likes.ts');
  const { pinAsHost } = await import('../src/db/repos/social/comment-extras.ts');
  const { fromFollowing, insertPost, liveCount, suggestedFor, sweepExpired, visiblePost } = await import('../src/db/repos/social/voice-posts.ts');
  const { visibleStatus } = await import('../src/db/repos/social/status-replies.ts');
  const { send, thread } = await import('../src/db/repos/social/chat.ts');
  const { countOf } = await import('./sc-neutral.ts');
  type Store = import('../src/db/ddb/store.ts').Store;

  const ep = { feedUrl: 'https://feeds.example.com/sc.xml', guid: 'sc1', title: 'SC', showTitle: 'Show', enclosureUrl: 'https://cdn.example.com/sc.mp3', durationMs: 1_000_000 };
  const EP = 'ep-sc-guards';

  test('G-M26-SC1: a reply and a like by one listener, racing (with conflicts), leave replyCount and likeCount exact', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const author = await signUp(t, 'author@example.com', 'Author');
      const people = await Promise.all(Array.from({ length: 5 }, (_, i) => signUp(t, `p${i}@example.com`, `P${i}`)));
      const root = await createComment(t.db, { episodeId: EP, authorId: author.id, body: 'root' });
      const racing = withConflicts(t.store!, (n) => n <= 6);
      const db = withStore(pgOf(t.db), racing);
      const results = await Promise.allSettled(people.flatMap((p) => [
        createComment(db, { episodeId: EP, authorId: p.id, body: `reply from ${p.id}`, parentId: root.id }),
        like(db, root.id, p.id),
        like(db, root.id, p.id), // the same like again: never counted twice
      ]));
      const item = await get(t.store!, 'main', { PK: K.EP(EP), SK: K.comment(EP, String(root.created_at), root.id).SK });
      assert.equal(Number(item?.['replyCount']), 5, 'five replies counted, no more, no fewer');
      assert.equal(Number(item?.['likeCount']), 5, 'five likes counted, the repeats not');
      assert.ok(racing.cancelled() > 0, 'transactions were cancelled by conflicts and tried again');
      assert.deepEqual(results.filter((r) => r.status === 'rejected'), [], 'every write went through');
      const listed = (await listComments(t.db, EP)).find((c) => c.id === root.id)!;
      assert.equal(listed.likeCount, 5);
      assert.equal(listed.replyCount, 5);
      assert.equal(await countOf(t, 'comment_likes'), 5);
    } finally { await t.close(); }
  });

  test('G-M26-SC2: a voice status is in no read at 24 h + 1 s (no TTL has run), and the sweep deletes its file and items', async () => {
    const t = await freshDb();
    try {
      const a = await signUp(t, 'a@example.com', 'Alex');
      const b = await signUp(t, 'b@example.com', 'Bea');
      const row = await insertPost(t.db, { id: '00000000-0000-4000-8000-0000000000c2', listenerId: a.id, url: 'https://blob.example/voice/x.m4a', path: 'voice/x.m4a', durationMs: 5_000, bytes: 100 });
      assert.equal((await fromFollowing(t.db, a.id)).length, 1, 'live: listed');
      // The clock moves on; nothing deletes the items in between (no sweep, no TTL — DynamoDB Local never runs TTL).
      const later: Store = { ...t.store!, clock: { now: () => Date.parse(row.expires_at as string) + 1_000 } };
      const db = withStore(pgOf(t.db), later);
      assert.ok(await get(t.store!, 'main', K.voicePost(row.id)), 'the item is still stored');
      assert.deepEqual(await fromFollowing(db, a.id), [], 'not in the following list');
      assert.equal(await visiblePost(db, row.id, a.id), undefined, 'not as a single status');
      assert.equal(await liveCount(db, a.id), 0, 'not in the live count');
      assert.equal(await visibleStatus(db, row.id, b.id), undefined, 'no reply or reaction can reach it');
      assert.deepEqual(await suggestedFor(db, b.id), [], 'not suggested');
      const removed: string[] = [];
      const voice = { ready: true, put: async () => ({ url: '', pathname: '' }), remove: async (u: string) => { removed.push(u); } };
      const r = await sweepExpired(db, voice, 200);
      assert.equal(r.deleted, 1);
      assert.deepEqual(removed, ['https://blob.example/voice/x.m4a'], 'the recording was deleted from the store');
      assert.equal(await countOf(t, 'voice_posts'), 0, 'and the status is gone, not hidden');
    } finally { await t.close(); }
  });

  test('G-M26-SC3: a deleted comment with a reply stays a placeholder; its reply stays under it, and it can be replied to', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const a = await signUp(t, 'a@example.com', 'Alex');
      const b = await signUp(t, 'b@example.com', 'Bea');
      const root = await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'root', offsetMs: 500_000 });
      const reply = await createComment(t.db, { episodeId: EP, authorId: b.id, body: 'a reply', parentId: root.id });
      assert.equal((await heatCurve(t.store!, EP))[50], 1);
      // (A whole delete would also fail the bridge's Postgres foreign key — caught, so the answer is what is checked.)
      const deleted = await deleteComment(t.db, root.id).catch((e: unknown) => ({ failed: e instanceof Error ? e.message : String(e) }));
      assert.deepEqual(deleted, { placeholder: true, episodeId: EP }, 'a comment with a reply becomes a placeholder');
      const [top] = await listComments(t.db, EP);
      assert.equal(top?.id, root.id, 'the placeholder is still the thread');
      assert.deepEqual([top!.deleted, top!.body, top!.authorId, top!.offsetMs, top!.displayName], [true, null, null, null, null]);
      assert.deepEqual(top!.replies!.map((r) => r.id), [reply.id], 'the reply keeps its context');
      assert.equal((await heatCurve(t.store!, EP))[50], 0, 'the placeholder carries no heat');
      const again = await createComment(t.db, { episodeId: EP, authorId: b.id, body: 'still answering', parentId: root.id });
      assert.deepEqual((await listComments(t.db, EP))[0]!.replies!.map((r) => r.id), [reply.id, again.id]);
    } finally { await t.close(); }
  });

  test('G-M26-SC4: two hosts pinning two comments at once leave exactly one pinned comment', async () => {
    const t = await freshDb();
    try {
      await putEpisode(t, EP, ep);
      const a = await signUp(t, 'a@example.com', 'Alex');
      const one = await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'one' });
      const two = await createComment(t.db, { episodeId: EP, authorId: a.id, body: 'two' });
      // Every transaction waits a moment, so both pins read "no pin yet" before either writes.
      const slow = wrapStore(t.store!, async (cmd, next) => { if (cmd instanceof TransactWriteCommand) await new Promise((r) => { setTimeout(r, 150); }); return next(cmd); });
      const db = withStore(pgOf(t.db), slow);
      await Promise.all([pinAsHost(db, one.id, EP, a.id, true), pinAsHost(db, two.id, EP, a.id, true)]);
      const pinned = (await listComments(t.db, EP)).filter((c) => c.pinned);
      assert.equal(pinned.length, 1, `exactly one pinned comment (got ${pinned.length})`);
      assert.equal((await get(t.store!, 'main', K.episodeSocial(EP)))?.['pinnedId'], pinned[0]!.id, 'the episode names the pinned one');
    } finally { await t.close(); }
  });

  test('G-M26-SC5: chat ids stay numbers; ?before= pages by number across 9 → 10', async () => {
    const t = await freshDb();
    try {
      const a = await signUp(t, 'a@example.com', 'Alex');
      const b = await signUp(t, 'b@example.com', 'Bea');
      const ids: string[] = [];
      for (let i = 1; i <= 12; i++) ids.push((await send(t.db, a.id, b.id, `m${i}`, undefined)).id);
      assert.deepEqual(ids.map(Number), Array.from({ length: 12 }, (_, i) => i + 1), 'ids 1…12 in order (SEQ#chat_messages)');
      const before11 = await thread(t.db, b.id, a.id, { before: '11' });
      assert.deepEqual(before11.map((m) => m.body), Array.from({ length: 10 }, (_, i) => `m${i + 1}`), 'the ten messages before id 11, oldest first');
      const after9 = await thread(t.db, b.id, a.id, { after: '9' });
      assert.deepEqual(after9.map((m) => m.body), ['m10', 'm11', 'm12']);
    } finally { await t.close(); }
  });
}
