// Clear cache: measures and deletes the phone's cache folder and saved pages, never downloads.
/**
 * M21 US10 (T109). "Clear cache" in Settings › Downloads and cache shows the size first, then
 * frees it. What counts as cache:
 *  - every entry in the app's cache folder (`Paths.cache` — images React Native fetched, share
 *    pictures, clip audio made for sharing), except `launch/` (the launch screen's own images,
 *    which `src/launch/` tracks by id) — entries named in `KEEP` are never measured or deleted;
 *  - the saved pages in the database: each episode's last comments (`socialCache`) and the
 *    Following / Discover / category pages (`feedCache`).
 * Downloads live in `Paths.document/downloads` (src/downloads/expo-downloader.ts), outside the
 * cache folder, so they are never touched; `downloads` is in `KEEP` as well, in case.
 *
 * The folder work is pure over `CacheEntry` so it is tested without a phone.
 */
import { Directory, Paths } from 'expo-file-system';
import type { Stores } from './types';

export type CacheEntry = { name: string; size: number; remove: () => void };

/** Never measured, never deleted. */
export const KEEP: readonly string[] = ['launch', 'downloads'];

const kept = (e: CacheEntry) => KEEP.includes(e.name);

/** The bytes Clear cache would free: the folder's entries (less KEEP) plus the saved pages. */
export function cacheBytes(entries: readonly CacheEntry[], stores: Pick<Stores, 'socialCache' | 'feedCache'>): number {
  const files = entries.filter((e) => !kept(e)).reduce((n, e) => n + Math.max(0, e.size), 0);
  return files + (stores.socialCache.bytes?.() ?? 0) + (stores.feedCache.bytes?.() ?? 0);
}

/** Deletes everything `cacheBytes` counted; an entry that will not go is skipped. Returns the bytes freed. */
export function clearCache(entries: readonly CacheEntry[], stores: Pick<Stores, 'socialCache' | 'feedCache'>): number {
  let freed = (stores.socialCache.bytes?.() ?? 0) + (stores.feedCache.bytes?.() ?? 0);
  stores.socialCache.clear?.();
  stores.feedCache.clear?.();
  for (const e of entries) {
    if (kept(e)) continue;
    try { e.remove(); freed += Math.max(0, e.size); } catch { /* in use or gone: leave it */ }
  }
  return freed;
}

/** The cache folder's top-level entries on this phone. Empty when it cannot be read. */
export function phoneCacheEntries(): CacheEntry[] {
  try {
    return new Directory(Paths.cache).list().map((x) => ({
      name: x.name,
      size: x.size ?? 0,
      remove: () => x.delete(),
    }));
  } catch {
    return [];
  }
}

/** "0 KB", "320 KB", "4.2 MB", "1.1 GB" — a cache is often under a megabyte. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(Math.max(0, bytes) / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
