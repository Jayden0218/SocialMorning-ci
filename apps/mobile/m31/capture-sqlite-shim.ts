// Capture-only (lane C34, waves 3 and 4): a drop-in for apps/mobile/m27/web-shims/sqlite.ts.
// Copy it over that file in the EXPORT WORKTREE (never in the repo's own tree) before `expo export`:
//   cp apps/mobile/m31/capture-sqlite-shim.ts <worktree>/apps/mobile/m27/web-shims/sqlite.ts
// It is the M29 shim plus one thing: if localStorage has `m31.seed` (the capture script writes it before the page loads), the in-memory
// stores are filled from it with the stores' own methods, so a screen that lists what is on the phone (Queue, Downloads, History, Library)
// has the drawing's sample rows after a reload. Without the seed it behaves exactly as the M29 shim.
import { createMemoryAuthStore, createMemorySettingsStore, createMemoryStores } from '@/storage/memory';
import type { AuthRow, AuthStore, SettingsStore, Stores } from '@/storage/types';
import { parseFeed } from '@socialmorning/feed-parser';

const read = (k: string): string | null => { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } };
const write = (k: string, v: string | null): void => { try { if (v === null) globalThis.localStorage?.removeItem(k); else globalThis.localStorage?.setItem(k, v); } catch { /* storage blocked */ } };

function persistedAuth(): AuthStore {
  const mem = createMemoryAuthStore();
  const saved = read('m27.auth');
  if (saved) { const a = JSON.parse(saved) as AuthRow; mem.set({ listenerId: a.listenerId, displayName: a.displayName, email: a.email }, a.signedInAt); }
  return { get: () => mem.get(), set: (a, now) => { mem.set(a, now); write('m27.auth', JSON.stringify(mem.get())); }, clear: () => { mem.clear(); write('m27.auth', null); } };
}

function persistedSettings(): SettingsStore {
  const mem = createMemorySettingsStore();
  const saved = JSON.parse(read('m27.settings') ?? '{}') as Record<string, string>;
  for (const [k, v] of Object.entries(saved)) mem.set(k, v);
  return { get: (k) => mem.get(k), set: (k, v) => { mem.set(k, v); saved[k] = v; write('m27.settings', JSON.stringify(saved)); } };
}

type Seed = {
  now: number;
  feeds?: Record<string, string>;
  subs?: { feedUrl: string; starred?: boolean }[];
  positions?: { episodeId: string; offsetMs: number; durationMs?: number; finished?: boolean; at: number }[];
  downloads?: { url?: string; episodeId: string; state: 'waiting' | 'downloading' | 'paused' | 'complete' | 'failed'; bytesDone: number; bytesTotal?: number; error?: string; at: number }[];
  queue?: string[];
  session?: { episodeId: string };
  pendingClips?: { clientId: string; episodeId: string; startMs: number; endMs: number; caption: string; createdAt: number }[];
  blocks?: { listenerId: string; displayName?: string }[];
  queueBackups?: { items: string[]; device: string | null; reason: 'chooser' | 'manual' | 'restore'; createdAt: number }[];
};

function fill(stores: Stores, hash: (s: string) => string): void {
  const raw = read('m31.seed');
  if (!raw) return;
  try {
    const s = JSON.parse(raw) as Seed;
    for (const [url, xml] of Object.entries(s.feeds ?? {})) stores.feeds.put(url, parseFeed(xml, url, { hash }), {}, s.now);
    for (const u of s.subs ?? []) { stores.subscriptions.add(u.feedUrl, s.now - 86400000 * 20); if (u.starred) stores.subscriptions.setStarred(u.feedUrl, true, s.now - 86400000); }
    for (const p of s.positions ?? []) stores.positions.save({ episodeId: p.episodeId, offsetMs: p.offsetMs, ...(p.durationMs ? { durationMsAtSave: p.durationMs } : {}), finished: p.finished === true }, p.at);
    for (const d of s.downloads ?? []) stores.downloads.put({ episodeId: d.episodeId, filePath: d.url ?? `file:///downloads/${d.episodeId}.mp3`, state: d.state, bytesDone: d.bytesDone, ...(d.bytesTotal ? { bytesTotal: d.bytesTotal } : {}), allowMobile: false, requestedAt: d.at, ...(d.state === 'complete' ? { completedAt: d.at } : {}), ...(d.error ? { error: d.error } : {}) });
    { const orig = stores.positions.applyRemote.bind(stores.positions); stores.positions.applyRemote = (p, now) => orig(p, stores.positions.get(p.episodeId)?.updatedAt ?? now); }  // a server echo must not make every row "today"
    if (s.queue) stores.queue.replace(s.queue, s.now);
    if (s.session) stores.session.set({ episodeId: s.session.episodeId, intent: 'pause' }, s.now);
    for (const c of s.pendingClips ?? []) stores.pendingClips.put({ ...c, attempts: 0 });
    for (const q of s.queueBackups ?? []) stores.queueBackups.add(q);
    for (const b of s.blocks ?? []) stores.blocks.put({ listenerId: b.listenerId, ...(b.displayName ? { displayName: b.displayName } : {}), at: s.now, pending: 0 });
  } catch { /* a bad seed leaves the stores empty */ }
}

export const DATABASE_NAME = 'socialmorning.db';
export function createSqliteStores(hash: (s: string) => string): Stores {
  const stores = { ...createMemoryStores(hash), auth: persistedAuth(), settings: persistedSettings() };
  fill(stores, hash);
  return stores;
}
export function openDatabase(): never { throw new Error('no SQLite on the web capture build'); }
