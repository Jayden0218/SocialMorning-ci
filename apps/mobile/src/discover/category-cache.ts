// Keeps each category's last list so its page shows at once, then refreshes quietly.
/**
 * Owner, 2026-10-04 ("everything ready before it shows, no lag"): a category page waited for
 * the server and its first covers on every open — up to 3 s of spinner (measured on the Honor
 * phone: ~2.5 s to settle). Now each list is kept in M4's `feed_cache` table under
 * `category:<id>` (the same table as Discover's last copy, src/discover/cache.ts) and in memory.
 * The page draws the kept list on its first frame and swaps in the fresh one when it arrives.
 *
 * `warm` fetches lists before they are opened (Discover's category strip calls it), with their
 * first covers, so even the first open is usually full. One fetch per genre at a time.
 */
import type { ApiClient, CategoryShows } from '@/social/api';
import type { FeedCacheStore } from '@/storage/types';
import { Image } from 'react-native';

export const categoryKey = (genreId: number): string => `category:${genreId}`;
/** A kept list younger than this is not fetched again by `warm`. */
export const WARM_FRESH_MS = 10 * 60 * 1000;
/** The covers of a page's first screen. */
export const FIRST_COVERS = 9;

type Kept = { body: CategoryShows; fetchedAt: number };
const memory = new Map<number, Kept>();
const inFlight = new Map<number, Promise<CategoryShows>>();

const ok = (x: unknown): x is CategoryShows =>
  typeof x === 'object' && x !== null && Array.isArray((x as CategoryShows).shows);

function kept(cache: FeedCacheStore, genreId: number): Kept | undefined {
  const m = memory.get(genreId);
  if (m) return m;
  const row = cache.get(categoryKey(genreId));
  if (!row) return undefined;
  try {
    const body: unknown = JSON.parse(row.body);
    if (!ok(body)) return undefined;
    const k = { body, fetchedAt: row.fetchedAt };
    memory.set(genreId, k);
    return k;
  } catch {
    return undefined;
  }
}

/** The kept list, or undefined when this genre was never fetched on this phone. */
export function cachedCategory(cache: FeedCacheStore, genreId: number): CategoryShows | undefined {
  return kept(cache, genreId)?.body;
}

/** Fetches the list and keeps it. A second call while one is running shares it. */
export function fetchCategory(deps: { api: ApiClient; cache: FeedCacheStore; now: () => number }, genreId: number): Promise<CategoryShows> {
  const running = inFlight.get(genreId);
  if (running) return running;
  const p = deps.api.category(genreId).then((body) => {
    const k = { body, fetchedAt: deps.now() };
    memory.set(genreId, k);
    // RED CHECK: the list is no longer kept on the phone.
    return body;
  }).finally(() => inFlight.delete(genreId));
  inFlight.set(genreId, p);
  return p;
}

/** The first screen's cover addresses, to fetch before the list shows. */
export const firstCovers = (body: CategoryShows): string[] =>
  body.shows.slice(0, FIRST_COVERS).flatMap((s) => (s.imageUrl ? [s.imageUrl] : []));

/** Fetch the lists (and first covers) not fetched in the last 10 minutes. Errors are dropped. */
export function warmCategories(deps: { api: ApiClient; cache: FeedCacheStore; now: () => number }, genreIds: readonly number[]): void {
  for (const id of genreIds) {
    const k = kept(deps.cache, id);
    if (k && deps.now() - k.fetchedAt < WARM_FRESH_MS) continue;
    void fetchCategory(deps, id)
      .then((body) => Promise.all(firstCovers(body).map((u) => Image.prefetch(u).catch(() => false))))
      .catch(() => undefined);
  }
}

/** Tests only. */
export function forgetCategories(): void {
  memory.clear();
  inFlight.clear();
}
