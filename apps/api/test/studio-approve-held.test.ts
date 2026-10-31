// M32 T014 (review A2): a failed picture attach must not bring the held comment back next to the posted one.
/**
 * Guard G-M32-A2: approving a held comment whose picture cannot be attached leaves ONE comment, never two.
 * Before the fix the catch around (createComment + setCommentImage) put the held comment back after the comment
 * was already posted, so a second approval posted it again.
 * Break: in src/db/repos/studio/ddb/comments.ts `approveHeld`, wrap `setCommentImage` in the same try as `createComment`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('G-M32-A2 (needs DynamoDB Local: DDB_ENDPOINT)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { fnv1a64 } = await import('@socialmorning/social-core');
  const { freshDb, signUp } = await import('./harness.ts');
  const { putEpisode } = await import('./put-episode.ts');
  const { proveClaim, sCall, studioLogin } = await import('./studio-harness.ts');
  const { acScan } = await import('./fixtures.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { update } = await import('../src/db/ddb/store.ts');
  const { drainOutbox } = await import('../src/jobs/outbox.ts');
  const { commentControl, approveHeld } = await import('../src/db/repos/studio/comment-policy.ts');
  const { listComments } = await import('../src/db/repos/social/comments.ts');

  test('G-M32-A2: the picture cannot be attached → two approvals post the comment exactly once', async () => {
    const FEED = 'https://feeds.example.com/a2.xml';
    const t = await freshDb();
    const EP = fnv1a64(FEED + '\u0001g1');
    await putEpisode(t, EP, { feedUrl: FEED, guid: 'g1', title: 'Ep', enclosureUrl: 'https://cdn/1.mp3', durationMs: 1_000_000 });
    const owner = await studioLogin(t, 'o@example.com', 'Host');
    const key = await proveClaim(t, owner.id, FEED);
    await sCall(t, 'PUT', `/v1/studio/shows/${key}/comment-policy`, owner, { mode: 'review' });
    const mei = await signUp(t, 'mei@example.com', 'Mei');
    const held = await commentControl(t.db, { id: EP, feed_url: FEED }, mei.id, { body: 'Picture please' });
    assert.ok(held);
    // A picture path with no size: attaching it makes a NaN number, which DynamoDB refuses → the attach throws.
    await update(t.store!, 'main', K.heldComment(EP, held.id), { update: 'SET #p = :p, #u = :u', names: { '#p': 'imagePath', '#u': 'imageUrl' }, values: { ':p': 'p/x.jpg', ':u': 'https://img.example/x.jpg' } });
    const outcomes = await Promise.allSettled([approveHeld(t.db, FEED, held.id)]);
    await Promise.allSettled([approveHeld(t.db, FEED, held.id)]);
    assert.equal(outcomes[0]!.status, 'rejected', 'the attach really failed (the test setup)');
    await drainOutbox(t.store!);
    const visible = (await listComments(t.db, EP)).filter((c) => c.body === 'Picture please');
    assert.equal(visible.length, 1, 'the comment is posted once, not once per approval');
    assert.equal((await acScan(t.store!, 'main', 'heldComment')).length, 0, 'it is not back in the held list');
    await t.close();
  });
}
