// Blocked words on DynamoDB: the whole list is one item, changed with one conditional write that can join the audit transaction.
/**
 * M26 lane SF (data-model.md hard case 6). `K.config('words')` = `CFG#words` / `V`, type `wordList`
 * {words: map word → { by: listenerId | null, at: ISO }, v: version}. ≤ WORDS_MAX (2000) words, so one item;
 * the bulk add is ONE write (a Put of the new map, condition on `v`, label `words`) through `commitOrDefer`,
 * so inside adminWrite it commits with the audit record. A race on `v` → the write is refused (409 `changed`).
 * The adder's name comes from lane AC's listener items (`displayName`, one BatchGet) — a deleted adder reads
 * null, as the SQL LEFT JOIN did.
 */
import { WORDS_MAX } from '@socialmorning/social-core';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item } from '../../../ddb/store.ts';
import type { WordRow } from '../words.ts';
import { commitOrDefer } from './admin-scope.ts';
import { listenersById, nowIso, txa, type Db, type Store } from './common.ts';

type Entry = { by: string | null; at: string };
type List = { words: Map<string, Entry>; v: number; exists: boolean };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function readList(store: Store): Promise<List> {
  const i = await get(store, 'main', K.config('words'));
  if (!i) return { words: new Map(), v: 0, exists: false };
  const raw = (i['words'] ?? {}) as Record<string, { by?: unknown; at?: unknown }>;
  const words = new Map<string, Entry>();
  for (const [w, e] of Object.entries(raw)) words.set(w, { by: typeof e?.by === 'string' ? e.by : null, at: String(e?.at ?? '') });
  return { words, v: Number(i['v'] ?? 0), exists: true };
}

/** Writes the whole map when `v` is still the one read (or the item is still absent). */
async function writeList(store: Store, l: List, words: Map<string, Entry>): Promise<void> {
  const item: Item = encode('wordList', K.config('words'), { words: Object.fromEntries(words), v: l.v + 1 });
  const cond = l.exists ? { condition: 'v = :cur', values: { ':cur': l.v } } : { condition: 'attribute_not_exists(PK)' };
  const t = txa(store).put('main', item, { ...cond, label: 'words' });
  await commitOrDefer(store, t.raw, { words: () => new ApiError('changed', 'Changed elsewhere — reload.') });
}

export async function wordRows(store: Store, _db: Db): Promise<string[]> {
  return [...(await readList(store)).words.keys()].sort(cmp).slice(0, WORDS_MAX);
}

export async function listWords(store: Store, _db: Db): Promise<WordRow[]> {
  const { words } = await readList(store);
  const sorted = [...words.keys()].sort(cmp).slice(0, WORDS_MAX);
  const names = await listenersById(store, sorted.flatMap((w) => { const by = words.get(w)?.by; return by ? [by] : []; }));
  return sorted.map((w) => {
    const e = words.get(w)!;
    const l = e.by ? names.get(e.by) : undefined;
    return { word: w, addedBy: l && typeof l['displayName'] === 'string' ? l['displayName'] : null, addedAt: new Date(e.at).toISOString() };
  });
}

/** Adds words (already normalised); a word already there is kept. Refuses past WORDS_MAX. Returns how many were new. */
export async function addWords(store: Store, _db: Db, words: readonly string[], by: string): Promise<number> {
  const l = await readList(store);
  if (l.words.size + words.length > WORDS_MAX) throw new ApiError('validation', `At most ${WORDS_MAX} words.`, { fields: ['words'] });
  const fresh = [...new Set(words)].filter((w) => !l.words.has(w));
  if (fresh.length === 0) return 0;
  const at = nowIso(store);
  const next = new Map(l.words);
  for (const w of fresh) next.set(w, { by, at });
  await writeList(store, l, next);
  return fresh.length;
}

export async function removeWord(store: Store, _db: Db, word: string): Promise<boolean> {
  const l = await readList(store);
  if (!l.words.has(word)) return false;
  const next = new Map(l.words);
  next.delete(word);
  await writeList(store, l, next);
  return true;
}
