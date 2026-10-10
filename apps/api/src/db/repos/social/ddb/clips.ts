// Clips on DynamoDB: a range on an episode, one per (author, clientId), listed newest first in the episode partition.
/**
 * M26 lane SC (SC-T05; M4 FR-001…006, guard G8). Items, all in one transaction:
 * - `EP#<episodeId> / CLIP#<createdAt>#<id>` the clip (the episode's list is one Query, newest first, keyset by time);
 * - `U#CLIP#<authorId>#<clientId>` → the clip id: the old UNIQUE (author_id, client_id) — a phone's retry finds it;
 * - `CLIPREF#<id> / R` → where it lives (the link page, delete); `L#<author> / CLP#<createdAt>#<id>` the author's
 *   index (the per-minute floor, the month report, account deletion).
 * The `clipped` feed item is lane SG's (activity, on Postgres).
 */
import { randomUUID } from 'node:crypto';
import type { Db } from '../../../db.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { claimUnique, uniqueOwner } from '../../../ddb/unique.ts';
import { blockedIdsFor } from '../../safety/blocks.ts';
import { getEpisode, type EpisodeRow } from '../../library/episodes.ts';
import type { ClipRow } from '../clips.ts';
import * as B from './sc-bridge.ts';
import { commitRetry, keyOf, nowIso, person, people, rawPg, str, UUID } from './sc-common.ts';
import { reportedClipIds } from './sc-foreign.ts';
import { recordActivity, removeActivityByRef } from '../graph-ddb/activity.ts';

export function clipRow(it: Item, authorName: string | null): ClipRow {
  return {
    id: String(it['id']), author_id: String(it['authorId']), author_name: authorName, client_id: String(it['clientId']), episode_id: String(it['episodeId']),
    start_ms: Number(it['startMs']), end_ms: Number(it['endMs']), caption: String(it['caption'] ?? ''), created_at: String(it['createdAt']),
    deleted_at: str(it['deletedAt']), removed_at: str(it['removedAt']),
  };
}

export async function clipItemById(store: Store, id: string): Promise<Item | undefined> {
  if (!UUID.test(id)) return undefined;
  const ref = await get(store, 'main', K.clipRef(id));
  return ref ? get(store, 'main', { PK: K.EP(String(ref['episodeId'])), SK: String(ref['sk']) }) : undefined;
}

async function rowOf(store: Store, it: Item): Promise<ClipRow> {
  return clipRow(it, (await person(store, String(it['authorId'])))?.displayName ?? null);
}

export async function createClip(
  store: Store, db: Db,
  input: { authorId: string; clientId: string; episodeId: string; startMs: number; endMs: number; caption: string },
): Promise<{ clip: ClipRow; created: boolean }> {
  const existing = async (): Promise<ClipRow | undefined> => {
    const id = await uniqueOwner<string>(store, K.U.clip(input.authorId, input.clientId));
    const it = id ? await clipItemById(store, id) : undefined;
    return it ? rowOf(store, it) : undefined;
  };
  const before = await existing();
  if (before) return { clip: before, created: false };
  const id = randomUUID();
  const createdAt = nowIso(store);
  const key = K.clip(input.episodeId, createdAt, id);
  const item = encode('clip', key, { id, authorId: input.authorId, clientId: input.clientId, episodeId: input.episodeId, startMs: input.startMs, endMs: input.endMs, caption: input.caption, createdAt });
  try {
    await commitRetry(store, (t) => {
      t.put('main', item, { condition: 'attribute_not_exists(PK)', label: 'clip' });
      claimUnique(t, K.U.clip(input.authorId, input.clientId), id);
      t.put('main', encode('clipRef', K.clipRef(id), { id, episodeId: input.episodeId, sk: key.SK }));
      t.put('main', encode('authorClip', K.authorClip(input.authorId, createdAt, id), { id, episodeId: input.episodeId, sk: key.SK, createdAt }));
    });
  } catch (e) {
    // Lost a race with the same phone's retry: the other write won.
    if (e instanceof TxCancelled && e.failed('unique:CLIP')) {
      const again = await existing();
      if (again) return { clip: again, created: false };
    }
    throw e;
  }
  const raw = rawPg(db);
  if (raw) await B.insertClip(raw, { ...input, id, createdAt });
  await recordActivity(store, db, { actorId: input.authorId, kind: 'clipped', episodeId: input.episodeId, momentMs: input.startMs, refId: id });
  return { clip: await rowOf(store, item), created: true };
}

/** The clip and its episode record — deleted clips included (FR-005: the link still offers the episode). */
export async function getClip(store: Store, db: Db, id: string): Promise<{ clip: ClipRow; episode: EpisodeRow } | undefined> {
  const it = await clipItemById(store, id);
  if (!it) return undefined;
  const episode = await getEpisode(db, String(it['episodeId']));
  if (!episode) return undefined;
  return { clip: await rowOf(store, it), episode };
}

/**
 * Live clips newest first, `limit` a page, `before` an ISO time (keyset on the sort key). A blocked author's clip is
 * not listed at all; a clip the VIEWER reported stays as a placeholder (FR-002).
 */
export async function listClipsForEpisode(store: Store, db: Db, episodeId: string, before?: string, limit = 20, viewerId?: string): Promise<{ clips: ClipRow[]; next?: string }> {
  const [blocked, reported] = viewerId === undefined ? [new Set<string>(), new Set<string>()] : await Promise.all([blockedIdsFor(db, viewerId), reportedClipIds(db, viewerId)]);
  const upper = before ? `CLIP#${new Date(before).toISOString()}` : 'CLIP#~';
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.EP(episodeId), ':lo': 'CLIP#', ':hi': upper },
    ConsistentRead: true, ScanIndexForward: false,
  }, {
    max: limit + 1,
    keep: (i) => !i['deletedAt'] && !i['removedAt'] && (!blocked.has(String(i['authorId'])) || reported.has(String(i['id']))),
  });
  const names = await people(store, items.map((i) => String(i['authorId'])));
  const rows = items.map((i) => clipRow(i, names.get(String(i['authorId']))?.displayName ?? null));
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? new Date(page[page.length - 1]!.created_at).toISOString() : undefined;
  const marked = page.map((c) => (reported.has(c.id) ? { ...c, author_id: '', author_name: null, caption: '', reported: true } : c));
  return { clips: marked, ...(next ? { next } : {}) };
}

/** Soft delete by the author. Returns 'gone' when there is no such live clip, 'forbidden' for someone else's. */
export async function deleteClip(store: Store, db: Db, id: string, authorId: string): Promise<'deleted' | 'gone' | 'forbidden'> {
  const it = await clipItemById(store, id);
  if (!it || it['deletedAt']) return 'gone';
  if (it['authorId'] !== authorId) return 'forbidden';
  const at = nowIso(store);
  try {
    await tx(store)
      .update('main', keyOf(it), { update: 'SET #d = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#d)', names: { '#d': 'deletedAt' }, values: { ':at': at }, label: 'clip' })
      .update('main', K.authorClip(authorId, String(it['createdAt']), id), { update: 'SET #d = :at', condition: 'attribute_exists(PK)', names: { '#d': 'deletedAt' }, values: { ':at': at } })
      .commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('clip')) return 'gone';
    throw e;
  }
  await removeActivityByRef(store, db, 'clipped', id);
  const raw = rawPg(db);
  if (raw) await B.setClipDeleted(raw, id, at);
  return 'deleted';
}

/**
 * Test support (sc-neutral.ts): moves a clip to another creation time — its sort key carries the time, so the item,
 * its pointer and the author's index entry are written again under the new key.
 */
export async function moveClipTime(store: Store, id: string, createdAt: string): Promise<void> {
  const it = await clipItemById(store, id);
  if (!it) throw new Error(`no clip ${id}`);
  const at = new Date(createdAt).toISOString();
  const key = K.clip(String(it['episodeId']), at, id);
  const { PK: _pk, SK: _sk, t: _t, ...attrs } = it;
  await tx(store)
    .delete('main', keyOf(it))
    .put('main', encode('clip', key, { ...attrs, createdAt: at }))
    .put('main', encode('clipRef', K.clipRef(id), { id, episodeId: String(it['episodeId']), sk: key.SK }))
    .delete('main', K.authorClip(String(it['authorId']), String(it['createdAt']), id))
    .put('main', encode('authorClip', K.authorClip(String(it['authorId']), at, id), { id, episodeId: String(it['episodeId']), sk: key.SK, createdAt: at, deletedAt: it['deletedAt'] ?? null }))
    .commit();
}
