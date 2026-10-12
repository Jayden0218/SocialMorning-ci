// Lane SF settings test helpers: the app setting and blocked-word items on DynamoDB.
/**
 * Each helper writes the DynamoDB item the app reads (src/db/repos/safety/ddb/*).
 */
import type { TestDb } from './harness.ts';

/**
 * Stores an app setting AS IS, bypassing the save check (a value that no longer passes it). Version 1.
 */
export async function putStoredConfig(t: TestDb, key: string, value: unknown): Promise<void> {
  const [{ encode }, K, { put }] = await Promise.all([import('../src/db/ddb/codec.ts'), import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts')]);
  await put(t.store, 'main', encode('appConfig', K.appConfig(key), { key, value, version: 1, updatedAt: new Date().toISOString() }));
}

/** Adds one blocked word with no adder . */
export async function addBlockedWord(t: TestDb, word: string): Promise<void> {
  // Lane LE: the list is a head + chunks now; written the way the app writes it.
  const { writeWordMap } = await import('../src/db/repos/safety/ddb/words.ts');
  await writeWordMap(t.store, { [word]: { by: null, at: new Date().toISOString() } });
}
