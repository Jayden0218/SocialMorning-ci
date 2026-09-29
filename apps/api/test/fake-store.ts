import type { EpisodeStorage, StoredFile } from '../src/storage/episodes-blob.ts';

export const STORE = 'https://store.public.blob.vercel-storage.com/';

/** An in-memory store: `uploadToken` records the pathname; a test "uploads" with `put`. */
export function fakeStore(ready = true) {
  const files = new Map<string, StoredFile>();
  const removed: string[] = [];
  const s: EpisodeStorage & { put: (pathname: string, size: number, type: string) => string; files: typeof files; removed: string[] } = {
    ready,
    uploadToken: async (pathname) => `token-for:${pathname}`,
    head: async (url) => files.get(url),
    remove: async (url) => { removed.push(url); files.delete(url); },
    list: async (prefix) => [...files.values()].filter((f) => f.pathname.startsWith(prefix)),
    put: (pathname, size, contentType) => { const url = STORE + pathname; files.set(url, { url, pathname, size, contentType }); return url; },
    files, removed,
  };
  return s;
}

