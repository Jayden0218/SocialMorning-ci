// The web pass's stand-in for the phone's SQLite stores: the in-memory stores, with sign-in and settings kept in localStorage.
/**
 * M27 research R5: `expo-sqlite`'s web build needs `wa-sqlite.wasm`, which is not in the npm package,
 * so a react-native-web build cannot open the database. For the capture pass ONLY (metro alias
 * switched on by `M27_WEB=1`, never in a phone build) the stores are the in-memory twins the unit
 * tests use. The signed-in listener and the settings (consent, accent, switches) are written
 * through to localStorage so a page reload keeps them.
 */
import { createMemoryAuthStore, createMemorySettingsStore, createMemoryStores } from '@/storage/memory';
import type { AuthRow, AuthStore, SettingsStore, Stores } from '@/storage/types';

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

export const DATABASE_NAME = 'socialmorning.db';
export function createSqliteStores(hash: (s: string) => string): Stores {
  return { ...createMemoryStores(hash), auth: persistedAuth(), settings: persistedSettings() };
}
export function openDatabase(): never { throw new Error('no SQLite on the web capture build'); }
