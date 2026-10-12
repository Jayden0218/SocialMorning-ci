// What the safety DynamoDB code reads in other repos' items (social content, the shared lists, Studio) — through their DynamoDB code.
/**
 * The social rows (comments, clips, statuses, chat messages) and the shared lists are read through their own getters
 * (`commentItemById`, `clipItemById`, `K.voicePost`, `chatRef` + the pair partition; `lists-ddb/shared-lists.ts`).
 * The returned rows keep a snake_case shape, so reports.ts and moderation.ts read them as before. Take-downs are
 * those repos' setters (moderation.ts applyTakedown); nothing here writes.
 */
import type { Db } from '../../../db.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { CHAT_CONTEXT } from '../reports.ts';

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));

// ---- SC / lists: the reported item as it is now (reports.ts snapshotTarget) ----

export type CommentRow = { body: string | null; offset_ms: number | null; author_id: string | null; episode_id: string; deleted_at: string | null; removed_at: string | null; voice_url: string | null; transcript: string | null; image_url: string | null };
export async function commentRow(store: Store, id: string): Promise<CommentRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { commentItemById } = await import('../../social/ddb/sc-common.ts');
  const it = await commentItemById(store, id);
  if (!it) return undefined;
  return {
    body: str(it['body']), offset_ms: num(it['offsetMs']), author_id: str(it['authorId']), episode_id: String(it['episodeId']), deleted_at: str(it['deletedAt']),
    removed_at: str(it['removedAt']), voice_url: str(it['voiceUrl']), transcript: str(it['transcript']), image_url: str(it['imageUrl']),
  };
}

export type ClipRow = { caption: string; start_ms: number; end_ms: number; author_id: string; episode_id: string; deleted_at: string | null; removed_at: string | null };
export async function clipRow(store: Store, id: string): Promise<ClipRow | undefined> {
  const { clipItemById } = await import('../../social/ddb/clips.ts');
  const it = await clipItemById(store, id);
  if (!it) return undefined;
  return {
    caption: String(it['caption'] ?? ''), start_ms: Number(it['startMs']), end_ms: Number(it['endMs']), author_id: String(it['authorId']),
    episode_id: String(it['episodeId']), deleted_at: str(it['deletedAt']), removed_at: str(it['removedAt']),
  };
}

export type StatusRow = { listener_id: string; body: string | null; blob_url: string | null; transcript: string | null; live: boolean };
export async function statusRow(store: Store, id: string): Promise<StatusRow | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const p = await get(store, 'main', K.voicePost(id), { consistent: true });
  if (!p) return undefined;
  return { listener_id: String(p['listenerId']), body: str(p['body']), blob_url: str(p['blobUrl']), transcript: str(p['transcript']), live: Date.parse(String(p['expiresAt'])) > store.clock.now() };
}

/** A chat message by id: `CHM#<id>` names its pair partition (lane SC's chat.ts). */
async function chatItem(store: Store, id: string): Promise<Item | undefined> {
  if (!/^\d{1,18}$/.test(id)) return undefined;
  const n = Number(id);
  const ref = await get(store, 'main', K.chatRef(n), { consistent: true });
  return ref ? get(store, 'main', { PK: String(ref['pk']), SK: `M#${K.pad(n)}` }, { consistent: true }) : undefined;
}

export type ChatRow = { sender_id: string; recipient_id: string; body: string; removed_at: string | null; created_at: Date | string };
export async function chatRow(store: Store, id: string): Promise<ChatRow | undefined> {
  const it = await chatItem(store, id);
  if (!it) return undefined;
  return { sender_id: String(it['senderId']), recipient_id: String(it['recipientId']), body: String(it['body'] ?? ''), removed_at: str(it['removedAt']), created_at: String(it['createdAt']) };
}
/** Up to CHAT_CONTEXT live messages before `id` in the same conversation, newest first (as the SQL read them). */
export async function chatBefore(store: Store, a: string, b: string, id: string): Promise<{ sender_id: string; body: string; created_at: Date | string }[]> {
  const n = Number(id);
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.chatPair(a, b), ':lo': 'M#', ':hi': `M#${K.pad(n)}` },
    ConsistentRead: true, ScanIndexForward: false,
  }, { max: CHAT_CONTEXT, keep: (m) => !m['removedAt'] && m['SK'] !== `M#${K.pad(n)}` });
  return items.map((m) => ({ sender_id: String(m['senderId']), body: String(m['body'] ?? ''), created_at: String(m['createdAt']) }));
}

export type ListRow = { owner_id: string; title: string; n: number; removed_at: string | null };
/** Lane LE's shared list (lists-ddb/shared-lists.ts). */
export async function sharedListRow(store: Store, id: string): Promise<ListRow | undefined> {
  return (await import('../../social/lists-ddb/shared-lists.ts')).sharedListRow(store, id);
}

/** SC / lists: who wrote the item, from its item while it exists (moderation.ts authorOf). */
export async function liveAuthor(store: Store, kind: string, id: string): Promise<string | null> {
  if (kind === 'comment') return (await commentRow(store, id))?.author_id ?? null;
  if (kind === 'clip') return (await clipRow(store, id))?.author_id ?? null;
  if (kind === 'status') return (await statusRow(store, id))?.listener_id ?? null;
  if (kind === 'chat_message') return (await chatRow(store, id))?.sender_id ?? null;
  if (kind === 'list' && /^[A-Za-z0-9]{10}$/.test(id)) return (await import('../../social/lists-ddb/shared-lists.ts')).sharedListOwner(store, id);
  return null;
}

// ---- ST: Studio shows (mod-shows.ts, admin-users.ts) ----

export type HostedShowRow = { id: string; title: string; feed_url: string; owner_id: string | null; created_at: Date | string; updated_at: Date | string; eps: number };
// Lane ST moved (2026-10-11): these read and write lane ST's DynamoDB items through its repo (studio/ddb/hosted.ts, claims.ts).

/** ST: the last 50 live shows made in the Studio, newest change first, with their live episode counts. */
export async function liveHostedShows(store: Store, db: Db): Promise<HostedShowRow[]> {
  const H = await import('../../studio/ddb/hosted.ts');
  const shows = await H.liveHostedShows(store, 50);
  return Promise.all(shows.map(async (s) => ({
    id: s.id, title: s.title, feed_url: s.feedUrl, owner_id: s.ownerId, created_at: s.createdAt, updated_at: s.updatedAt,
    eps: (await H.listHostedEpisodes(store, db, s.id)).length,
  })));
}

/** ST: a listener's live Studio shows, newest first. */
export async function hostedShowsOf(store: Store, ownerId: string): Promise<{ feed_url: string; title: string }[]> {
  const H = await import('../../studio/ddb/hosted.ts');
  return (await H.hostedShowsOf(store, ownerId)).slice(0, 50).map((s) => ({ feed_url: s.feedUrl, title: s.title }));
}

/** ST: the Studio half of a take-down — its episodes go and its proven claim is revoked. */
export async function takedownStudio(store: Store, db: Db, showId: string, feedUrl: string): Promise<void> {
  const [H, C] = await Promise.all([import('../../studio/ddb/hosted.ts'), import('../../studio/ddb/claims.ts')]);
  await H.markHostedEpisodesDeleted(store, db, showId);
  await C.revokeProven(store, feedUrl);
}
