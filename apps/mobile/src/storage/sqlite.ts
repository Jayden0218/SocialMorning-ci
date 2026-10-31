// Reads and writes app data in the phone's SQLite database.
/**
 * `expo-sqlite` implementations of the four stores.
 *
 * API VERIFIED against the installed typings, not recalled (Principle III):
 * `node_modules/expo-sqlite/build/SQLiteDatabase.d.ts` (expo-sqlite 58.0.3)
 * declares `openDatabaseSync`, `execSync`, `runSync`, `getAllSync<T>`,
 * `getFirstSync<T>` and `withTransactionSync`.
 *
 * NOT VERIFIED: none of this has been executed. `expo-sqlite` is a native
 * module and this build machine has no device and no Android SDK. The rules
 * these stores must obey are pinned by `__tests__/storage.test.ts` against
 * `memory.ts`; that the SQL below implements the same rules is reviewed, not
 * tested, until it runs on the phone.
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
