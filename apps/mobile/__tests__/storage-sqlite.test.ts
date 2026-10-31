// Runs the storage rules of storage.test.ts against the SQL in sqlite.ts, through node:sqlite.
/**
 * M32 T061 (review F2). `src/storage/sqlite.ts` was "reviewed, not tested". Here `expo-sqlite` is
 * replaced by a shim on Node's `node:sqlite` (`__tests__/support/node-sqlite-shim.js`), and every
 * `createMemory*` the scenarios in `storage.test.ts` use is swapped for its SQLite twin, then those
 * same scenarios are loaded. A new in-memory database per store, as the memory twins give.
 * Break to watch red: rename a column in any SQL statement in sqlite.ts.
 * NOT VERIFIED: on a device (expo-sqlite's native engine, file storage, WAL).
 */
jest.mock('expo-sqlite', () => require('./support/node-sqlite-shim'));
jest.mock('@/storage/memory', () => {
  const actual = jest.requireActual('@/storage/memory');
  const sqlite = () => jest.requireActual('@/storage/sqlite') as typeof import('@/storage/sqlite');
  const db = () => sqlite().openDatabase();
  return {
    ...actual,
    createMemoryStores: (hash: (s: string) => string) => sqlite().createSqliteStores(hash),
    createMemoryPositionStore: () => sqlite().createSqlitePositionStore(db()),
    createMemorySubscriptionStore: () => sqlite().createSqliteSubscriptionStore(db()),
    createMemorySessionStore: () => sqlite().createSqliteSessionStore(db()),
    createMemoryFeedCache: (hash: (s: string) => string) => sqlite().createSqliteFeedCache(db(), hash),
  };
});

// The scenarios, unchanged.
require('./storage.test');
