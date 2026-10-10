// Translation on DynamoDB: the Groq usage ledger, jobs with chunked segments, finished translations in chunks, the /mod allow-list.
/**
 * M26 lane SF (data-model.md "Lane SF changes", §13). Bodies for `dual('sf/translation', …)` in ../translation.ts.
 *
 * - Job `TRJOB#<ep>#<lang> / J` (type translationJob). The whole-episode `segments` JSON (it can pass 400 KB) is
 *   NOT on the job: it is cut into `SEG#0000…` items under the same partition (≤ 100 000 UTF-16 units each, so
 *   ≤ 300 KB of UTF-8; a surrogate pair is never split), each tagged with the write's id `w`. The job holds
 *   `segChunks` (0 = NULL segments) and the same `w`: a reader keeps only the pieces of that write, and a piece
 *   missing reads as NULL segments (the job then starts again from its transcript — never mixed text).
 *   A change of segments is ONE TransactWriteItems (new pieces, stale pieces deleted, the job update) when it
 *   fits (≤ 100 actions, ≤ 3.5 MB); a bigger one writes the pieces first, then the job, then deletes the stale.
 * - Active jobs (queued/transcribing/translating) carry G4 `Q#trjobs` / `<requestedAt>#<ep>#<lang>` (the worker's
 *   queue and the ETA's "jobs ahead"); done/failed REMOVE it. Every job carries G5 `REF#trjob#all` /
 *   `<requestedAt>` (the /mod queue, newest first; KEYS_ONLY → read back with BatchGet).
 * - Finished translation `TR#<ep>#<lang> / META` {chunks, madeAt, w} + `LINES#0000…` pieces, same rules:
 *   a missing piece reads as "not translated".
 * - Allow-list `CFG#translation-shows / <feedKey>`; Groq ledger `GROQ#<utc day> / <model>` in sm-events, one
 *   atomic ADD per call. "Today" and every "now()" is the Store clock.
 * Every "UPDATE … WHERE" that matched no row in Postgres is a condition here that is swallowed (no row, no change).
 */
import { randomUUID } from 'node:crypto';
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import type { GroqModel } from '@socialmorning/social-core';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { del, get, put, update } from '../../../ddb/store.ts';
import { MAX_TX_ITEMS, TxCancelled, tx, type Tx } from '../../../ddb/tx.ts';
import type { JobState, TargetLang } from '../../../../translate/job.ts';
import type { OfferedEpisodeRow, TranslationJobRow } from '../translation.ts';
import { DAY_MS, getMany, iso, keyOf, nowIso, nowMs, partition, pgOf, queue, unlessCondition, type Db, type Item, type Key, type Store } from './common.ts';

const ACTIVE = new Set(['queued', 'transcribing', 'translating']);
/** UTF-16 units per piece: ≤ 3 UTF-8 bytes each → ≤ 300 000 bytes, under the 400 KB item limit. */
export const CHUNK_CHARS = 100_000;
const TX_BYTES = 3_500_000;
const QUEUE_LIMIT = 100;

const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));
const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const utcDay = (store: Store): string => K.day(nowMs(store));
const jobId = (episodeId: string, lang: string): string => `${episodeId}#${lang}`;

/** A JSON string in pieces of at most CHUNK_CHARS, never splitting a surrogate pair. */
export function splitJson(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + CHUNK_CHARS, s.length);
    const c = s.charCodeAt(end - 1);
    if (end < s.length && c >= 0xd800 && c <= 0xdbff) end--;
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

/** The pieces of write `w` joined, or undefined when there are none or one is missing / of another write. */
async function readChunks(store: Store, pk: string, prefix: string, w: unknown, count: number): Promise<string | undefined> {
  if (count <= 0 || w === undefined || w === null) return undefined;
  const mine = (await partition(store, 'main', pk, { prefix }))
    .filter((it) => it['w'] === w)
    .sort((a, b) => Number(a['n']) - Number(b['n']));
  if (mine.length !== count || mine.some((it, i) => Number(it['n']) !== i)) return undefined;
  return mine.map((it) => String(it['data'])).join('');
}

/** The keys (and numbers) of every piece under a prefix. */
async function chunkKeys(store: Store, pk: string, prefix: string): Promise<{ key: Key; n: number }[]> {
  const { items } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :pre)', ExpressionAttributeValues: { ':pk': pk, ':pre': prefix },
    ProjectionExpression: 'PK, SK, #n', ExpressionAttributeNames: { '#n': 'n' }, ConsistentRead: true,
  });
  return items.map((it) => ({ key: keyOf(it), n: Number(it['n']) }));
}

type Plan = { w: string | null; count: number; puts: Item[]; stale: Key[]; bytes: number };

/** New pieces for `json` (null → none) and the existing pieces they leave behind. */
async function chunkPlan(store: Store, type: 'translationJobChunk' | 'translatedChunk', keyAt: (n: number) => Key, pk: string, prefix: string, json: string | null): Promise<Plan> {
  const parts = json === null ? [] : splitJson(json);
  const w = parts.length > 0 ? randomUUID() : null;
  const puts = parts.map((data, n) => encode(type, keyAt(n), { n, data, w }));
  const stale = (await chunkKeys(store, pk, prefix)).filter((c) => c.n >= parts.length).map((c) => c.key);
  return { w, count: parts.length, puts, stale, bytes: parts.reduce((s, p) => s + Buffer.byteLength(p, 'utf8'), 0) };
}

/**
 * Pieces + the item changes `main` adds, as ONE transaction when it fits; otherwise the pieces first, then
 * `main`'s transaction, then the stale pieces. Throws TxCancelled when a condition of `main` fails.
 */
async function commitWithChunks(store: Store, plan: Plan, main: (t: Tx) => void, mainActions: number): Promise<void> {
  if (plan.puts.length + plan.stale.length + mainActions <= MAX_TX_ITEMS && plan.bytes <= TX_BYTES) {
    const t = tx(store);
    for (const p of plan.puts) t.put('main', p);
    for (const k of plan.stale) t.delete('main', k);
    main(t);
    await t.commit();
    return;
  }
  await batchWriteAll(store, 'main', plan.puts.map((p) => ({ put: p })));
  const t = tx(store);
  main(t);
  await t.commit();
  await batchWriteAll(store, 'main', plan.stale.map((k) => ({ delete: k })));
}

type G4Change = { requestedAt: string; id: string } | 'remove' | undefined;
type Expr = { update: string; condition: string; names: Record<string, string>; values: Record<string, NativeAttributeValue> };

/** One job UpdateItem: SET `set` + updatedAt, ADD `add` + v, set or REMOVE the G4 queue keys; only on an existing job (and `cond`). */
function jobExpr(store: Store, set: Record<string, NativeAttributeValue>, add: Record<string, number>, g4: G4Change, cond?: { expr: string; names: Record<string, string>; values: Record<string, NativeAttributeValue> }): Expr {
  const names: Record<string, string> = { '#pk': 'PK', ...(cond?.names ?? {}) };
  const values: Record<string, NativeAttributeValue> = { ...(cond?.values ?? {}) };
  const sets: string[] = [];
  const adds: string[] = [];
  let i = 0;
  for (const [k, v] of Object.entries({ ...set, updatedAt: nowIso(store) })) {
    names[`#s${i}`] = k; values[`:s${i}`] = v; sets.push(`#s${i} = :s${i}`); i++;
  }
  for (const [k, v] of Object.entries({ ...add, v: 1 })) {
    names[`#a${i}`] = k; values[`:a${i}`] = v; adds.push(`#a${i} :a${i}`); i++;
  }
  let remove = '';
  if (g4 === 'remove') remove = ' REMOVE G4PK, G4SK';
  else if (g4) {
    const g = K.G4('trjobs', g4.requestedAt, g4.id);
    names['#g4p'] = 'G4PK'; names['#g4s'] = 'G4SK'; values[':g4p'] = g.G4PK; values[':g4s'] = g.G4SK;
    sets.push('#g4p = :g4p', '#g4s = :g4s');
  }
  return {
    update: `SET ${sets.join(', ')} ADD ${adds.join(', ')}${remove}`,
    condition: `attribute_exists(#pk)${cond ? ` AND ${cond.expr}` : ''}`,
    names, values,
  };
}

const g4Of = (job: Item): G4Change => ({ requestedAt: String(job['requestedAt']), id: jobId(String(job['episodeId']), String(job['targetLang'])) });

/** A job change without new segments: one UpdateItem (no job → nothing, like an UPDATE matching no row). */
async function updateJob(store: Store, episodeId: string, lang: string, set: Record<string, NativeAttributeValue>, g4: G4Change, add: Record<string, number> = {}): Promise<void> {
  const e = jobExpr(store, set, add, g4);
  await unlessCondition(update(store, 'main', K.translationJob(episodeId, lang), e));
}

/** A job change that replaces its segments (null clears them), in one transaction when it fits. */
async function writeSegments(store: Store, episodeId: string, lang: string, json: string | null, change: {
  set: Record<string, NativeAttributeValue>; add?: Record<string, number>; activate?: boolean;
  cond?: { expr: string; names: Record<string, string>; values: Record<string, NativeAttributeValue> }; only?: (job: Item) => boolean;
}): Promise<void> {
  const key = K.translationJob(episodeId, lang);
  const job = await get(store, 'main', key);
  if (!job || (change.only && !change.only(job))) return;
  const plan = await chunkPlan(store, 'translationJobChunk', (n) => K.translationJobChunk(episodeId, lang, n), key.PK, 'SEG#', json);
  const e = jobExpr(store, { ...change.set, segChunks: plan.count, w: plan.w }, change.add ?? {}, change.activate ? g4Of(job) : undefined, change.cond);
  await unlessCondition(commitWithChunks(store, plan, (t) => { t.update('main', key, { ...e, label: 'job' }); }, 1));
}

async function segmentsOf(store: Store, job: Item): Promise<unknown> {
  const json = await readChunks(store, String(job['PK']), 'SEG#', job['w'], Number(job['segChunks'] ?? 0));
  return json === undefined ? null : (JSON.parse(json) as unknown);
}

function jobRow(it: Item, segments: unknown): TranslationJobRow {
  return {
    episode_id: String(it['episodeId']), target_lang: String(it['targetLang']) as TargetLang, state: String(it['state']) as JobState,
    source_lang: str(it['sourceLang']), segments, next_chunk: Number(it['nextChunk'] ?? 0), audio_s: Number(it['audioS'] ?? 0),
    tokens: Number(it['tokens'] ?? 0), errors: Number(it['errors'] ?? 0),
  };
}

// ---- the Groq ledger

export async function groqUsageTodayRows(store: Store, _db: Db, model: GroqModel): Promise<{ requests: number; audio_s: number; tokens: number }[]> {
  const it = await get(store, 'events', K.groqUsage(utcDay(store), model));
  return it ? [{ requests: Number(it['requests'] ?? 0), audio_s: Number(it['audioS'] ?? 0), tokens: Number(it['tokens'] ?? 0) }] : [];
}

export async function addGroqUsage(store: Store, _db: Db, model: GroqModel, requests: number, audioS: number, tokens: number): Promise<void> {
  const d = utcDay(store);
  await update(store, 'events', K.groqUsage(d, model), {
    update: 'SET #t = :t, #d = :d, #m = :m ADD #r :r, #a :a, #k :k',
    names: { '#t': 't', '#d': 'day', '#m': 'model', '#r': 'requests', '#a': 'audioS', '#k': 'tokens' },
    values: { ':t': 'groqUsage', ':d': d, ':m': model, ':r': requests, ':a': audioS, ':k': tokens },
  });
}

export async function utcDayRows(store: Store, _db: Db): Promise<{ day: string }[]> {
  return [{ day: utcDay(store) }];
}

export async function groqUsageTodayAll(store: Store, _db: Db): Promise<{ model: string; requests: number; audio_s: number; tokens: number }[]> {
  const items = await partition(store, 'events', K.groqUsage(utcDay(store), '').PK);
  return items.map((it) => ({ model: String(it['model'] ?? it['SK']), requests: Number(it['requests'] ?? 0), audio_s: Number(it['audioS'] ?? 0), tokens: Number(it['tokens'] ?? 0) }));
}

// ---- episodes (lane LB's items)

export async function offeredEpisodeRows(store: Store, _db: Db, episodeId: string): Promise<OfferedEpisodeRow[]> {
  const e = await get(store, 'main', K.episode(episodeId));
  if (!e) return [];
  const feedUrl = String(e['feedUrl']);
  if (!(await get(store, 'main', K.translationShow(feedUrl)))) return [];
  return [{ id: String(e['id']), feed_url: feedUrl, enclosure_url: String(e['enclosureUrl']), duration_ms: num(e['durationMs']), guid: String(e['guid']) }];
}

export async function translationEpisodeRows(store: Store, _db: Db, episodeId: string): Promise<{ feed_url: string; guid: string; enclosure_url: string; duration_ms: number | null }[]> {
  const e = await get(store, 'main', K.episode(episodeId));
  return e ? [{ feed_url: String(e['feedUrl']), guid: String(e['guid']), enclosure_url: String(e['enclosureUrl']), duration_ms: num(e['durationMs']) }] : [];
}

// ---- jobs

export async function insertTranslationJob(store: Store, _db: Db, episodeId: string, lang: TargetLang): Promise<void> {
  const now = nowIso(store);
  const item = encode('translationJob', K.translationJob(episodeId, lang), {
    episodeId, targetLang: lang, state: 'queued', sourceLang: null, segChunks: 0, nextChunk: 0, audioS: 0, tokens: 0, errors: 0,
    error: null, notBefore: null, requestedAt: now, updatedAt: now, v: 0,
  }, { gsi: { ...K.G4('trjobs', now, jobId(episodeId, lang)), ...K.G5('trjob', 'all', now) } });
  await unlessCondition(put(store, 'main', item, { condition: 'attribute_not_exists(PK)' }));
}

/** Every open job requested no later than this one (this one read strongly — own write), with its episode length. */
export async function jobsAheadRows(store: Store, _db: Db, episodeId: string, lang: TargetLang): Promise<{ duration_ms: number | null; state: JobState; next_chunk: number; is_me: boolean }[]> {
  const me = await get(store, 'main', K.translationJob(episodeId, lang));
  const cutoff = me ? String(me['requestedAt']) : nowIso(store);
  const byKey = new Map<string, Item>();
  for (const it of await queue(store, 'trjobs', { to: `${K.ts(cutoff)}#￿` })) byKey.set(String(it['PK']), it);
  if (me) byKey.set(String(me['PK']), me);
  const jobs = [...byKey.values()].filter((j) => ACTIVE.has(String(j['state'])) && String(j['requestedAt']) <= cutoff);
  const eps = await getMany(store, 'main', [...new Set(jobs.map((j) => String(j['episodeId'])))].map((id) => K.episode(id)));
  const dur = new Map(eps.map((e) => [String(e['id']), num(e['durationMs'])]));
  return jobs.map((j) => ({
    duration_ms: dur.get(String(j['episodeId'])) ?? null, state: String(j['state']) as JobState, next_chunk: Number(j['nextChunk'] ?? 0),
    is_me: j['episodeId'] === episodeId && j['targetLang'] === lang,
  }));
}

export async function translatedLinesRows(store: Store, _db: Db, episodeId: string, lang: TargetLang): Promise<{ lines: unknown }[]> {
  const key = K.translated(episodeId, lang);
  const meta = await get(store, 'main', key);
  if (!meta) return [];
  const json = await readChunks(store, key.PK, 'LINES#', meta['w'], Number(meta['chunks'] ?? 0));
  return json === undefined ? [] : [{ lines: JSON.parse(json) as unknown }];
}

export async function translationJobStateRows(store: Store, _db: Db, episodeId: string, lang: TargetLang): Promise<{ state: JobState }[]> {
  const it = await get(store, 'main', K.translationJob(episodeId, lang));
  return it ? [{ state: String(it['state']) as JobState }] : [];
}

export async function recordTranslationJobError(store: Store, _db: Db, episodeId: string, lang: TargetLang, errors: number, reason: string, maxErrors: number): Promise<void> {
  const failed = errors >= maxErrors;
  await updateJob(store, episodeId, lang, { errors, error: reason, ...(failed ? { state: 'failed' } : {}) }, failed ? 'remove' : undefined);
}

export async function failTranslationJob(store: Store, _db: Db, episodeId: string, lang: TargetLang, reason: string): Promise<void> {
  await updateJob(store, episodeId, lang, { state: 'failed', error: reason }, 'remove');
}

/** Up to `limit` jobs that may move now, oldest first (the G4 queue, then each job read fresh from the table). */
export async function movableTranslationJobs(store: Store, _db: Db, limit: number): Promise<TranslationJobRow[]> {
  const now = nowIso(store);
  const fresh = await getMany(store, 'main', (await queue(store, 'trjobs')).map(keyOf));
  const movable = fresh
    .filter((j) => ACTIVE.has(String(j['state'])) && (j['notBefore'] === undefined || j['notBefore'] === null || String(j['notBefore']) <= now))
    .sort((a, b) => String(a['requestedAt']).localeCompare(String(b['requestedAt'])) || String(a['episodeId']).localeCompare(String(b['episodeId'])) || String(a['targetLang']).localeCompare(String(b['targetLang'])))
    .slice(0, limit);
  const rows: TranslationJobRow[] = [];
  for (const j of movable) rows.push(jobRow(j, await segmentsOf(store, j)));
  return rows;
}

/** The publisher's own transcript: straight to translating. */
export async function saveFeedTranscriptSegments(store: Store, _db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, sourceLang: string | null): Promise<void> {
  await writeSegments(store, episodeId, lang, segmentsJson, { set: { sourceLang, state: 'translating', nextChunk: 0 }, activate: true });
}

export async function markTranslationJobTranscribing(store: Store, _db: Db, episodeId: string, lang: TargetLang, sourceLang: string | null): Promise<void> {
  const job = await get(store, 'main', K.translationJob(episodeId, lang));
  if (!job) return;
  await updateJob(store, episodeId, lang, { state: 'transcribing', sourceLang }, g4Of(job));
}

export async function saveTranscribedSegments(store: Store, _db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, billed: number): Promise<void> {
  await writeSegments(store, episodeId, lang, segmentsJson, { set: { state: 'translating', nextChunk: 0 }, add: { audioS: billed }, activate: true });
}

export async function saveTranslatedChunk(store: Store, _db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, next: number, tokens: number): Promise<void> {
  await writeSegments(store, episodeId, lang, segmentsJson, { set: { nextChunk: next }, add: { tokens } });
}

export async function parkTranslationJob(store: Store, _db: Db, episodeId: string, lang: TargetLang, retryAfterS: string): Promise<void> {
  const seconds = Number(retryAfterS);
  if (!Number.isFinite(seconds)) throw new Error(`translation: retry-after is not a number of seconds: ${retryAfterS}`);
  await updateJob(store, episodeId, lang, { notBefore: iso(nowMs(store) + seconds * 1000) }, undefined);
}

/** The finished translation (pieces, then META) and the job done with its segments gone — META + job in one transaction. */
export async function finishTranslationJob(store: Store, _db: Db, episodeId: string, lang: TargetLang, linesJson: string): Promise<void> {
  const jobKey = K.translationJob(episodeId, lang);
  const trKey = K.translated(episodeId, lang);
  const job = await get(store, 'main', jobKey);
  const plan = await chunkPlan(store, 'translatedChunk', (n) => K.translatedChunk(episodeId, lang, n), trKey.PK, 'LINES#', linesJson);
  const meta = encode('translated', trKey, { episodeId, targetLang: lang, chunks: plan.count, madeAt: nowIso(store), w: plan.w });
  const jobDone = jobExpr(store, { state: 'done', segChunks: 0, w: null }, {}, 'remove');
  const run = (withJob: boolean) => commitWithChunks(store, plan, (t) => {
    t.put('main', meta, { label: 'translated' });
    if (withJob) t.update('main', jobKey, { ...jobDone, label: 'job' });
  }, withJob ? 2 : 1);
  try {
    await run(job !== undefined);
  } catch (e) {
    // The job went away between the read and the write: the translation is still stored (Postgres: the UPDATE matched no row).
    if (!(job !== undefined && e instanceof TxCancelled && e.failed('job'))) throw e;
    await run(false);
  }
  if (job) await batchWriteAll(store, 'main', (await chunkKeys(store, jobKey.PK, 'SEG#')).map((c) => ({ delete: c.key })));
}

/** A failed job goes back to the queue (its segments cleared in the same transaction). */
export async function requeueFailedTranslationJob(store: Store, _db: Db, episodeId: string, lang: string): Promise<void> {
  await writeSegments(store, episodeId, lang, null, {
    set: { state: 'queued', errors: 0, error: null, notBefore: null, nextChunk: 0 }, activate: true,
    only: (job) => job['state'] === 'failed',
    cond: { expr: '#cst = :cst', names: { '#cst': 'state' }, values: { ':cst': 'failed' } },
  });
}

/** /mod queue: not done, or changed in the last 7 days; newest requested first; at most 100; with the episode title. */
export async function translationQueueRows(store: Store, _db: Db): Promise<{ episode_id: string; target_lang: string; state: string; title: string | null; error: string | null; requested_at: Date | string }[]> {
  const { items: refs } = await queryAll(store, 'main', {
    IndexName: K.INDEX.G5, KeyConditionExpression: 'G5PK = :r', ExpressionAttributeValues: { ':r': K.G5('trjob', 'all', new Date(0).toISOString()).G5PK },
    ScanIndexForward: false,
  });
  const weekAgo = iso(nowMs(store) - 7 * DAY_MS);
  const jobs: Item[] = [];
  for (let i = 0; i < refs.length && jobs.length < QUEUE_LIMIT; i += 100) {
    for (const j of await getMany(store, 'main', refs.slice(i, i + 100).map(keyOf))) {
      if (jobs.length >= QUEUE_LIMIT) break;
      if (j['state'] !== 'done' || String(j['updatedAt']) > weekAgo) jobs.push(j);
    }
  }
  jobs.sort((a, b) => String(b['requestedAt']).localeCompare(String(a['requestedAt'])));
  const eps = await getMany(store, 'main', [...new Set(jobs.map((j) => String(j['episodeId'])))].map((id) => K.episode(id)));
  const titles = new Map(eps.map((e) => [String(e['id']), str(e['title'])]));
  return jobs.map((j) => ({
    episode_id: String(j['episodeId']), target_lang: String(j['targetLang']), state: String(j['state']),
    title: titles.get(String(j['episodeId'])) ?? null, error: str(j['error']), requested_at: String(j['requestedAt']),
  }));
}

// ---- /mod allow-list

/** Title = the show override's, else the live hosted show's (lane ST, still Postgres), else the newest episode's show title (LB's show META). */
export async function listTranslationShows(store: Store, db: Db): Promise<{ feed_url: string; created_at: Date | string; title: string | null }[]> {
  const items = await partition(store, 'main', K.translationShow('').PK);
  if (items.length === 0) return [];
  const urls = items.map((it) => String(it['feedUrl']));
  const pg = pgOf(db);
  const overrides = await pg.query<{ feed_url: string; title: string | null }>('SELECT feed_url, title FROM show_overrides WHERE feed_url = ANY($1::text[])', [urls]);
  const hosted = await pg.query<{ feed_url: string; title: string | null }>('SELECT feed_url, title FROM hosted_shows WHERE feed_url = ANY($1::text[]) AND deleted_at IS NULL', [urls]);
  const shows = await getMany(store, 'main', urls.map((u) => K.show(u)));
  const firstTitle = (rows: { feed_url: string; title: string | null }[], url: string): string | null => rows.find((r) => r.feed_url === url && r.title !== null)?.title ?? null;
  const newest = new Map(shows.map((s) => [String(s['feedUrl']), str(s['newestTitle'])]));
  return items
    .map((it) => {
      const url = String(it['feedUrl']);
      return { feed_url: url, created_at: String(it['createdAt']), title: firstTitle(overrides, url) ?? firstTitle(hosted, url) ?? newest.get(url) ?? null };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addTranslationShow(store: Store, _db: Db, feedUrl: string, addedBy: string): Promise<void> {
  const item = encode('translationShow', K.translationShow(feedUrl), { feedUrl, addedBy, createdAt: nowIso(store) });
  await unlessCondition(put(store, 'main', item, { condition: 'attribute_not_exists(PK)' }));
}

export async function removeTranslationShow(store: Store, _db: Db, feedUrl: string): Promise<void> {
  await del(store, 'main', K.translationShow(feedUrl));
}
