// Syncs favourites, saved moments and search history across a listener's devices.
/**
 * M10b US2 — favourites, favourite comments, saved moments and search history follow the
 * account (specs/010-m10b-the-rest/research.md R2).
 *
 * The merge is M8's subscription rule, per (kind, item_key): the row whose own stamp —
 * `deleted_at` if present, else `updated_at` — is later wins; **a tie keeps the tombstone**.
 * A delete could not sync (phone B would revive it), so a removal is a tombstone kept 30 days.
 *
 * Every read is of the listener's own partition (guard G-P1): nothing here is ever readable by
 * anyone but its owner — a moment's note and a search term are private.
 */
import { viaStore } from '../../backend.ts';

export const KINDS = ['fav_episode', 'fav_comment', 'moment', 'search'] as const;
export type Kind = (typeof KINDS)[number];
export const SEARCH_MAX = 12;
export const NOTE_MAX = 500;
export const TOMBSTONE_DAYS = 30;

export type LibraryRow = { kind: Kind; item_key: string; payload: Record<string, unknown>; updated_at: string; deleted_at: string | null };
export type LibraryIn = { kind: Kind; key: string; payload?: Record<string, unknown>; updatedAt: string; deletedAt?: string | null };
export type LibraryOut = { kind: Kind; key: string; payload: Record<string, unknown>; updatedAt: string; deletedAt?: string };

// A payload stored as a string still reads as an object.
export const toPublic = (r: LibraryRow): LibraryOut => ({
  kind: r.kind,
  key: r.item_key,
  payload: (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
  updatedAt: new Date(r.updated_at).toISOString(),
  ...(r.deleted_at ? { deletedAt: new Date(r.deleted_at).toISOString() } : {}),
});

/** A moment's note is capped; nothing else in a payload is trusted to be small. */
function clean(i: LibraryIn): Record<string, unknown> {
  const p = { ...i.payload };
  if (i.kind === 'moment' && typeof p['note'] === 'string') p['note'] = (p['note'] as string).slice(0, NOTE_MAX);
  return p;
}


export type MyComment = { id: string; body: string | null; deleted: boolean; removed: boolean; hiddenByHost?: true; offsetMs: number | null; createdAt: string; episode: { id: string; feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string; enclosureUrl: string } };

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const listAll = viaStore<typeof import('./ddb/library.ts').listAll>('lb/library', 'listAll');
export const merge = viaStore<typeof import('./ddb/library.ts').merge>('lb/library', 'merge');
/** The payload as stored (a moment's note capped) — shared with the DynamoDB body. */
export const cleanPayload = clean;
// M26 lane LE: on DynamoDB lane SC's author index and items (social/ddb/my-comments.ts).
export const myComments = viaStore<typeof import('../social/ddb/my-comments.ts').myComments>('sc/my-comments', 'myComments');
