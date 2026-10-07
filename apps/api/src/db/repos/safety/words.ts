// Blocked words: the admin's list, read through a short memo, and the check every write uses.
/**
 * M24 US2. The list lives in `blocked_words` (migration 023). Every checked write reads it through
 * a 30 s in-process memo per database; an admin change drops the memo at once in this process
 * (another serverless instance catches up within 30 s). The matching rule is social-core's
 * `findBlockedWord`, so the phone could run the same one.
 */
import { findBlockedWord, WORDS_MAX } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';

const MEMO_MS = 30_000;
const memo = new WeakMap<Db, { at: number; words: string[] }>();

export function dropWordsMemo(db: Db): void {
  memo.delete(db);
}

export async function blockedWords(db: Db): Promise<string[]> {
  const hit = memo.get(db);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.words;
  // A read that fails (e.g. migration 023 not applied yet) checks nothing rather than refusing every write.
  const rows = await db.query<{ word: string }>('SELECT word FROM blocked_words ORDER BY word LIMIT $1', [WORDS_MAX])
    .catch((e: unknown) => { console.warn('[words] read failed', e instanceof Error ? e.message : e); return [] as { word: string }[]; });
  const words = rows.map((r) => r.word);
  memo.set(db, { at: Date.now(), words });
  return words;
}

export type WordRow = { word: string; addedBy: string | null; addedAt: string };

export async function listWords(db: Db): Promise<WordRow[]> {
  const rows = await db.query<{ word: string; added_by_name: string | null; added_at: Date | string }>(
    `SELECT w.word, l.display_name AS added_by_name, w.added_at FROM blocked_words w LEFT JOIN listeners l ON l.id = w.added_by ORDER BY w.word LIMIT $1`, [WORDS_MAX]);
  return rows.map((r) => ({ word: r.word, addedBy: r.added_by_name, addedAt: new Date(r.added_at).toISOString() }));
}

/** Adds words (already normalised); a word already there is kept. Refuses past WORDS_MAX. */
export async function addWords(db: Db, words: readonly string[], by: string): Promise<number> {
  const [n] = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM blocked_words');
  if (Number(n?.n ?? 0) + words.length > WORDS_MAX) throw new ApiError('validation', `At most ${WORDS_MAX} words.`, { fields: ['words'] });
  const rows = await db.query<{ word: string }>(
    'INSERT INTO blocked_words (word, added_by) SELECT w, $2 FROM unnest($1::text[]) AS w ON CONFLICT (word) DO NOTHING RETURNING word', [[...words], by]);
  return rows.length;
}

export async function removeWord(db: Db, word: string): Promise<boolean> {
  return (await db.query('DELETE FROM blocked_words WHERE word = $1 RETURNING word', [word])).length > 0;
}

/** Throws 422 `blocked_word` when any of the texts holds a blocked word. The word is not echoed back. */
export async function assertNoBlockedWords(db: Db, texts: readonly (string | undefined | null)[]): Promise<void> {
  const present = texts.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
  if (present.length === 0) return;
  const words = await blockedWords(db);
  if (words.length === 0) return;
  for (const t of present) {
    if (findBlockedWord(t, words) !== undefined) throw new ApiError('blocked_word', 'That contains a word that is not allowed here. Change it and try again.');
  }
}
