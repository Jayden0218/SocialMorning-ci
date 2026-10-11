// Notifications on DynamoDB: one item per notice in the recipient's partition, a dedupe item so a repeated like or follow is told once.
/**
 * M26 lane SG, SG-T04 (patterns SG-19…SG-24), data-model.md §3 (`NOTIF#`, `NDEDUP#`).
 *
 * - `L#<recipient>/NOTIF#<createdAt>#<id>`: { id, recipientId, actorId, kind, ref, createdAt } — `ref` is a map (no jsonb
 *   string repair needed any more). Newest first is one Query, descending.
 * - `L#<recipient>/NDEDUP#<sha(actor, kind, canonical ref)>` for like / follow / like_post_like / status_reaction:
 *   put with `attribute_not_exists` in the SAME transaction as the notice — the same event delivered twice writes one
 *   notice (guard G-M26-SG3), and a racing twin cancels instead of doubling.
 * - The old INSERT … SELECT guards become reads before the write: never a self-act, never to a recipient who blocked
 *   the actor (lane SF, Postgres) or muted them (`MUTE#`, this lane), never from a muted thread (`TMUTE#`), never a
 *   like on a comment whose author turned like notices off (lane SC's comment, Postgres).
 * - `planNotice` returns the items so a caller can put them in ITS transaction (a follow does); `notify` commits them alone.
 * - The list joins at read time, as the SQL did: the actor (name, photo — a deleted actor drops the row), the comment's
 *   excerpt while visible (SC), the episode title (LB); actors I blocked or muted since are left out; `unread` against
 *   `notificationsSeenAt` on my listener item (written through lane AC, `setGraphFlags`).
 */
import { randomUUID } from 'node:crypto';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryPage, get, type Item } from '../../../ddb/store.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { isConflict, withRetry } from '../../../ddb/retry.ts';
import { getListener, txa, type TxA } from '../../account/ddb/common.ts';
import { setGraphFlags } from '../../account/ddb/listeners.ts';
import { pushFor, threadOf } from '../../account/push.ts';
import { MAX_MENTIONS, mentionCandidates, type NoticeItem, type NoticeKind } from '../notifications.ts';
import { blockedBy, commentsById, episodesById, hasBlocked, iso, left, listenersById, nowMs, type Hybrid } from './common.ts';
import { isMuted, isThreadMuted, mutedIdsFor } from './mutes.ts';

const PAGE = 30;
/** Kinds told once per (actor, ref): un-like and like again is not a second notice. */
const DEDUPE: ReadonlySet<NoticeKind> = new Set(['like', 'follow', 'like_post_like', 'status_reaction']);

type NoticeIn = { recipientId: string | null | undefined; actorId: string; kind: NoticeKind; ref?: Record<string, string> };

/** The same ref, keys sorted, as one string — so the dedupe key never depends on key order. */
const canonical = (ref: Record<string, string>): string => JSON.stringify(Object.keys(ref).sort().map((k) => [k, ref[k]]));
export const dedupeHash = (actorId: string, kind: string, ref: Record<string, string>): string => K.sha(`${actorId}\u0001${kind}\u0001${canonical(ref)}`);

export type NoticePlan = { add(t: TxA): void; after(): Promise<void> };

/** The notice's items for a caller's transaction, or undefined when no notice is due. Label of the dedupe item: `notice`. */
export async function planNotice(h: Hybrid, n: NoticeIn): Promise<NoticePlan | undefined> {
  const recipientId = n.recipientId;
  if (!recipientId || recipientId === n.actorId) return undefined;
  const ref = n.ref ?? {};
  // M22 US3: a muted thread, or a comment whose author stopped like notices, makes no notice at all.
  const thread = threadOf({ recipientId, actorId: n.actorId, kind: n.kind, ref });
  if (thread && (await isThreadMuted(h, recipientId, thread.kind, thread.key))) return undefined;
  const likedComment = n.kind === 'like' ? ref['commentId'] : undefined;
  if (likedComment) {
    const c = (await commentsById(h, [likedComment])).get(likedComment);
    if (c?.like_notices_off) return undefined;
  }
  if (await hasBlocked(h, recipientId, n.actorId)) return undefined;
  if (await isMuted(h, recipientId, n.actorId)) return undefined;
  const dedupe = DEDUPE.has(n.kind) ? K.notificationDedupe(recipientId, dedupeHash(n.actorId, n.kind, ref)) : undefined;
  if (dedupe && (await get(h.store, 'main', dedupe))) return undefined;
  const id = randomUUID();
  const createdAt = iso(nowMs(h));
  return {
    add(t) {
      t.put('main', encode('notification', K.notification(recipientId, createdAt, id), { id, recipientId, actorId: n.actorId, kind: n.kind, ref, createdAt }), { condition: 'attribute_not_exists(PK)' });
      if (dedupe) t.put('main', encode('notificationDedupe', dedupe, { notificationId: id, createdAt }), { condition: 'attribute_not_exists(PK)', label: 'notice' });
    },
    // M22 US1: the same notice as a phone push (never throws; lane AC's pushFor).
    after: async () => { await pushFor(h.pg, { recipientId, actorId: n.actorId, kind: n.kind, ref }); },
  };
}

/** Writes one notice unless it is a self-act, blocked, muted or already told (G-M21-9). True when written. */
export async function notify(h: Hybrid, n: NoticeIn): Promise<boolean> {
  // A conflicting twin (TransactionConflict) is retried from a fresh plan, which then finds the dedupe item.
  return withRetry(async () => {
    const plan = await planNotice(h, n);
    if (!plan) return false;
    const t = txa(h.store);
    plan.add(t);
    try {
      await t.commit();
    } catch (e) {
      if (e instanceof TxCancelled && e.failed('notice')) return false; // the same event, delivered twice at once
      throw e;
    }
    await plan.after();
    return true;
  }, { tries: 6, retryOn: isConflict });
}

/** Listeners whose lower-cased name is one of `names` (G6 `NAME#…`), oldest account first — the SQL's ORDER BY created_at. */
async function byNames(h: Hybrid, names: readonly string[]): Promise<Map<string, string>> {
  const hits: { name: string; id: string }[] = [];
  for (const name of names) {
    const { items } = await queryAll(h.store, 'main', { IndexName: K.INDEX.G6, KeyConditionExpression: 'G6PK = :n', ExpressionAttributeValues: { ':n': `NAME#${name}` } });
    for (const it of items) hits.push({ name, id: String(it['G6SK']) });
  }
  const ls = await listenersById(h.store, hits.map((x) => x.id));
  const live = hits.filter((x) => ls.has(x.id)).sort((a, b) => String(ls.get(a.id)!['createdAt']).localeCompare(String(ls.get(b.id)!['createdAt'])));
  const out = new Map<string, string>();
  for (const x of live) if (!out.has(x.name)) out.set(x.name, x.id);
  return out;
}

/** The listeners a body mentions: per `@`, the longest exact display name (case-insensitive); at most MAX_MENTIONS. */
export async function mentionedIds(h: Hybrid, body: string): Promise<string[]> {
  const groups = mentionCandidates(body).slice(0, 20);
  const all = [...new Set(groups.flat())];
  if (all.length === 0) return [];
  const byName = await byNames(h, all);
  const ids: string[] = [];
  for (const cands of groups) {
    const hit = [...cands].reverse().find((c) => byName.has(c));
    const id = hit ? byName.get(hit)! : undefined;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= MAX_MENTIONS) break;
  }
  return ids;
}

/** A new comment's notices: a reply tells the parent's author; each `@name` tells that listener (not twice). */
export async function notifyForComment(h: Hybrid, c: { id: string; episodeId: string; authorId: string; parentId?: string | null; body: string | null }): Promise<void> {
  let parentAuthor: string | null = null;
  if (c.parentId) {
    parentAuthor = (await commentsById(h, [c.parentId])).get(c.parentId)?.author_id ?? null; // lane SC's comment, Postgres
    await notify(h, { recipientId: parentAuthor, actorId: c.authorId, kind: 'reply', ref: { commentId: c.id, parentId: c.parentId, episodeId: c.episodeId } });
  }
  if (!c.body || !c.body.includes('@')) return;
  for (const id of await mentionedIds(h, c.body)) {
    if (id === parentAuthor) continue; // already told by the reply
    await notify(h, { recipientId: id, actorId: c.authorId, kind: 'mention', ref: { commentId: c.id, episodeId: c.episodeId, ...(c.parentId ? { parentId: c.parentId } : {}) } });
  }
}

/** My notices, newest first, 30 a page; `cursor` is the last item's `createdAt`. */
export async function listNotifications(h: Hybrid, recipientId: string, cursor?: string): Promise<{ items: NoticeItem[]; next: string | null }> {
  const before = cursor && !Number.isNaN(Date.parse(cursor)) ? new Date(cursor).toISOString() : null;
  const [me, blocked, muted] = await Promise.all([getListener(h, recipientId), blockedBy(h, recipientId), mutedIdsFor(h, recipientId)]);
  const seenAt = (me?.['notificationsSeenAt'] as string | undefined) ?? null;
  const want = PAGE + 1;
  const kept: { n: Item; actor: Item }[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const out = await queryPage(h.store, 'main', {
      KeyConditionExpression: before ? 'PK = :pk AND SK BETWEEN :lo AND :hi' : 'PK = :pk AND begins_with(SK, :p)',
      ExpressionAttributeValues: before ? { ':pk': K.L(recipientId), ':lo': K.LISTENER_SK.notifications, ':hi': `${K.LISTENER_SK.notifications}${before}` } : { ':pk': K.L(recipientId), ':p': K.LISTENER_SK.notifications },
      ScanIndexForward: false, ConsistentRead: true, Limit: 60, ...(start ? { ExclusiveStartKey: start } : {}),
    });
    const page = ((out.Items ?? []) as Item[]).filter((n) => !blocked.has(String(n['actorId'])) && !muted.has(String(n['actorId'])) && (!before || String(n['createdAt']) < before));
    const actors = await listenersById(h.store, page.map((n) => String(n['actorId'])));
    for (const n of page) {
      const actor = actors.get(String(n['actorId']));
      if (actor) kept.push({ n, actor }); // the old JOIN listeners: a deleted actor's notices go with them
      if (kept.length >= want) break;
    }
    start = out.LastEvaluatedKey;
  } while (start && kept.length < want);
  const slice = kept.slice(0, PAGE);
  const refOf = (n: Item) => (n['ref'] ?? {}) as Record<string, string>;
  const comments = await commentsById(h, [...new Set(slice.map(({ n }) => refOf(n)['commentId']).filter((x): x is string => Boolean(x)))]);
  const eps = await episodesById(h.store, slice.map(({ n }) => refOf(n)['episodeId']).filter((x): x is string => Boolean(x)));
  const items = slice.map(({ n, actor }): NoticeItem => {
    const ref = refOf(n);
    const commentId = ref['commentId'];
    const episodeId = ref['episodeId'];
    const c = commentId ? comments.get(commentId) : undefined;
    const excerpt = c && c.deleted_at === null && c.removed_at === null && c.host_hidden_at === null && c.body !== null ? left(c.body, 120) : null;
    const title = episodeId ? (eps.get(episodeId)?.['title'] as string | undefined) : undefined;
    const createdAt = String(n['createdAt']);
    return {
      id: String(n['id']), kind: n['kind'] as NoticeKind,
      actor: { id: String(n['actorId']), name: String(actor['displayName']), avatarUrl: (actor['avatarUrl'] as string | undefined) ?? null },
      ref: { ...ref, ...(excerpt ? { excerpt } : {}), ...(title ? { episodeTitle: title } : {}) },
      createdAt, unread: seenAt === null || createdAt > seenAt,
    };
  });
  return { items, next: kept.length > PAGE ? items[items.length - 1]!.createdAt : null };
}

/** Everything up to now is read (lane AC writes the listener field). */
export async function markSeen(h: Hybrid, recipientId: string): Promise<void> {
  await setGraphFlags(h, recipientId, { notificationsSeenAt: iso(nowMs(h)) });
}

/** For the deletion job and tests: every notice item of a listener. */
export async function noticeItems(h: Hybrid, recipientId: string): Promise<Item[]> {
  return (await queryAll(h.store, 'main', { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(recipientId), ':p': K.LISTENER_SK.notifications }, ConsistentRead: true })).items;
}

