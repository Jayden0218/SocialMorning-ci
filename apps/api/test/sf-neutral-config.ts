// Lane SF settings test helpers that work on both backends: app_config / blocked_words SQL on Postgres, the items on DynamoDB.
/**
 * M26 lane SF. With `t.store` (TEST_BACKEND=ddb) the helper writes the DynamoDB item the app reads
 * (src/db/repos/safety/ddb/*), loading those modules dynamically so the Postgres coverage run never loads
 * them; otherwise it runs the SQL the test used to inline. CUT deletes the Postgres branches.
 */
import type { TestDb } from './harness.ts';

/**
 * Stores an app setting AS IS, bypassing the save check (a value that no longer passes it). Version 1,
 * as the SQL column default.
 */
export async function putStoredConfig(t: TestDb, key: string, value: unknown): Promise<void> {
  if (t.store) {
    const [{ encode }, K, { put }] = await Promise.all([import('../src/db/ddb/codec.ts'), import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts')]);
    await put(t.store, 'main', encode('appConfig', K.appConfig(key), { key, value, version: 1, updatedAt: new Date().toISOString() }));
    return;
  }
  await t.q('INSERT INTO app_config (key, value) VALUES ($1, ($2::text)::jsonb)', [key, JSON.stringify(value)]);
}

/** Adds one blocked word with no adder (the old `INSERT INTO blocked_words (word) VALUES (…)`). */
export async function addBlockedWord(t: TestDb, word: string): Promise<void> {
  if (t.store) {
    const [{ encode }, K, { get, put }] = await Promise.all([import('../src/db/ddb/codec.ts'), import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts')]);
    const cur = await get(t.store, 'main', K.config('words'));
    const words = { ...((cur?.['words'] ?? {}) as Record<string, unknown>), [word]: { by: null, at: new Date().toISOString() } };
    await put(t.store, 'main', encode('wordList', K.config('words'), { words, v: Number(cur?.['v'] ?? 0) + 1 }));
    return;
  }
  await t.q('INSERT INTO blocked_words (word) VALUES ($1)', [word]);
}
