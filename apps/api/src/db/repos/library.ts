/**
 * M10b US2 — favourites, favourite comments, saved moments and search history follow the
 * account (specs/010-m10b-the-rest/research.md R2).
 *
 * The merge is M8's subscription rule, per (kind, item_key): the row whose own stamp —
 * `deleted_at` if present, else `updated_at` — is later wins; **a tie keeps the tombstone**.
 * A delete could not sync (phone B would revive it), so a removal is a tombstone kept 30 days.
 *
 * Every query carries `listener_id = $1` (guard G-P1): nothing here is ever readable by
 * anyone but its owner — a moment's note and a search term are private.
 */
import type { Db } from '../db.ts';

export const KINDS = ['fav_episode', 'fav_comment', 'moment', 'search'] as const;
export type Kind = (typeof KINDS)[number];
export const SEARCH_MAX = 12;
export const NOTE_MAX = 500;
export const TOMBSTONE_DAYS = 30;

export type LibraryRow = { kind: Kind; item_key: string; payload: Record<string, unknown>; updated_at: string; deleted_at: string | null };
export type LibraryIn = { kind: Kind; key: string; payload?: Record<string, unknown>; updatedAt: string; deletedAt?: string | null };
export type LibraryOut = { kind: Kind; key: string; payload: Record<string, unknown>; updatedAt: string; deletedAt?: string };

export const toPublic = (r: LibraryRow): LibraryOut => ({
  kind: r.kind,
  key: r.item_key,
  payload: r.payload,
  updatedAt: new Date(r.updated_at).toISOString(),
  ...(r.deleted_at ? { deletedAt: new Date(r.deleted_at).toISOString() } : {}),
});

const stampOf = (r: { updatedAt: string; deletedAt?: string | null }) => new Date(r.deletedAt ?? r.updatedAt).getTime();

/** A moment's note is capped; nothing else in a payload is trusted to be small. */
function clean(i: LibraryIn): Record<string, unknown> {
  const p = { ...(i.payload ?? {}) };
  if (i.kind === 'moment' && typeof p['note'] === 'string') p['note'] = (p['note'] as string).slice(0, NOTE_MAX);
  return p;
}

async function listAll(db: Pick<Db, 'query'>, listenerId: string): Promise<LibraryRow[]> {
  return db.query<LibraryRow>(
    `SELECT kind, item_key, payload, updated_at, deleted_at FROM library_items
     WHERE listener_id = $1 AND (deleted_at IS NULL OR deleted_at > now() - ($2 || ' days')::interval)
     ORDER BY updated_at DESC`,
    [listenerId, String(TOMBSTONE_DAYS)],
  );
}

export async function merge(db: Db, listenerId: string, items: readonly LibraryIn[]): Promise<LibraryRow[]> {
  if (items.length === 0) return listAll(db, listenerId);
  const incoming = new Map<string, LibraryIn>();
  for (const i of items) {
    const k = `${i.kind}\u0001${i.key}`;
    const prev = incoming.get(k);
    if (prev === undefined || stampOf(i) >= stampOf(prev)) incoming.set(k, i);
  }
  return db.transaction(async (tx) => {
    const existing = await tx.query<LibraryRow>(
      'SELECT kind, item_key, payload, updated_at, deleted_at FROM library_items WHERE listener_id = $1',
      [listenerId],
    );
    const have = new Map(existing.map((r) => [`${r.kind}\u0001${r.item_key}`, r]));
    for (const [k, next] of incoming) {
      const cur = have.get(k);
      if (cur !== undefined) {
        const curStamp = stampOf({ updatedAt: cur.updated_at, deletedAt: cur.deleted_at });
        const nextStamp = stampOf(next);
        const nextTomb = (next.deletedAt ?? null) !== null;
        const takeNext = nextStamp > curStamp || (nextStamp === curStamp && nextTomb && cur.deleted_at === null);
        if (!takeNext) continue;
      }
      await tx.query(
        `INSERT INTO library_items (listener_id, kind, item_key, payload, updated_at, deleted_at) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (listener_id, kind, item_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`,
        [listenerId, next.kind, next.key, JSON.stringify(clean(next)), next.updatedAt, next.deletedAt ?? null],
      );
    }
    // Search history keeps its newest SEARCH_MAX live terms; the rest become tombstones.
    await tx.query(
      `UPDATE library_items SET deleted_at = now() WHERE listener_id = $1 AND kind = 'search' AND deleted_at IS NULL
       AND item_key NOT IN (SELECT item_key FROM library_items WHERE listener_id = $1 AND kind = 'search' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT $2)`,
      [listenerId, SEARCH_MAX],
    );
    return listAll(tx, listenerId);
  });
}

export { listAll };

export type MyComment = { id: string; body: string | null; deleted: boolean; removed: boolean; hiddenByHost?: true; offsetMs: number | null; createdAt: string; episode: { id: string; feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string; enclosureUrl: string } };

/** The caller's own top-level comments, newest first, 50 a page. A deleted or removed one has no body. */
export async function myComments(db: Pick<Db, 'query'>, listenerId: string, before?: string): Promise<{ items: MyComment[]; next?: string }> {
  const rows = await db.query<{ id: string; body: string | null; deleted_at: string | null; removed_at: string | null; host_hidden_at: string | null; offset_ms: number | null; created_at: string; episode_id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; enclosure_url: string }>(
    `SELECT c.id, c.body, c.deleted_at, c.removed_at, c.host_hidden_at, c.offset_ms, c.created_at, e.id AS episode_id, e.feed_url, e.guid, e.title, e.show_title, e.image_url, e.enclosure_url
     FROM comments c JOIN episodes e ON e.id = c.episode_id
     WHERE c.author_id = $1 AND c.parent_id IS NULL AND ($2::timestamptz IS NULL OR c.created_at < $2::timestamptz)
     ORDER BY c.created_at DESC, c.id DESC LIMIT 51`,
    [listenerId, before ?? null],
  );
  const page = rows.slice(0, 50);
  const items = page.map((r) => {
    const gone = r.deleted_at !== null || r.removed_at !== null;
    return {
      id: r.id, body: gone ? null : r.body, deleted: r.deleted_at !== null, removed: r.removed_at !== null, ...(r.host_hidden_at !== null ? { hiddenByHost: true as const } : {}), offsetMs: r.offset_ms,
      createdAt: new Date(r.created_at).toISOString(),
      episode: { id: r.episode_id, feedUrl: r.feed_url, guid: r.guid, title: r.title, showTitle: r.show_title ?? '', enclosureUrl: r.enclosure_url, ...(r.image_url ? { imageUrl: r.image_url } : {}) },
    };
  });
  const last = page[page.length - 1];
  return { items, ...(rows.length > 50 && last ? { next: new Date(last.created_at).toISOString() } : {}) };
}
