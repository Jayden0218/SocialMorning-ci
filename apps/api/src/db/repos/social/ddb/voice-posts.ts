// Voice and text statuses on DynamoDB: one partition per status, gone from every read at 24 h and deleted (files first) by the hourly sweep.
/**
 * M26 lane SC (SC-T06; constitution: a voice status ≤ 60 s, deleted by the server at 24 h — guards G-V1, G-M22-2,
 * G-M26-SC2). `VP#<id> / POST` the status (`expiresAt`, counters, G4 `Q#statuses` sorted by `expiresAt`), its
 * replies, reactions and items under the same partition (one Query to read, one Query + BatchWrite to delete — the
 * old three cascades), `L#<author> / VPOST#<createdAt>#<id>` the author's index (live count, following list).
 *
 * Expiry is enforced three ways, none of them TTL: every read filters `expiresAt > now`; the hourly sweep reads
 * `Q#statuses` below now and deletes each expired status — its reply recordings and photos from their stores first,
 * then its own recording, then the items (a failed file delete keeps the status for the next cycle); TTL
 * (`expiresAt` + 1 day) only catches what nothing else did.
 */
import type { Db } from '../../../db.ts';
import { batchGetAll, batchWriteAll, type WriteRequest } from '../../../ddb/batch.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import type { VoiceStorage } from '../../../../storage/voice-blob.ts';
import type { ImageStorage } from '../../../../storage/image-store.ts';
import { mutedIdsFor } from '../mutes.ts';
import { photosOf, removePhoto } from '../status-items.ts';
import { replyAudioOf } from '../status-replies.ts';
import { sweepOrphanPhotos } from '../status-items.ts';
import { SUGGESTED_MAX, toPublicPost, type PublicPost, type VoiceRow } from '../voice-posts.ts';
import * as B from './sc-bridge.ts';
import { keyOf, nowIso, nowMs, partitionAll, people, person, prefixItems, rawPg, UUID, visiblePerson, type Person } from './sc-common.ts';
import { blockedEitherWay, followedIds } from './sc-foreign.ts';

export const STATUS_LIFE_MS = 24 * 3_600_000;
const DAY_MS = 86_400_000;
const isLive = (p: Item | undefined, now: number): p is Item => p !== undefined && Date.parse(String(p['expiresAt'])) > now;

function voiceRow(p: Item): VoiceRow {
  return {
    id: String(p['id']), listener_id: String(p['listenerId']), blob_url: (p['blobUrl'] as string | undefined) ?? null, duration_ms: p['durationMs'] === undefined ? null : Number(p['durationMs']),
    created_at: String(p['createdAt']), expires_at: String(p['expiresAt']), transcript: (p['transcript'] as string | undefined) ?? null, body: (p['body'] as string | undefined) ?? null,
  };
}
const postRow = (p: Item, a: Person) => ({ ...voiceRow(p), display_name: a.displayName, avatar_url: a.avatarUrl ?? null });

/** The author's statuses (index → items), strongly; `liveOnly` drops the expired ones (every read does). */
async function postsOf(store: Store, listenerId: string, liveOnly: boolean): Promise<Item[]> {
  const ptrs = await prefixItems(store, K.L(listenerId), K.SC_SK.statuses);
  if (ptrs.length === 0) return [];
  const posts = await batchGetAll(store, 'main', ptrs.map((p) => K.voicePost(String(p['id']))));
  const now = nowMs(store);
  return liveOnly ? posts.filter((p) => isLive(p, now)) : posts;
}

export async function liveCount(store: Store, _db: Db, listenerId: string): Promise<number> {
  return (await postsOf(store, listenerId, true)).length;
}

async function writePost(store: Store, db: Db, p: { id: string; listenerId: string; blobUrl?: string; blobPath?: string; durationMs?: number; bytes?: number; transcript?: string; body?: string }): Promise<VoiceRow> {
  const createdAt = nowIso(store);
  const expiresAt = new Date(nowMs(store) + STATUS_LIFE_MS).toISOString();
  const ttl = ttlAfter(Date.parse(expiresAt), DAY_MS);
  const item = encode('voicePost', K.voicePost(p.id), {
    id: p.id, listenerId: p.listenerId, blobUrl: p.blobUrl, blobPath: p.blobPath, durationMs: p.durationMs, bytes: p.bytes, transcript: p.transcript, body: p.body,
    createdAt, expiresAt, reactionCount: 0, replyCount: 0,
  }, { gsi: K.G4('statuses', expiresAt, p.id), ttl });
  await tx(store)
    .put('main', item, { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('voicePostPtr', K.voicePostPtr(p.listenerId, createdAt, p.id), { id: p.id, createdAt, expiresAt }, { ttl }))
    .commit();
  const raw = rawPg(db);
  if (raw) await B.insertVoicePost(raw, { id: p.id, listenerId: p.listenerId, blobUrl: p.blobUrl ?? null, blobPath: p.blobPath ?? null, durationMs: p.durationMs ?? null, bytes: p.bytes ?? null, transcript: p.transcript ?? null, body: p.body ?? null, createdAt, expiresAt });
  return voiceRow(item);
}

export async function insertPost(store: Store, db: Db, p: { id: string; listenerId: string; url: string; path: string; durationMs: number; bytes: number; transcript?: string }): Promise<VoiceRow> {
  return writePost(store, db, { id: p.id, listenerId: p.listenerId, blobUrl: p.url, blobPath: p.path, durationMs: p.durationMs, bytes: p.bytes, ...(p.transcript ? { transcript: p.transcript } : {}) });
}

export async function insertTextPost(store: Store, db: Db, p: { id: string; listenerId: string; body: string }): Promise<VoiceRow> {
  return writePost(store, db, { id: p.id, listenerId: p.listenerId, body: p.body });
}

/** The caller's own posts and those of people they follow; never expired, never across a block, never a suspended or hidden author. */
export async function fromFollowing(store: Store, db: Db, viewerId: string): Promise<PublicPost[]> {
  const [followed, blocked, muted] = await Promise.all([followedIds(db, viewerId), blockedEitherWay(db, viewerId), mutedIdsFor(db, viewerId)]);
  const authors = [viewerId, ...[...followed].filter((id) => id !== viewerId && !blocked.has(id) && !muted.has(id))];
  const ppl = await people(store, authors);
  const rows: { p: Item; a: Person }[] = [];
  for (const id of authors) {
    const a = ppl.get(id);
    if (!visiblePerson(a)) continue;
    for (const p of await postsOf(store, id, true)) rows.push({ p, a });
  }
  rows.sort((x, y) => String(y.p['createdAt']).localeCompare(String(x.p['createdAt'])));
  return rows.slice(0, 100).map((r) => toPublicPost(postRow(r.p, r.a), viewerId));
}

/** Every live status (G4 `Q#statuses`, expiry after now) — suggestions only; eventually consistent is fine there. */
async function liveStatuses(store: Store): Promise<Item[]> {
  return (await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK > :now', ExpressionAttributeValues: { ':q': 'Q#statuses', ':now': nowIso(store) },
  })).items;
}

/**
 * Suggested statuses: live posts by accounts the viewer does not follow — never their own, never a blocked (either
 * way), muted, suspended or hidden account, nor anyone the viewer asked to stop suggesting. One per author (the
 * newest), newest first.
 */
export async function suggestedFor(store: Store, db: Db, viewerId: string, limit = SUGGESTED_MAX): Promise<PublicPost[]> {
  const [followed, blocked, muted, stopped] = await Promise.all([
    followedIds(db, viewerId), blockedEitherWay(db, viewerId), mutedIdsFor(db, viewerId),
    prefixItems(store, K.L(viewerId), K.SC_SK.suggestionMutes).then((xs) => new Set(xs.map((x) => String(x['mutedId'])))),
  ]);
  const newest = new Map<string, Item>();
  const now = nowMs(store);
  for (const p of await liveStatuses(store)) {
    const a = String(p['listenerId']);
    if (!isLive(p, now) || a === viewerId || followed.has(a) || blocked.has(a) || muted.has(a) || stopped.has(a)) continue;
    const cur = newest.get(a);
    if (!cur || String(p['createdAt']) > String(cur['createdAt'])) newest.set(a, p);
  }
  const ppl = await people(store, newest.keys());
  return [...newest.values()]
    .filter((p) => visiblePerson(ppl.get(String(p['listenerId']))))
    .sort((x, y) => String(y['createdAt']).localeCompare(String(x['createdAt'])))
    .slice(0, limit)
    .map((p) => toPublicPost(postRow(p, ppl.get(String(p['listenerId']))!), viewerId));
}

/** One live status the viewer may see: their own, a followed account's, or any public one (as a suggestion would show it). */
export async function visiblePost(store: Store, db: Db, id: string, viewerId: string): Promise<PublicPost | undefined> {
  if (!UUID.test(id)) return undefined;
  const p = await get(store, 'main', K.voicePost(id));
  if (!isLive(p, nowMs(store))) return undefined;
  const author = String(p['listenerId']);
  const a = await person(store, author);
  if (!a || a.suspendedAt || (a.hiddenAt && author !== viewerId)) return undefined;
  if ((await blockedEitherWay(db, viewerId)).has(author)) return undefined;
  return toPublicPost(postRow(p, a), viewerId);
}

export async function getPost(store: Store, _db: Db, id: string): Promise<VoiceRow | undefined> {
  if (!UUID.test(id)) return undefined;
  const p = await get(store, 'main', K.voicePost(id));
  return p ? voiceRow(p) : undefined;
}

/** The status's whole partition and every pointer to it (the author's index, the writers' reply and reaction pointers). */
export async function dropPartition(store: Store, postId: string): Promise<void> {
  const items = await partitionAll(store, `VP#${postId}`);
  const writes: WriteRequest[] = [];
  for (const i of items) {
    writes.push({ delete: keyOf(i) });
    const sk = String(i['SK']);
    if (sk === 'POST') writes.push({ delete: K.voicePostPtr(String(i['listenerId']), String(i['createdAt']), postId) });
    else if (sk.startsWith('REPLY#')) writes.push({ delete: K.statusReplyPtr(String(i['authorId']), postId, String(i['id'])) });
    else if (sk.startsWith('REACT#')) writes.push({ delete: K.statusReactionPtr(String(i['listenerId']), postId) });
  }
  // The POST item goes last: until then a crashed delete is found again by the sweep's queue.
  const post = writes.findIndex((w) => 'delete' in w && w.delete.SK === 'POST');
  if (post >= 0) writes.push(...writes.splice(post, 1));
  await batchWriteAll(store, 'main', writes);
}

/**
 * Blob first, then the rows: a failed blob delete keeps the status, so the next sweep tries again. A text status has no
 * blob. Its voice replies' files and its photos go before it (G-M22-2); any failure keeps the status.
 */
export async function removePost(store: Store, db: Db, storage: VoiceStorage, row: { id: string; blob_url: string | null }, images?: ImageStorage): Promise<void> {
  await removeAttachments(store, db, storage, images, row.id);
  if (row.blob_url) await storage.remove(row.blob_url);
  await dropPartition(store, row.id);
  const raw = rawPg(db);
  if (raw) await B.deleteVoicePost(raw, row.id);
}

/** A status's voice-reply files (voice store) and photos (image store), each file before its item. */
export async function removeAttachments(store: Store, db: Db, storage: VoiceStorage, images: ImageStorage | undefined, postId: string): Promise<void> {
  for (const r of await replyAudioOf(db, [postId])) {
    if (!storage.ready) throw new Error('voice store not connected');
    await storage.remove(r.audio_url);
    const [item] = await prefixItems(store, `VP#${postId}`, 'REPLY#', { keep: (i) => i['id'] === r.id, max: 1 });
    if (item) {
      await batchWriteAll(store, 'main', [{ delete: keyOf(item) }, { delete: K.statusReplyPtr(String(item['authorId']), postId, r.id) }]);
    }
    const raw = rawPg(db);
    if (raw) await B.deleteStatusReply(raw, r.id);
  }
  for (const key of await photosOf(db, [postId])) await removePhoto(db, images, key);
}

/** Does this status carry files other than its own recording (voice replies, photos)? */
async function carriesFiles(store: Store, postId: string): Promise<boolean> {
  const items = await partitionAll(store, `VP#${postId}`);
  return items.some((i) => (String(i['SK']).startsWith('REPLY#') && i['audioUrl']) || (String(i['SK']).startsWith('ITEM#') && i['kind'] === 'photo'));
}

/**
 * G-V1 / G-M22-2 / G-M26-SC2: every status past `expiresAt` loses its files and its items. Carriers (voice replies,
 * photos) first — one whose files could not all be deleted stays for the next cycle; then photos uploaded but never
 * posted (2 h); then expired text statuses (no file of their own, gone whether or not the store is connected); then,
 * with the voice store connected, expired voice statuses (recording first).
 */
export async function sweepExpired(store: Store, db: Db, storage: VoiceStorage, limit = 200, images?: ImageStorage): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  const { items: expired } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK < :now', ExpressionAttributeValues: { ':q': 'Q#statuses', ':now': nowIso(store) },
  }, { max: limit * 3 });
  // The queue key may lag the item (GSI); the item's own expiry decides.
  const now = nowMs(store);
  const posts = (await batchGetAll(store, 'main', expired.map((e) => K.voicePost(String(e['id']))))).filter((p) => !isLive(p, now));
  posts.sort((a, b) => String(a['expiresAt']).localeCompare(String(b['expiresAt'])));
  const kept = new Set<string>();
  const carriers: Item[] = [];
  for (const p of posts) if (await carriesFiles(store, String(p['id']))) carriers.push(p);
  for (const p of carriers.slice(0, limit)) {
    kept.add(String(p['id']));
    try { await removePost(store, db, storage, { id: String(p['id']), blob_url: (p['blobUrl'] as string | undefined) ?? null }, images); deleted++; } catch { failed++; }
  }
  failed += (await sweepOrphanPhotos(db, images)).failed;
  for (const p of posts) {
    if (kept.has(String(p['id'])) || !p['body']) continue;
    await dropPartition(store, String(p['id']));
    const raw = rawPg(db);
    if (raw) await B.deleteVoicePost(raw, String(p['id']));
    deleted++;
  }
  if (!storage.ready) return { deleted, failed };
  for (const p of posts.filter((x) => !kept.has(String(x['id'])) && !x['body']).slice(0, limit)) {
    try { await removePost(store, db, storage, { id: String(p['id']), blob_url: (p['blobUrl'] as string | undefined) ?? null }, images); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}

/** Account deletion: the listener's files go before their statuses, and their voice replies on other people's statuses. */
export async function removeAllFor(store: Store, db: Db, storage: VoiceStorage, listenerId: string, images?: ImageStorage): Promise<void> {
  if (!storage.ready) return;
  for (const p of await postsOf(store, listenerId, false)) {
    if (!p['body'] || (await carriesFiles(store, String(p['id'])))) {
      await removePost(store, db, storage, { id: String(p['id']), blob_url: (p['blobUrl'] as string | undefined) ?? null }, images);
    }
  }
  for (const ptr of await prefixItems(store, K.L(listenerId), K.SC_SK.statusReplies)) {
    const postId = String(ptr['postId']);
    const [r] = await prefixItems(store, `VP#${postId}`, 'REPLY#', { keep: (i) => i['id'] === ptr['id'], max: 1 });
    if (!r?.['audioUrl']) continue;
    await storage.remove(String(r['audioUrl']));
    await batchWriteAll(store, 'main', [{ delete: keyOf(r) }, { delete: keyOf(ptr) }]);
    const raw = rawPg(db);
    if (raw) await B.deleteStatusReply(raw, String(r['id']));
  }
}

/** M24 US17: "stop suggesting this person's statuses" — and undo; the muted listener's side records it too (account deletion). */
export async function setSuggestionMute(store: Store, db: Db, viewerId: string, mutedId: string, on: boolean): Promise<void> {
  if (on) {
    await tx(store)
      .put('main', encode('suggestionMute', K.suggestionMute(viewerId, mutedId), { listenerId: viewerId, mutedId, createdAt: nowIso(store) }))
      .put('main', encode('suggestionMutedBy', K.suggestionMutedBy(mutedId, viewerId), { listenerId: mutedId, muterId: viewerId }))
      .commit();
  } else {
    await tx(store).delete('main', K.suggestionMute(viewerId, mutedId)).delete('main', K.suggestionMutedBy(mutedId, viewerId)).commit();
  }
  const raw = rawPg(db);
  if (raw) await B.setSuggestionMute(raw, viewerId, mutedId, on);
}
