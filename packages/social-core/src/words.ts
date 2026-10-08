// Blocked-words filter: does a piece of text contain one of the admin's blocked words?
/**
 * M24 US2 (specs/025-m24-gaps-and-look): the admin keeps a list of blocked words; a comment,
 * status, chat message, list title or display name containing one is refused (`blocked_word`).
 *
 * Matching rules, the same on every surface:
 *  - Both sides are folded the same way: NFKC (full-width letters become plain), lower case,
 *    runs of spaces become one space, trimmed.
 *  - A word made only of Latin letters, digits, spaces, `'` and `-` matches as a WHOLE word, so
 *    "ass" does not refuse "class" (the Scunthorpe problem).
 *  - Any other word (Chinese, emoji, symbols) matches anywhere — Chinese has no spaces between words.
 */
export const WORD_MAX = 40;
export const WORDS_MAX = 2000;

const fold = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** A word as stored: folded, 1–WORD_MAX characters; undefined when nothing is left. */
export function normaliseWord(raw: string): string | undefined {
  const w = fold(raw);
  return w.length === 0 || [...w].length > WORD_MAX ? undefined : w;
}

/** Text as it is matched. */
export const normaliseText = fold;

const LATIN = /^[a-z0-9' -]+$/;
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first blocked word the text contains, or undefined. `words` are already normalised. */
export function findBlockedWord(text: string, words: readonly string[]): string | undefined {
  const t = fold(text);
  if (t === '') return undefined;
  for (const w of words) {
    if (w === '') continue;
    if (LATIN.test(w)) {
      if (new RegExp(`(^|[^a-z0-9])${escape(w)}($|[^a-z0-9])`).test(t)) return w;
    } else if (t.includes(w)) {
      return w;
    }
  }
  return undefined;
}
