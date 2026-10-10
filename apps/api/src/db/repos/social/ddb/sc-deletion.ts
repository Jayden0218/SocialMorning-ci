// Account deletion's social phase on DynamoDB: a listener's comments, reactions, likes, clips, statuses and chats, piece by piece.
/**
 * M26 lane SC (AC-T09's "each lane replaces its part"; data-model.md §8). Lane AC's deletion job (`JOB#delete`,
 * account/ddb/deletion.ts) runs this as its `social` phase, after `others` and before the listener's partition goes.
 * One call handles at most `CHUNK` of the listener's own index items (`L#<id>/CMT#…`, `REACT#…`, `CLIKE#…`, `UNF#…`,
 * `CLP#…`, `ELIKE#…`, `LKC#…`, `LKR#…`, `VPOST#…`, `VPR#…`, `VPX#…`, `SMUTE#…`, `SMUTEBY#…`, `CONV#…`): each one's
 * other side is fixed or deleted, then the index item itself — so a step killed half-way is simply run again.
 * - comments: a comment with replies becomes a placeholder (M23 US4), the rest go; heat marks and counters move with them;
 * - reactions, comment likes, "unfriendly" marks: the marks and counters they hold are taken back;
 * - clips go whole (and their uniqueness item); episode likes take their like-post partition with them;
 * - statuses: their partitions (the files went in the job's `blobs` phase); replies and reactions on others' statuses;
 * - chats: every message of each conversation (both senders — the old cascade), then both conversation items.
 */
import type { Db } from '../../../db.ts';
import { batchWriteAll, type WriteRequest } from '../../../ddb/batch.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { removeHeatMark } from '../../../../heat/ddb.ts';
import { commentItemById, commitRetry, keyOf, nowIso, prefixItems } from './sc-common.ts';
import { hasReplies, placeholderItem, removeCommentItem } from './comments.ts';
import { removeLike } from './comment-likes.ts';
import { clipItemById } from './clips.ts';
import { unlike } from './likes.ts';
import { dropPartition } from './voice-posts.ts';

const CHUNK = 25;

type Handler = (store: Store, db: Db, me: string, ptr: Item) => Promise<void>;

const dropPtr = (store: Store, ptr: Item) => batchWriteAll(store, 'main', [{ delete: keyOf(ptr) }]);

const ignoreCondition = async (p: Promise<void>): Promise<void> => {
  try { await p; } catch (e) { if (!(e instanceof TxCancelled && e.conditionFailed)) throw e; }
};

const HANDLERS: [string, Handler][] = [
  [K.SC_SK.comments, async (store, db, me, ptr) => {
    const it = await get(store, 'main', { PK: K.EP(String(ptr['episodeId'])), SK: String(ptr['sk']) });
    if (it && it['authorId'] === me) {
      if (await hasReplies(store, it)) await placeholderItem(store, db, it);
      else await removeCommentItem(store, db, it);
    }
    await dropPtr(store, ptr); // gone already when the comment went; a no-op then
  }],
  [K.SC_SK.reactions, async (store, _db, me, ptr) => {
    await ignoreCondition(removeHeatMark(store, { episodeId: String(ptr['episodeId']), listenerId: me, bucket: Number(ptr['bucket']) }, (t) => {
      t.delete('main', keyOf(ptr), { condition: 'attribute_exists(PK)', label: 'reaction' });
    }));
  }],
  [K.SC_SK.commentLikes, async (store, _db, me, ptr) => {
    const it = await commentItemById(store, String(ptr['commentId']));
    if (!it || !(await removeLike(store, it, me, nowIso(store)))) await dropPtr(store, ptr);
  }],
  [K.SC_SK.unfriendly, async (store, _db, me, ptr) => {
    const it = await commentItemById(store, String(ptr['commentId']));
    if (it) {
      await ignoreCondition(commitRetry(store, (t) => {
        t.delete('main', K.unfriendlyMark(String(it['episodeId']), String(it['id']), me), { condition: 'attribute_exists(PK)', label: 'unfriendly' });
        t.update('main', keyOf(it), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'unfriendlyCount' }, values: { ':minus': -1 } });
      }));
    }
    await dropPtr(store, ptr);
  }],
  [K.SC_SK.clips, async (store, _db, me, ptr) => {
    const c = await clipItemById(store, String(ptr['id']));
    const writes: WriteRequest[] = [{ delete: K.clipRef(String(ptr['id'])) }];
    if (c && c['authorId'] === me) writes.push({ delete: keyOf(c) }, { delete: K.U.clip(me, String(c['clientId'])) });
    await batchWriteAll(store, 'main', writes);
    await dropPtr(store, ptr);
  }],
  [K.SC_SK.likes, async (store, db, me, ptr) => {
    await unlike(store, db, me, String(ptr['episodeId']));
  }],
  [K.SC_SK.likeComments, async (store, _db, _me, ptr) => {
    await batchWriteAll(store, 'main', [{ delete: { PK: K.LK(String(ptr['ownerId']), String(ptr['episodeId'])), SK: String(ptr['sk']) } }, { delete: keyOf(ptr) }]);
  }],
  [K.SC_SK.likeReactions, async (store, _db, me, ptr) => {
    await batchWriteAll(store, 'main', [{ delete: K.likeReaction(String(ptr['ownerId']), String(ptr['episodeId']), me) }, { delete: keyOf(ptr) }]);
  }],
  [K.SC_SK.statuses, async (store, _db, _me, ptr) => {
    await dropPartition(store, String(ptr['id']));
    await dropPtr(store, ptr);
  }],
  [K.SC_SK.statusReplies, async (store, _db, _me, ptr) => {
    const postId = String(ptr['postId']);
    const [r] = await prefixItems(store, `VP#${postId}`, 'REPLY#', { keep: (i) => i['id'] === ptr['id'], max: 1 });
    if (r) {
      await ignoreCondition(commitRetry(store, (t) => {
        t.delete('main', keyOf(r), { condition: 'attribute_exists(PK)', label: 'reply' });
        t.update('main', K.voicePost(postId), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'replyCount' }, values: { ':minus': -1 } });
      }));
    }
    await dropPtr(store, ptr);
  }],
  [K.SC_SK.statusReactions, async (store, _db, me, ptr) => {
    const postId = String(ptr['postId']);
    await ignoreCondition(commitRetry(store, (t) => {
      t.delete('main', K.statusReaction(postId, me), { condition: 'attribute_exists(PK)', label: 'reaction' });
      t.update('main', K.voicePost(postId), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'reactionCount' }, values: { ':minus': -1 } });
    }));
    await dropPtr(store, ptr);
  }],
  [K.SC_SK.suggestionMutes, async (store, _db, me, ptr) => {
    await batchWriteAll(store, 'main', [{ delete: K.suggestionMutedBy(String(ptr['mutedId']), me) }, { delete: keyOf(ptr) }]);
  }],
  [K.SC_SK.suggestionMutedBy, async (store, _db, me, ptr) => {
    await batchWriteAll(store, 'main', [{ delete: K.suggestionMute(String(ptr['muterId']), me) }, { delete: keyOf(ptr) }]);
  }],
  [K.SC_SK.conversations, async (store, _db, me, ptr) => {
    const partner = String(ptr['partnerId']);
    const { items } = await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :m)', ExpressionAttributeValues: { ':pk': K.chatPair(me, partner), ':m': 'M#' }, ConsistentRead: true,
    }, { max: CHUNK });
    if (items.length > 0) {
      await batchWriteAll(store, 'main', items.flatMap((m) => [{ delete: keyOf(m) }, { delete: K.chatRef(Number(m['id'])) }]));
      return; // more next step; the conversation items go once the pair is empty
    }
    await batchWriteAll(store, 'main', [{ delete: K.conversation(partner, me) }, { delete: keyOf(ptr) }]);
  }],
];

/** One step of the social phase. True when nothing of this lane is left in the listener's index. */
export async function deleteSocialStep(store: Store, db: Db, listenerId: string): Promise<boolean> {
  for (const [prefix, handle] of HANDLERS) {
    const ptrs = await prefixItems(store, K.L(listenerId), prefix, { max: CHUNK });
    if (ptrs.length === 0) continue;
    for (const p of ptrs) await handle(store, db, listenerId, p);
    return false;
  }
  return true;
}
