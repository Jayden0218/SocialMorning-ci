// Status items on DynamoDB: up to 10 episode cards and photos under the status, photo uploads recorded with their owner and size.
/**
 * M26 lane SC (SC-T06; M22 US6, guard G-M22-12). Items are `VP#<postId> / ITEM#<pos>` (they die with the status;
 * `expiresAt` copied from it). An uploaded photo is `VPUP#<sha(pathname)> / U` — it used to be a `status-photo:` row
 * in the cache table — holding its owner, url and size, and the post it went on once attached. While unattached it
 * carries the sparse G4 key `Q#status-photos` (sorted by upload time) so the hourly sweep finds the orphans (> 2 h)
 * without a Scan. The image store's ceiling counter `CFG#bytes.statusPhotoBytes` moves with the record (§7 B).
 */
import type { Db } from '../../../db.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import type { ImageStorage } from '../../../../storage/image-store.ts';
import { ItemsError, ORPHAN_PHOTO_MS, STATUS_ITEMS_MAX, type StatusItem, type StatusItemIn } from '../status-items.ts';
import * as B from './sc-bridge.ts';
import { commitRetry, keyOf, nowIso, nowMs, prefixItems, rawPg } from './sc-common.ts';

const PHOTO_BYTES = 'statusPhotoBytes';
const DAY_MS = 86_400_000;

function photoBytesStep(t: import('../../../ddb/tx.ts').Tx, delta: number): void {
  if (delta === 0) return;
  t.update('main', K.config('bytes'), { update: 'SET #t = if_not_exists(#t, :type) ADD #b :d', names: { '#t': 't', '#b': PHOTO_BYTES }, values: { ':type': 'config', ':d': delta } });
}

export async function statusPhotoBytes(store: Store, _db: Db): Promise<number> {
  return Number((await get(store, 'main', K.config('bytes')))?.[PHOTO_BYTES] ?? 0);
}

export async function recordUpload(store: Store, _db: Db, p: { pathname: string; url: string; bytes: number; listenerId: string }): Promise<void> {
  const at = nowIso(store);
  await commitRetry(store, async (t) => {
    const before = await get(store, 'main', K.statusPhoto(p.pathname));
    t.put('main', encode('statusPhoto', K.statusPhoto(p.pathname), { pathname: p.pathname, url: p.url, bytes: p.bytes, listenerId: p.listenerId, uploadedAt: at }, {
      gsi: K.G4('status-photos', at, K.sha(p.pathname)),
    }));
    photoBytesStep(t, p.bytes - Number(before?.['bytes'] ?? 0));
  });
}

/**
 * Checks every item and writes them for a new status, in order, in ONE transaction (≤ 10 items + ≤ 10 photo records):
 * an episode must be known (lane LB's item); a photo must be this listener's own upload, not yet on another status.
 */
export async function insertItems(store: Store, db: Db, postId: string, listenerId: string, items: readonly StatusItemIn[]): Promise<void> {
  if (items.length > STATUS_ITEMS_MAX) throw new ItemsError('too_many_items', `Up to ${STATUS_ITEMS_MAX} items.`);
  if (items.length === 0) return;
  const post = await get(store, 'main', K.voicePost(postId));
  const expiresAt = String(post?.['expiresAt'] ?? nowIso(store));
  const ttl = ttlAfter(Date.parse(expiresAt), DAY_MS);
  const rows: { pos: number; kind: 'episode' | 'photo'; episodeId: string | null; imageKey: string | null; imageUrl: string | null }[] = [];
  const photos = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.kind === 'episode') {
      if (!(await get(store, 'main', K.episode(it.episodeId)))) throw new ItemsError('bad_item', 'No such episode.');
      rows.push({ pos: i + 1, kind: 'episode', episodeId: it.episodeId, imageKey: null, imageUrl: null });
    } else {
      const up = await get(store, 'main', K.statusPhoto(it.imageKey));
      if (!up || up['listenerId'] !== listenerId || up['postId'] || !up['url'] || photos.has(it.imageKey)) throw new ItemsError('bad_item', 'Upload the photo first.');
      photos.add(it.imageKey);
      rows.push({ pos: i + 1, kind: 'photo', episodeId: null, imageKey: it.imageKey, imageUrl: String(up['url']) });
    }
  }
  try {
    const t = tx(store);
    for (const r of rows) {
      t.put('main', encode('statusItem', K.statusItem(postId, r.pos), {
        postId, pos: r.pos, kind: r.kind, episodeId: r.episodeId ?? undefined, imageKey: r.imageKey ?? undefined, imageUrl: r.imageUrl ?? undefined, expiresAt,
      }, { ttl }));
      if (r.imageKey) {
        t.update('main', K.statusPhoto(r.imageKey), {
          update: 'SET #post = :post REMOVE G4PK, G4SK', condition: 'attribute_exists(PK) AND #l = :me AND attribute_not_exists(#post)',
          names: { '#post': 'postId', '#l': 'listenerId' }, values: { ':post': postId, ':me': listenerId }, label: 'photo',
        });
      }
    }
    await t.commit();
  } catch (e) {
    if (e instanceof TxCancelled && e.failed('photo')) throw new ItemsError('bad_item', 'Upload the photo first.');
    throw e;
  }
  const raw = rawPg(db);
  if (raw) for (const r of rows) await B.insertStatusItem(raw, { postId, ...r });
}

/** Items per post, in order; an episode card carries what the phone needs to show and play it. */
export async function itemsFor(store: Store, _db: Db, postIds: readonly string[]): Promise<Map<string, StatusItem[]>> {
  const out = new Map<string, StatusItem[]>();
  const all: Item[] = [];
  for (const id of postIds) all.push(...await prefixItems(store, `VP#${id}`, 'ITEM#'));
  const eps = new Map((await batchGetAll(store, 'main', [...new Set(all.filter((i) => i['episodeId']).map((i) => String(i['episodeId'])))].map((id) => K.episode(id))))
    .map((e) => [String(e['id']), e]));
  for (const r of all) {
    const postId = String(r['postId']);
    const list = out.get(postId) ?? [];
    if (r['kind'] === 'photo' && r['imageUrl']) list.push({ kind: 'photo', url: String(r['imageUrl']) });
    else if (r['kind'] === 'episode' && r['episodeId']) {
      const e = eps.get(String(r['episodeId']));
      list.push({
        kind: 'episode', episodeId: String(r['episodeId']),
        ...(e?.['title'] ? { title: String(e['title']) } : {}), ...(e?.['showTitle'] ? { showTitle: String(e['showTitle']) } : {}), ...(e?.['imageUrl'] ? { imageUrl: String(e['imageUrl']) } : {}),
        ...(e?.['feedUrl'] ? { feedUrl: String(e['feedUrl']) } : {}), ...(e?.['enclosureUrl'] ? { enclosureUrl: String(e['enclosureUrl']) } : {}),
        ...(e?.['durationMs'] !== undefined && e?.['durationMs'] !== null ? { durationMs: Number(e['durationMs']) } : {}),
      });
    }
    out.set(postId, list);
  }
  return out;
}

/** The photo files on these posts (image store pathnames). */
export async function photosOf(store: Store, _db: Db, postIds: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of postIds) {
    for (const r of await prefixItems(store, `VP#${id}`, 'ITEM#')) if (r['kind'] === 'photo' && r['imageKey']) out.push(String(r['imageKey']));
  }
  return out;
}

/** One photo leaves the store, then its items and its upload record. Throws when the store is not connected or the delete fails. */
export async function removePhoto(store: Store, db: Db, images: ImageStorage | undefined, pathname: string): Promise<void> {
  if (!images?.ready) throw new Error('image store not connected');
  await images.remove(pathname);
  const up = await get(store, 'main', K.statusPhoto(pathname));
  const t = tx(store);
  if (up?.['postId']) {
    for (const r of await prefixItems(store, `VP#${String(up['postId'])}`, 'ITEM#', { keep: (i) => i['kind'] === 'photo' && i['imageKey'] === pathname })) t.delete('main', keyOf(r));
  }
  if (up) {
    t.delete('main', K.statusPhoto(pathname), { condition: 'attribute_exists(PK)', label: 'photo' });
    photoBytesStep(t, -Number(up['bytes'] ?? 0));
  }
  try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled && e.failed('photo'))) throw e; }
  const raw = rawPg(db);
  if (raw) await B.deleteStatusPhotoItems(raw, pathname);
}

/** Photos uploaded more than 2 hours ago and never posted (the `Q#status-photos` queue, oldest first). */
export async function sweepOrphanPhotos(store: Store, db: Db, images: ImageStorage | undefined, limit = 100): Promise<{ deleted: number; failed: number }> {
  if (!images?.ready) return { deleted: 0, failed: 0 };
  const before = new Date(nowMs(store) - ORPHAN_PHOTO_MS).toISOString();
  const { items } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q AND G4SK < :b', ExpressionAttributeValues: { ':q': 'Q#status-photos', ':b': before },
  }, { max: limit });
  let deleted = 0;
  let failed = 0;
  for (const r of items) {
    const up = await get(store, 'main', keyOf(r));
    if (!up || up['postId'] || Date.parse(String(up['uploadedAt'])) >= Date.parse(before)) continue;
    try { await removePhoto(store, db, images, String(up['pathname'])); deleted++; } catch { failed++; }
  }
  return { deleted, failed };
}
