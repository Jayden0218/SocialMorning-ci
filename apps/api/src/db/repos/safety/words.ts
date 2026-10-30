// Blocked words: the admin's list, read through a short memo, and the check every write uses.
/**
 * M24 US2. The list is stored as the admin's word list. Every checked write reads it through
 * a 30 s in-process memo per database; an admin change drops the memo at once in this process
 * (another serverless instance catches up within 30 s). The matching rule is social-core's
 * `findBlockedWord`, so the phone could run the same one.
 */
import { findBlockedWord } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { viaStore } from '../../backend.ts';

const MEMO_MS = 30_000;
const memo = new WeakMap<Db, { at: number; words: string[] }>();

export function dropWordsMemo(db: Db): void {
  memo.delete(db);
}

export async function blockedWords(db: Db): Promise<string[]> {
  const hit = memo.get(db);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.words;
  // A read that fails checks nothing rather than refusing every write.
  const words = await wordRows(db)
    .catch((e: unknown) => { console.warn('[words] read failed', e instanceof Error ? e.message : e); return [] as string[]; });
  memo.set(db, { at: Date.now(), words });
  return words;
}

export type WordRow = { word: string; addedBy: string | null; addedAt: string };

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

export const wordRows = viaStore<typeof import('./ddb/words.ts').wordRows>('sf/words', 'wordRows');
export const listWords = viaStore<typeof import('./ddb/words.ts').listWords>('sf/words', 'listWords');
export const addWords = viaStore<typeof import('./ddb/words.ts').addWords>('sf/words', 'addWords');
export const removeWord = viaStore<typeof import('./ddb/words.ts').removeWord>('sf/words', 'removeWord');
