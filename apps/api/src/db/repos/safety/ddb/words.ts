// Blocked words on DynamoDB: a head item (version + chunk count) and the words in size-capped chunks, changed in one conditional transaction that can join the audit transaction.
/**
 * M26 lane SF (data-model.md hard case 6); chunked by lane LE. `K.config('words')` = `CFG#words` / `V`, type `wordList`
 * {v: version, chunks: n}; the words live in `CFG#words` / `C#0000` … (type `wordChunk` {words: map word → { by: listenerId
 * | null, at: ISO }, v, n}), each at most CHUNK_BYTES. One item could not hold the list: at its worst (WORDS_MAX = 2000 words
 * of WORD_MAX = 40 four-byte characters, each with its adder and time) the map is ~470 KB, over DynamoDB's 400 KB item
 * limit (lane SF's report; guard G-M26-LE1). A change rewrites the head (condition on `v`, label `words`) and every chunk,
 * and deletes the chunks no longer used — ONE transaction (at worst 1 + 4 + 4 items, ~0.5 MB; DynamoDB allows 100 / 4 MB),
 * through `commitOrDefer`, so inside adminWrite it commits with the audit record. A race on `v` → refused (409 `changed`).
 * A read takes the head, then its chunks (strong reads); a chunk of another version (a read between two commits) → read
 * again. A head that still holds `words` itself (no `chunks`: the one-item shape before chunking) is read as before and
 * rewritten in chunks by the next change.
 * The adder's name comes from lane AC's listener items (`displayName`, one BatchGet) — a deleted adder reads
 * null, as the SQL LEFT JOIN did.
 */
import { WORDS_MAX } from '@socialmorning/social-core';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { get } from '../../../ddb/store.ts';
import type { WordRow } from '../words.ts';
import { commitOrDefer } from './admin-scope.ts';
import { listenersById, nowIso, txa, type Db, type Store } from './common.ts';

type Entry = { by: string | null; at: string };
type List = { words: Map<string, Entry>; v: number; exists: boolean; chunks: number };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The most one chunk's word map may weigh (bytes, counted the way DynamoDB counts them, plus slack): 4 chunks hold the worst list. */
export const CHUNK_BYTES = 10_000_000; // LE1 RED
const entryBytes = (w: string, e: Entry): number => Buffer.byteLength(w) + Buffer.byteLength(e.by ?? '') + Buffer.byteLength(e.at) + 16;

function intoMap(raw: unknown, into: Map<string, Entry>): void {
  for (const [w, e] of Object.entries((raw ?? {}) as Record<string, { by?: unknown; at?: unknown }>)) {
    into.set(w, { by: typeof e?.by === 'string' ? e.by : null, at: String(e?.at ?? '') });
  }
}

async function readList(store: Store): Promise<List> {
  for (let attempt = 0; ; attempt++) {
    const head = await get(store, 'main', K.config('words'), { consistent: true });
    if (!head) return { words: new Map(), v: 0, exists: false, chunks: 0 };
    const v = Number(head['v'] ?? 0);
    const words = new Map<string, Entry>();
    if (head['chunks'] === undefined) { intoMap(head['words'], words); return { words, v, exists: true, chunks: 0 }; }
    const n = Number(head['chunks']);
    const parts = n > 0 ? await batchGetAll(store, 'main', Array.from({ length: n }, (_, c) => K.configChunk('words', c)), { consistent: true }) : [];
    if (parts.length === n && parts.every((p) => Number(p['v']) === v)) {
      for (const p of parts.sort((a, b) => Number(a['n']) - Number(b['n']))) intoMap(p['words'], words);
      return { words, v, exists: true, chunks: n };
    }
    if (attempt >= 4) throw new Error('words: the list changed while it was read, five times running');
  }
}

/** The words cut into maps of at most CHUNK_BYTES each, in word order. */
export function chunkWords(words: ReadonlyMap<string, Entry>): Record<string, Entry>[] {
  const out: Record<string, Entry>[] = [];
  let cur: Record<string, Entry> = {};
  let bytes = 0;
  for (const w of [...words.keys()].sort(cmp)) {
    const e = words.get(w)!;
    const b = entryBytes(w, e);
    if (bytes > 0 && bytes + b > CHUNK_BYTES) { out.push(cur); cur = {}; bytes = 0; }
    cur[w] = e;
    bytes += b;
  }
  if (bytes > 0) out.push(cur);
  return out;
}

/** Writes the whole list when `v` is still the one read (or the head is still absent): head + chunks, stale chunks deleted — one transaction. */
async function writeList(store: Store, l: List, words: ReadonlyMap<string, Entry>): Promise<void> {
  const v = l.v + 1;
  const parts = chunkWords(words);
  const cond = l.exists ? { condition: 'v = :cur', values: { ':cur': l.v } } : { condition: 'attribute_not_exists(PK)' };
  const t = txa(store).put('main', encode('wordList', K.config('words'), { v, chunks: parts.length }), { ...cond, label: 'words' });
  parts.forEach((m, n) => t.put('main', encode('wordChunk', K.configChunk('words', n), { words: m, v, n })));
  for (let n = parts.length; n < l.chunks; n++) t.delete('main', K.configChunk('words', n));
  await commitOrDefer(store, t.raw, { words: () => new ApiError('changed', 'Changed elsewhere — reload.') });
}

/** Test set-up (test/sf-neutral-config.ts, test/ddb-le.test.ts): adds these entries as the app stores them (no WORDS_MAX check). */
export async function writeWordMap(store: Store, entries: Record<string, Entry>): Promise<void> {
  const l = await readList(store);
  await writeList(store, l, new Map([...l.words, ...Object.entries(entries)]));
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
