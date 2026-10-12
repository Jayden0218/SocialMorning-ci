// Items on a status: up to 10 episode cards and photos; photos live in the image store until the status goes.
/**
 * M22 US6 (spec FR-020, FR-021; contracts/api.md "Statuses"; guard G-M22-12). A status carries at
 * most 10 items, in order: an episode card (`episodeId`) or a photo (`imageKey`, from
 * POST /v1/voice-posts/images). Photos follow the comment-image rules (JPEG/PNG by their bytes,
 * ≤ 1 000 000 bytes, the store's ceiling) and are kept in the same store, at
 * `statuses/<uid>/<uuid>.jpg`.
 *
 * An uploaded photo is recorded in the `cache` table under `status-photo:<path>` with its url,
 * size and owner — that row is the proof a photo key was uploaded by this listener, counts toward
 * the store's ceiling, and lets the sweep find a photo that was never posted (an orphan, deleted
 * after 2 hours). Attaching it to a status sets `postId` on the row; the sweep deletes the file
 * before the status (G-M22-2) and then the row.
 */
import { viaStore } from '../../backend.ts';

export const STATUS_ITEMS_MAX = 10;
export const STATUS_PHOTO_MAX_BYTES = 1_000_000;
/** A photo uploaded but never posted is deleted after this long. */
export const ORPHAN_PHOTO_MS = 2 * 3_600_000;

export type StatusItemIn = { kind: 'episode'; episodeId: string } | { kind: 'photo'; imageKey: string };
export type StatusItem =
  | { kind: 'episode'; episodeId: string; title?: string; showTitle?: string; imageUrl?: string; feedUrl?: string; enclosureUrl?: string; durationMs?: number }
  | { kind: 'photo'; url: string };

export class ItemsError extends Error {
  constructor(readonly code: 'too_many_items' | 'bad_item', message: string) { super(message); }
}

/** Reads `items` from a request: undefined → none; anything else must be a list of ≤ 10 valid items. */
export function parseItems(raw: unknown): StatusItemIn[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ItemsError('bad_item', 'items must be a list.');
  if (raw.length > STATUS_ITEMS_MAX) throw new ItemsError('too_many_items', `Up to ${STATUS_ITEMS_MAX} items.`);
  return raw.map((x): StatusItemIn => {
    const o = (x ?? {}) as { kind?: unknown; episodeId?: unknown; imageKey?: unknown };
    if (o.kind === 'episode' && typeof o.episodeId === 'string' && o.episodeId.length > 0 && o.episodeId.length <= 200) return { kind: 'episode', episodeId: o.episodeId };
    if (o.kind === 'photo' && typeof o.imageKey === 'string' && o.imageKey.length > 0 && o.imageKey.length <= 300) return { kind: 'photo', imageKey: o.imageKey };
    throw new ItemsError('bad_item', 'Each item is an episode or a photo.');
  });
}

/** The `x-items` header of a voice upload: URI-encoded JSON (the body is the recording). */
export function itemsFromHeader(header: string | undefined): StatusItemIn[] {
  if (header === undefined || header.trim() === '') return [];
  let raw: unknown;
  try { raw = JSON.parse(decodeURIComponent(header)); } catch { throw new ItemsError('bad_item', 'x-items must be URI-encoded JSON.'); }
  return parseItems(raw);
}

// Bodies in ddb/status-items.ts (src/db/backend.ts).
export const statusPhotoBytes = viaStore<typeof import('./ddb/status-items.ts').statusPhotoBytes>('sc/status-items', 'statusPhotoBytes');
export const recordUpload = viaStore<typeof import('./ddb/status-items.ts').recordUpload>('sc/status-items', 'recordUpload');
export const insertItems = viaStore<typeof import('./ddb/status-items.ts').insertItems>('sc/status-items', 'insertItems');
export const itemsFor = viaStore<typeof import('./ddb/status-items.ts').itemsFor>('sc/status-items', 'itemsFor');
export const photosOf = viaStore<typeof import('./ddb/status-items.ts').photosOf>('sc/status-items', 'photosOf');
export const removePhoto = viaStore<typeof import('./ddb/status-items.ts').removePhoto>('sc/status-items', 'removePhoto');
export const sweepOrphanPhotos = viaStore<typeof import('./ddb/status-items.ts').sweepOrphanPhotos>('sc/status-items', 'sweepOrphanPhotos');
