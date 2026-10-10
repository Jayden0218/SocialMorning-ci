// Shared pieces of lane DV's DynamoDB code: the clock, episode rows from the catalogue items, show and listener walks.
/**
 * M26 lane DV. Every file in this folder exports `<name>(store, db, ...args)` bodies for `dual('dv/<file>', …)`
 * (src/db/backend.ts). `db` is the app's handle WITH the Store attached; `bridgeOf(db)` is the plain Postgres handle
 * while the write bridge is on, `pgOf(db)` the plain handle for tables of lanes not moved yet (lane ST's
 * `hosted_shows`, read in `foreign`-style helpers below and listed for CUT).
 *
 * Episodes are lane LB's `EP#<id>/META` items (read here, never written); a show's episodes are its G2
 * `SHEPS#<feedKey>` partition, newest first (`<publishedAt|~>#<id>` — `~` sorts after every date, so the dated
 * ones are read first with `G2SK < '~'` and the undated ones after, which is the SQL's `DESC NULLS LAST`).
 */
import type { Db } from '../../../db.ts';
import { bridgeOf, pgOf } from '../../../backend-ddb.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import type { Item, Key, Store } from '../../../ddb/store.ts';
import { uniqueOwner } from '../../../ddb/unique.ts';

export { bridgeOf, pgOf };
export const DAY_MS = 86_400_000;
export const nowMs = (store: Store): number => store.clock.now();
export const nowIso = (store: Store): string => new Date(store.clock.now()).toISOString();
export const iso = (ms: number): string => new Date(ms).toISOString();
export const keyOf = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });
export const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
export const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));
export const isUuid = (s: string): boolean => /^[0-9a-f-]{36}$/i.test(s);

/** An episode as the Postgres repos selected it (snake_case, times ISO strings). */
export type EpRow = {
  id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null;
  enclosure_url: string; published_at: string | null; genre_id: number | null; media_kind: string; first_seen_at: string; updated_at: string | null;
};

export function epRowOf(it: Item): EpRow {
  return {
    id: String(it['id']), feed_url: String(it['feedUrl']), guid: String(it['guid']), title: String(it['title'] ?? ''), show_title: str(it['showTitle']),
    image_url: str(it['imageUrl']), duration_ms: num(it['durationMs']), enclosure_url: String(it['enclosureUrl'] ?? ''), published_at: str(it['publishedAt']),
    genre_id: num(it['genreId']), media_kind: str(it['mediaKind']) ?? 'audio', first_seen_at: String(it['firstSeenAt'] ?? it['updatedAt'] ?? ''), updated_at: str(it['updatedAt']),
  };
}

/** Episode rows by id (BatchGet of the META items); ids with no episode are left out. */
export async function episodesByIds(store: Store, ids: readonly string[]): Promise<Map<string, EpRow>> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, EpRow>();
  if (uniq.length === 0) return out;
  for (const it of await batchGetAll(store, 'main', uniq.map((id) => K.episode(id)), { consistent: false })) out.set(String(it['id']), epRowOf(it));
  return out;
}

/** The (feed, guid) uniqueness item → the episode row. */
export async function episodeByGuid(store: Store, feedUrl: string, guid: string): Promise<EpRow | undefined> {
  const id = await uniqueOwner<string>(store, K.U.guid(feedUrl, guid));
  if (id === undefined) return undefined;
  return (await episodesByIds(store, [id])).get(id);
}

/** `ORDER BY published_at DESC NULLS LAST` with the SQL's tie-break (`first_seen_at DESC`), then `id`. */
export function newestFirst(a: EpRow, b: EpRow): number {
  if (a.published_at !== b.published_at) {
    if (a.published_at === null) return 1;
    if (b.published_at === null) return -1;
    return a.published_at < b.published_at ? 1 : -1;
  }
  return a.first_seen_at < b.first_seen_at ? 1 : a.first_seen_at > b.first_seen_at ? -1 : 0;
}

/** Ids of a show's episodes from its G2 partition: the dated ones newest first, then (when `undated`) the undated ones. */
async function showIds(store: Store, feedUrl: string, opts: { max?: number; undated?: boolean } = {}): Promise<string[]> {
  const pk = K.G2eps(feedUrl, null, 'x').G2PK;
  const dated = await queryAll(store, 'main', {
    IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :pk AND G2SK < :tilde', ExpressionAttributeValues: { ':pk': pk, ':tilde': K.NULL_LAST },
    ScanIndexForward: false, ProjectionExpression: 'PK',
  }, opts.max !== undefined ? { max: opts.max } : {});
  const ids = dated.items.map((i) => String(i['PK']).slice('EP#'.length));
  if (opts.undated === false || (opts.max !== undefined && ids.length >= opts.max)) return ids;
  const undated = await queryAll(store, 'main', {
    IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :pk AND begins_with(G2SK, :tilde)', ExpressionAttributeValues: { ':pk': pk, ':tilde': K.NULL_LAST },
    ProjectionExpression: 'PK',
  });
  return [...ids, ...undated.items.map((i) => String(i['PK']).slice('EP#'.length))];
}

/**
 * A show's episodes newest first (`published_at DESC NULLS LAST, first_seen_at DESC`), skipping `skip` ids, up to
 * `max`. Reads the G2 ids page by page and the META items for the ones it keeps.
 */
export async function showEpisodes(store: Store, feedUrl: string, opts: { max?: number; skip?: ReadonlySet<string>; keep?: (e: EpRow) => boolean } = {}): Promise<EpRow[]> {
  const want = opts.max ?? Number.POSITIVE_INFINITY;
  const skip = opts.skip ?? new Set<string>();
  // Dated first: read a few more than asked, as hidden ones are skipped.
  const ids = await showIds(store, feedUrl, Number.isFinite(want) && !opts.keep ? { max: want + skip.size } : {});
  const rows = await episodesByIds(store, ids.filter((id) => !skip.has(id)));
  const sorted = [...rows.values()].filter((e) => e.feed_url === feedUrl && (!opts.keep || opts.keep(e))).sort(newestFirst);
  return Number.isFinite(want) ? sorted.slice(0, want) : sorted;
}

/** Every listener item (lane AC's G4 `Q#listeners`), in creation order. */
export async function allListeners(store: Store): Promise<Item[]> {
  const { items } = await queryAll(store, 'main', { IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#listeners' } });
  return items.filter((i) => i['t'] === 'listener');
}

/** Listener items by id (strong BatchGet). */
export async function listenersByIds(store: Store, ids: readonly string[]): Promise<Map<string, Item>> {
  const uniq = [...new Set(ids)].filter(isUuid);
  const out = new Map<string, Item>();
  if (uniq.length === 0) return out;
  for (const it of await batchGetAll(store, 'main', uniq.map((id) => K.listener(id)))) out.set(String(it['id']), it);
  return out;
}

/** Runs `fn` over `xs` with at most `n` at once; results in input order. */
export async function mapLimit<T, R>(xs: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= xs.length) return;
      out[i] = await fn(xs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
  return out;
}

/** A listener partition's items under an SK prefix (or between two SKs), strongly read. */
export async function partitionItems(store: Store, pk: string, opts: { prefix?: string; from?: string; to?: string; filter?: { expr: string; names?: Record<string, string>; values?: Record<string, unknown> } } = {}): Promise<Item[]> {
  const values: Record<string, unknown> = { ':pk': pk, ...(opts.filter?.values ?? {}) };
  let cond = 'PK = :pk';
  if (opts.prefix !== undefined) { cond += ' AND begins_with(SK, :pre)'; values[':pre'] = opts.prefix; }
  else if (opts.from !== undefined && opts.to !== undefined) { cond += ' AND SK BETWEEN :from AND :to'; values[':from'] = opts.from; values[':to'] = opts.to; }
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: cond, ExpressionAttributeValues: values as never, ConsistentRead: true,
    ...(opts.filter ? { FilterExpression: opts.filter.expr, ...(opts.filter.names ? { ExpressionAttributeNames: opts.filter.names } : {}) } : {}),
  });
  return items;
}

export type Hybrid = { store: Store; db: Db };
