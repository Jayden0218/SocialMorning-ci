// Reads and writes app data in the phone's SQLite database.
/**
 * `expo-sqlite` implementations of the four stores.
 *
 * API VERIFIED against the installed typings, not recalled (Principle III):
 * `node_modules/expo-sqlite/build/SQLiteDatabase.d.ts` (expo-sqlite 58.0.3)
 * declares `openDatabaseSync`, `execSync`, `runSync`, `getAllSync<T>`,
 * `getFirstSync<T>` and `withTransactionSync`.
 *
 * TESTED through `node:sqlite` (M32 T061): `__tests__/storage-sqlite.test.ts` replaces
 * `expo-sqlite` with a shim (`__tests__/support/node-sqlite-shim.js`) and runs the same
 * scenarios as `__tests__/storage.test.ts` against the SQL below (seen red when a column
 * name or a comparison is broken). Only the stores those scenarios use are exercised.
 *
 * NOT VERIFIED on a device: `expo-sqlite` is a native module; its engine, file storage and
 * type coercion have not run on a phone. SQLite itself is the same library, but the shim's
 * binding rules are a copy of expo-sqlite's, not expo-sqlite.
 */
// 2026-10-31: the stores live in sqlite-open.ts (opening + migrations), sqlite-feeds.ts, sqlite-playback.ts and
// sqlite-social.ts; this file re-exports every one of them, so `@/storage/sqlite` exports exactly what it did.
import type { Stores } from './types';
import { openDatabase } from './sqlite-open';
import { createSqliteExtrasStore, createSqliteFeedCache, createSqliteFeedCacheStore, createSqliteSubscriptionStore } from './sqlite-feeds';
import {
  createSqliteDownloadStore,
  createSqliteInboxStateStore,
  createSqliteListenedStore,
  createSqlitePositionStore,
  createSqliteQueueBackupStore,
  createSqliteQueueStore,
  createSqliteSessionStore,
  createSqliteSpeedStore,
} from './sqlite-playback';
import {
  createSqliteAuthStore,
  createSqliteBlockStore,
  createSqliteDraftStore,
  createSqliteHiddenStore,
  createSqlitePendingClipStore,
  createSqliteRecOutboxStore,
  createSqliteSettingsStore,
  createSqliteSocialCacheStore,
} from './sqlite-social';

export { DATABASE_NAME, openDatabase } from './sqlite-open';
export { createSqliteExtrasStore, createSqliteFeedCache, createSqliteFeedCacheStore, createSqliteSubscriptionStore } from './sqlite-feeds';
export {
  createSqliteDownloadStore,
  createSqliteInboxStateStore,
  createSqliteListenedStore,
  createSqlitePositionStore,
  createSqliteQueueBackupStore,
  createSqliteQueueStore,
  createSqliteSessionStore,
  createSqliteSpeedStore,
} from './sqlite-playback';
export {
  createSqliteAuthStore,
  createSqliteBlockStore,
  createSqliteDraftStore,
  createSqliteHiddenStore,
  createSqlitePendingClipStore,
  createSqliteRecOutboxStore,
  createSqliteSettingsStore,
  createSqliteSocialCacheStore,
} from './sqlite-social';

export function createSqliteStores(hash: (s: string) => string, name?: string): Stores {
  const db = openDatabase(name);
  return {
    positions: createSqlitePositionStore(db),
    subscriptions: createSqliteSubscriptionStore(db),
    recOutbox: createSqliteRecOutboxStore(db),
    feeds: createSqliteFeedCache(db, hash),
    session: createSqliteSessionStore(db),
    auth: createSqliteAuthStore(db),
    socialCache: createSqliteSocialCacheStore(db),
    drafts: createSqliteDraftStore(db),
    downloads: createSqliteDownloadStore(db),
    queue: createSqliteQueueStore(db),
    queueBackups: createSqliteQueueBackupStore(db),
    speed: createSqliteSpeedStore(db),
    settings: createSqliteSettingsStore(db),
    inboxState: createSqliteInboxStateStore(db),
    extras: createSqliteExtrasStore(db),
    pendingClips: createSqlitePendingClipStore(db),
    listened: createSqliteListenedStore(db),
    feedCache: createSqliteFeedCacheStore(db),
    hidden: createSqliteHiddenStore(db),
    blocks: createSqliteBlockStore(db),
  };
}
