// Status replies and reactions on DynamoDB: under the status's partition, counted on it, each with a pointer in its writer's partition.
/**
 * M26 lane SC (SC-T06; M22 US2, guard G-M22-2). `VP#<postId> / REPLY#<createdAt>#<id>` (text or a voice recording,
 * `expiresAt` the status's), `VP#<postId> / REACT#<listener>` (one per listener, a new kind replaces the old), with
 * `replyCount` / `reactionCount` on the status in the same transaction, and `L#<writer>/VPR#…` / `VPX#…` so account
 * deletion finds what a listener wrote on other people's statuses. A status read never returns an expired one
 * (`expiresAt` is checked on every read — TTL is only the backstop).
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { TxCancelled, type Tx } from '../../../ddb/tx.ts';
import type { VoiceStorage } from '../../../../storage/voice-blob.ts';
import { blockedIdsFor } from '../../safety/blocks.ts';
import { initialsOf } from '../comment-likes.ts';
import { notify } from '../notifications.ts';
import { REACTION_MILESTONE, REPLY_TEXT_MAX, type ReactionSummary, type StatusPostRow, type StatusReply } from '../status-replies.ts';
import * as B from './sc-bridge.ts';
import { commitRetry, keyOf, nowIso, nowMs, people, person, prefixItems, rawPg, UUID, visiblePerson } from './sc-common.ts';
import { blockedEitherWay } from './sc-foreign.ts';

const DAY_MS = 86_400_000;
const live = (post: Item | undefined, now: number): post is Item => post !== undefined && Date.parse(String(post['expiresAt'])) > now;

/** A live status the viewer may see, or undefined (→ 404; a block never shows as "blocked"). */
export async function visibleStatus(store: Store, db: Db, postId: string, viewerId: string): Promise<StatusPostRow | undefined> {
  if (!UUID.test(postId)) return undefined;
  const post = await get(store, 'main', K.voicePost(postId));
  if (!live(post, nowMs(store))) return undefined;
  const author = String(post['listenerId']);
  if (!visiblePerson(await person(store, author))) return undefined;
  if ((await blockedEitherWay(db, viewerId)).has(author)) return undefined;
  return { id: postId, listener_id: author, expires_at: String(post['expiresAt']) };
}

const chars = (s: string) => [...s].length;

async function addReply(store: Store, db: Db, post: StatusPostRow, authorId: string, r: { body: string | null; audioKey: string | null; audioUrl: string | null; audioMs: number | null }): Promise<string> {
  const id = randomUUID();
  const createdAt = nowIso(store);
  const expiresAt = new Date(post.expires_at).toISOString();
  const ttl = ttlAfter(Date.parse(expiresAt), DAY_MS);
  await commitRetry(store, (t: Tx) => {
    t.put('main', encode('statusReply', K.statusReply(post.id, createdAt, id), {
      id, postId: post.id, authorId, body: r.body ?? undefined, audioKey: r.audioKey ?? undefined, audioUrl: r.audioUrl ?? undefined, audioMs: r.audioMs ?? undefined, createdAt, expiresAt,
    }, { ttl }), { condition: 'attribute_not_exists(PK)' });
    t.put('main', encode('statusReplyPtr', K.statusReplyPtr(authorId, post.id, id), { postId: post.id, id, expiresAt }, { ttl }));
    t.update('main', K.voicePost(post.id), { update: 'ADD #n :one', condition: 'attribute_exists(PK)', names: { '#n': 'replyCount' }, values: { ':one': 1 } });
  });
  const raw = rawPg(db);
  if (raw) await B.insertStatusReply(raw, { id, postId: post.id, authorId, ...r, createdAt });
  return id;
}

export async function addTextReply(store: Store, db: Db, post: StatusPostRow, authorId: string, body: string): Promise<string> {
  const text = body.trim();
  if (text.length === 0 || chars(text) > REPLY_TEXT_MAX) throw new Error('reply_length');
  const id = await addReply(store, db, post, authorId, { body: text, audioKey: null, audioUrl: null, audioMs: null });
  await notify(db, { recipientId: post.listener_id, actorId: authorId, kind: 'status_reply', ref: { postId: post.id, replyId: id, excerpt: text.slice(0, 120) } });
  return id;
}

export async function addAudioReply(store: Store, db: Db, post: StatusPostRow, authorId: string, a: { key: string; url: string; durationMs: number }): Promise<string> {
  const id = await addReply(store, db, post, authorId, { body: null, audioKey: a.key, audioUrl: a.url, audioMs: a.durationMs });
  await notify(db, { recipientId: post.listener_id, actorId: authorId, kind: 'status_reply', ref: { postId: post.id, replyId: id, excerpt: 'A voice reply' } });
  return id;
}

/** FR-007: the owner reads every reply; anyone else only their own. Oldest first. */
export async function listReplies(store: Store, db: Db, post: StatusPostRow, viewerId: string): Promise<StatusReply[]> {
  const owner = post.listener_id === viewerId;
  const blocked = await blockedIdsFor(db, viewerId);
  const items = (await prefixItems(store, `VP#${post.id}`, 'REPLY#')).filter((r) => (owner || r['authorId'] === viewerId) && !blocked.has(String(r['authorId'])));
  const ppl = await people(store, items.map((r) => String(r['authorId'])));
  return items
    .filter((r) => { const p = ppl.get(String(r['authorId'])); return p !== undefined && !p.suspendedAt; })
    .sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt'])) || String(a['id']).localeCompare(String(b['id'])))
    .slice(0, 500)
    .map((r) => {
      const p = ppl.get(String(r['authorId']))!;
      return {
        id: String(r['id']),
        author: { id: p.id, name: p.displayName, initials: initialsOf(p.displayName), ...(p.avatarUrl ? { avatarUrl: p.avatarUrl } : {}) },
        ...(r['body'] !== undefined && r['body'] !== null ? { body: String(r['body']) } : {}),
        ...(r['audioUrl'] ? { url: String(r['audioUrl']), durationMs: Number(r['audioMs'] ?? 0) } : {}),
        createdAt: String(r['createdAt']),
        mine: r['authorId'] === viewerId,
      };
    });
}

/** A reply item, its writer's pointer and the status's count go together (the file, if any, went first). */
export function dropReply(t: Tx, r: Item, countOnPost: boolean): void {
  t.delete('main', keyOf(r));
  t.delete('main', K.statusReplyPtr(String(r['authorId']), String(r['postId']), String(r['id'])));
  if (countOnPost) t.update('main', K.voicePost(String(r['postId'])), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'replyCount' }, values: { ':minus': -1 } });
}

/** The owner deletes any reply, the author their own; a voice reply's file goes first. */
export async function deleteReply(store: Store, db: Db, storage: VoiceStorage, post: StatusPostRow, replyId: string, viewerId: string): Promise<'ok' | 'not_found'> {
  if (!UUID.test(replyId)) return 'not_found';
  const [r] = await prefixItems(store, `VP#${post.id}`, 'REPLY#', { keep: (i) => i['id'] === replyId, max: 1 });
  if (!r || (r['authorId'] !== viewerId && post.listener_id !== viewerId)) return 'not_found';
  if (r['audioUrl']) await storage.remove(String(r['audioUrl']));
  await commitRetry(store, (t) => { dropReply(t, r, true); });
  const raw = rawPg(db);
  if (raw) await B.deleteStatusReply(raw, replyId);
  return 'ok';
}

/**
 * One reaction per listener (FR-008); a new kind replaces the old. The owner is told of a first reaction from each
 * listener, and once — `milestoneSentAt`, claimed with a condition — when the status reaches 100.
 */
export async function setReaction(store: Store, db: Db, post: StatusPostRow, listenerId: string, kind: number): Promise<void> {
  const at = nowIso(store);
  const expiresAt = new Date(post.expires_at).toISOString();
  const ttl = ttlAfter(Date.parse(expiresAt), DAY_MS);
  for (let attempt = 1; ; attempt++) {
    const cur = await get(store, 'main', K.statusReaction(post.id, listenerId));
    try {
      await commitRetry(store, (t) => {
        t.put('main', encode('statusReaction', K.statusReaction(post.id, listenerId), { postId: post.id, listenerId, kind, createdAt: at, expiresAt }, { ttl }), {
          condition: cur ? 'attribute_exists(PK)' : 'attribute_not_exists(PK)', label: 'reaction',
        });
        t.put('main', encode('statusReactionPtr', K.statusReactionPtr(listenerId, post.id), { postId: post.id, expiresAt }, { ttl }));
        if (!cur) t.update('main', K.voicePost(post.id), { update: 'ADD #n :one', condition: 'attribute_exists(PK)', names: { '#n': 'reactionCount' }, values: { ':one': 1 } });
      });
      break;
    } catch (e) {
      if (attempt < 4 && e instanceof TxCancelled && e.failed('reaction')) continue;
      throw e;
    }
  }
  const raw = rawPg(db);
  if (raw) await B.upsertStatusReaction(raw, post.id, listenerId, kind, at);
  await notify(db, { recipientId: post.listener_id, actorId: listenerId, kind: 'status_reaction', ref: { postId: post.id } });
  const n = Number((await get(store, 'main', K.voicePost(post.id)))?.['reactionCount'] ?? 0);
  if (n < REACTION_MILESTONE) return;
  try {
    await commitRetry(store, (t) => {
      t.update('main', K.voicePost(post.id), { update: 'SET #m = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#m)', names: { '#m': 'milestoneSentAt' }, values: { ':at': at }, label: 'milestone' });
    });
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('milestone')) return; // told once already
    throw e;
  }
  // The actor is the listener whose reaction made 100; notify() skips it when that is the owner.
  await notify(db, { recipientId: post.listener_id, actorId: listenerId, kind: 'status_milestone', ref: { postId: post.id } });
}

export async function clearReaction(store: Store, db: Db, postId: string, listenerId: string): Promise<void> {
  try {
    await commitRetry(store, (t) => {
      t.delete('main', K.statusReaction(postId, listenerId), { condition: 'attribute_exists(PK)', label: 'reaction' });
      t.delete('main', K.statusReactionPtr(listenerId, postId));
      t.update('main', K.voicePost(postId), { update: 'ADD #n :minus', condition: 'attribute_exists(PK)', names: { '#n': 'reactionCount' }, values: { ':minus': -1 } });
    });
  } catch (e) {
    if (!(e instanceof TxCancelled && e.conditionFailed)) throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.deleteStatusReaction(raw, postId, listenerId);
}

/** Per post: counts per kind, the viewer's own kind, and — for the owner only — the reply count and who reacted. */
export async function summaries(store: Store, _db: Db, posts: readonly { id: string; listenerId: string }[], viewerId: string): Promise<Map<string, ReactionSummary>> {
  const out = new Map<string, ReactionSummary>();
  for (const p of posts) {
    const s: ReactionSummary = { reactions: [], myReaction: null, ...(p.listenerId === viewerId ? { replyCount: 0, reactedBy: [] } : {}) };
    const reacts = await prefixItems(store, `VP#${p.id}`, 'REACT#');
    const byKind = new Map<number, number>();
    for (const r of reacts) {
      byKind.set(Number(r['kind']), (byKind.get(Number(r['kind'])) ?? 0) + 1);
      if (r['listenerId'] === viewerId) s.myReaction = Number(r['kind']);
    }
    s.reactions = [...byKind.entries()].sort((a, b) => a[0] - b[0]).map(([kind, count]) => ({ kind, count }));
    if (p.listenerId === viewerId) {
      s.replyCount = (await prefixItems(store, `VP#${p.id}`, 'REPLY#')).length;
      const ppl = await people(store, reacts.map((r) => String(r['listenerId'])));
      s.reactedBy = reacts
        .filter((r) => { const x = ppl.get(String(r['listenerId'])); return x !== undefined && !x.suspendedAt; })
        .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
        .slice(0, 1000)
        .map((r) => ({ id: String(r['listenerId']), name: ppl.get(String(r['listenerId']))!.displayName, kind: Number(r['kind']) }));
    }
    out.set(p.id, s);
  }
  return out;
}

/** The voice-reply files hanging off these posts (for the sweep and for deleting a status). */
export async function replyAudioOf(store: Store, _db: Db, postIds: readonly string[]): Promise<{ id: string; audio_url: string }[]> {
  const out: { id: string; audio_url: string }[] = [];
  for (const id of postIds) {
    for (const r of await prefixItems(store, `VP#${id}`, 'REPLY#')) if (r['audioUrl']) out.push({ id: String(r['id']), audio_url: String(r['audioUrl']) });
  }
  return out;
}
