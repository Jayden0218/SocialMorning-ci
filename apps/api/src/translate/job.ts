// Moves translation jobs forward one Groq call at a time, inside the free-tier budget, and serves finished translations.
/**
 * M22 US13 (FR-038–FR-041; research R1; data-model "State: translation job"; guards G-M22-6/7).
 *
 *   queued ──(budget free)──► transcribing ──(segments saved)──► translating ──(last chunk)──► done
 *      │  429 → not_before = now + retry-after; budget spent → stays, retried next hour
 *      └── feed has a timed transcript ──► translating (no speech-to-text)      3 errors ──► failed
 *
 * The hourly internal step `translate` calls `stepTranslation`: it makes at most ONE Groq call
 * (or reads one feed transcript), always after `canSpend` said yes against the `groq_usage` ledger
 * (90 % of each free limit), and records what it spent. Without GROQ_API_KEY nothing moves.
 * A finished translation is stored once (`transcripts_translated`) and shared by every listener.
 */
import { TRANSLATOR, WHISPER, canSpend, chunkLines, estimateTokens, fitsEver, translationCost, type GroqModel, type GroqUsage } from '@socialmorning/social-core';
import type { Db } from '../db/db.ts';
import { fetchFeed } from '../catalog/feed.ts';
import {
  addGroqUsage, failTranslationJob, finishTranslationJob, groqUsageTodayRows, insertTranslationJob, jobsAheadRows,
  markTranslationJobTranscribing, movableTranslationJobs, offeredEpisodeRows, parkTranslationJob, recordTranslationJobError,
  saveFeedTranscriptSegments, saveTranscribedSegments, saveTranslatedChunk, translatedLinesRows, translationEpisodeRows,
  translationJobStateRows, type TranslationJobRow,
} from '../db/repos/safety/translation.ts';
import { GroqRateLimited, MIN_BILLED_AUDIO_S, type Groq, type Segment } from './groq.ts';

export type TargetLang = 'en' | 'zh-Hans';
export type JobState = 'queued' | 'transcribing' | 'translating' | 'done' | 'failed';
export type TranslatedRow = { s: number; e: number; o: string; t: string };

/** After this many errors (not 429s, not budget waits) a job is failed with its last reason kept. */
export const MAX_ERRORS = 3;
/** An episode whose length the server does not know is budgeted as an hour. */
export const UNKNOWN_AUDIO_S = 3_600;
/** About 200 tokens a minute of speech → a 2,500-token chunk is about 12 minutes. */
const MINUTES_PER_CHUNK = 12;
const CANDIDATES = 20;

type Job = TranslationJobRow;
type Seg = Segment & { t?: string };

/** Today's (UTC) spend for one model, from the ledger. */
export async function usageToday(db: Db, model: GroqModel): Promise<GroqUsage> {
  const [r] = await groqUsageTodayRows(db, model);
  return { requests: Number(r?.requests ?? 0), audioS: Number(r?.audio_s ?? 0), tokens: Number(r?.tokens ?? 0) };
}

export async function spend(db: Db, model: GroqModel, s: { requests: number; audioS?: number; tokens?: number }): Promise<void> {
  await addGroqUsage(db, model, s.requests, Math.ceil(s.audioS ?? 0), Math.ceil(s.tokens ?? 0));
}

/** The episode, if its show is on the /mod allow-list (FR-038). */
export async function offeredEpisode(db: Db, episodeId: string): Promise<{ id: string; feed_url: string; enclosure_url: string; duration_ms: number | null; guid: string } | undefined> {
  const [e] = await offeredEpisodeRows(db, episodeId);
  return e;
}

/** Queue it (idempotent). A failed job is queued again only by /mod — not by every tap. */
export async function requestTranslation(db: Db, episodeId: string, lang: TargetLang): Promise<void> {
  await insertTranslationJob(db, episodeId, lang);
}

/** Hours until ready, roughly: one run a hour, one call a run, for every job ahead of this one and this one. */
export async function etaHours(db: Db, episodeId: string, lang: TargetLang): Promise<number> {
  const rows = await jobsAheadRows(db, episodeId, lang);
  let hours = 0;
  for (const r of rows) {
    const minutes = r.duration_ms ? Number(r.duration_ms) / 60_000 : UNKNOWN_AUDIO_S / 60;
    const chunks = Math.max(1, Math.ceil(minutes / MINUTES_PER_CHUNK));
    hours += r.state === 'translating' ? Math.max(1, chunks - Number(r.next_chunk)) : 1 + chunks;
  }
  return Math.max(1, hours);
}

export type TranslationAnswer = { state: 'done'; lines: TranslatedRow[] } | { state: 'none' } | { state: 'failed' } | { state: 'queued' | 'transcribing' | 'translating'; etaHours: number };

export async function translationFor(db: Db, episodeId: string, lang: TargetLang): Promise<TranslationAnswer> {
  const [done] = await translatedLinesRows(db, episodeId, lang);
  if (done) return { state: 'done', lines: (typeof done.lines === 'string' ? JSON.parse(done.lines) : done.lines) as TranslatedRow[] };
  const [job] = await translationJobStateRows(db, episodeId, lang);
  if (!job) return { state: 'none' };
  if (job.state === 'failed' || job.state === 'done') return { state: 'failed' };
  return { state: job.state, etaHours: await etaHours(db, episodeId, lang) };
}

const segmentsOf = (v: unknown): Seg[] => (typeof v === 'string' ? JSON.parse(v) : v) as Seg[];

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const seconds = (t: string): number | undefined => {
  const m = TIME.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000 : undefined;
};

/**
 * A publisher's timed transcript as segments: SRT or WebVTT cues, or Podcasting 2.0 JSON
 * (`{ segments: [{ startTime, endTime, body }] }`). Anything unreadable gives no segments.
 * (The phone reads the same formats with player-core's parser; the server keeps its own small copy
 * so the API does not depend on the player package.)
 */
export function parseTimedTranscript(body: string, type: string): Seg[] {
  if (type === 'application/json') {
    try {
      const j = JSON.parse(body) as { segments?: { startTime?: unknown; endTime?: unknown; body?: unknown }[] };
      return (j.segments ?? [])
        .filter((x) => typeof x.startTime === 'number' && typeof x.body === 'string' && x.body.trim().length > 0)
        .map((x) => ({ start: x.startTime as number, end: typeof x.endTime === 'number' ? x.endTime : (x.startTime as number) + 5, text: (x.body as string).trim() }));
    } catch { return []; }
  }
  const out: Seg[] = [];
  for (const block of body.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at]!.split('-->');
    const start = seconds(a ?? '');
    const end = seconds(b ?? '');
    const text = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (start === undefined || text.length === 0) continue;
    out.push({ start, end: end ?? start + 5, text });
  }
  return out;
}

/** A timed transcript the publisher already ships (`podcast:transcript`), as segments — or undefined. */
export async function feedTranscript(db: Db, f: typeof fetch, feedUrl: string, guid: string): Promise<{ segments: Seg[]; language?: string } | undefined> {
  try {
    const { feed } = await fetchFeed(db, f, feedUrl);
    const ep = feed.episodes.find((e) => e.guid === guid);
    const timed = (ep?.transcripts ?? [])
      .map((t) => ({ url: t.url, type: (t.type ?? '').toLowerCase().split(';')[0]!.trim(), language: t.language }))
      .find((t) => ['application/srt', 'application/x-subrip', 'text/srt', 'text/vtt', 'application/json'].includes(t.type));
    if (!timed) return undefined;
    const res = await f(timed.url, { headers: { accept: timed.type } });
    if (!res.ok) return undefined;
    const segments = parseTimedTranscript(await res.text(), timed.type);
    if (segments.length === 0) return undefined;
    const language = timed.language ?? feed.show.language;
    return { segments, ...(language ? { language } : {}) };
  } catch {
    return undefined;
  }
}

async function showLanguage(db: Db, f: typeof fetch, feedUrl: string): Promise<string | undefined> {
  try { return (await fetchFeed(db, f, feedUrl)).feed.show.language; } catch { return undefined; }
}

export type StepResult = { did: 'nothing' | 'no_key' | 'waiting' | 'feed_transcript' | 'transcribed' | 'translated' | 'done' | 'rate_limited' | 'error' | 'failed'; episodeId?: string };

async function fail(db: Db, j: Job, reason: string): Promise<StepResult> {
  const errors = j.errors + 1;
  await recordTranslationJobError(db, j.episode_id, j.target_lang, errors, reason.slice(0, 500), MAX_ERRORS);
  return { did: errors >= MAX_ERRORS ? 'failed' : 'error', episodeId: j.episode_id };
}

async function failNow(db: Db, j: Job, reason: string): Promise<StepResult> {
  await failTranslationJob(db, j.episode_id, j.target_lang, reason);
  return { did: 'failed', episodeId: j.episode_id };
}

/**
 * One step for the whole queue: the oldest job that can move inside today's budget moves once.
 * `catalogFetch` reads feeds and feed transcripts; `groq` is the only way to Groq.
 */
export async function stepTranslation(db: Db, groq: Groq, catalogFetch: typeof fetch): Promise<StepResult> {
  if (!groq.ready) return { did: 'no_key' };
  const jobs = await movableTranslationJobs(db, CANDIDATES);
  if (jobs.length === 0) return { did: 'nothing' };
  let waited = false;
  for (const j of jobs) {
    const r = await advance(db, groq, catalogFetch, j);
    if (r.did !== 'waiting') return r;
    waited = true;
  }
  return { did: waited ? 'waiting' : 'nothing' };
}

async function advance(db: Db, groq: Groq, catalogFetch: typeof fetch, j: Job): Promise<StepResult> {
  if (j.segments === null || j.state === 'queued' || j.state === 'transcribing') {
    const [ep] = await translationEpisodeRows(db, j.episode_id);
    if (!ep) return failNow(db, j, 'The episode is no longer known.');
    // A creator's own transcript first (FR-039: speech-to-text only when there is none).
    const own = await feedTranscript(db, catalogFetch, ep.feed_url, ep.guid);
    if (own) {
      await saveFeedTranscriptSegments(db, j.episode_id, j.target_lang, JSON.stringify(own.segments), own.language ?? null);
      return { did: 'feed_transcript', episodeId: j.episode_id };
    }
    const audioS = ep.duration_ms ? Math.ceil(Number(ep.duration_ms) / 1000) : UNKNOWN_AUDIO_S;
    const need = { audioS: Math.max(MIN_BILLED_AUDIO_S, audioS) };
    // Longer than the hourly audio budget: waiting never helps.
    if (!fitsEver(WHISPER, need)) return failNow(db, j, 'The episode is too long for the free speech-to-text limit.');
    // G-M22-6: no call unless it keeps every limit at or under 90 %.
    if (!canSpend(await usageToday(db, WHISPER), WHISPER, need)) return { did: 'waiting' };
    const lang = j.source_lang ?? (await showLanguage(db, catalogFetch, ep.feed_url)) ?? null;
    await markTranslationJobTranscribing(db, j.episode_id, j.target_lang, lang);
    try {
      const out = await groq.transcribe(ep.enclosure_url, lang ?? undefined);
      const billed = Math.max(MIN_BILLED_AUDIO_S, Math.ceil(out.durationS || audioS));
      await spend(db, WHISPER, { requests: 1, audioS: billed });
      if (out.segments.length === 0) return failNow(db, j, 'Speech-to-text found no words.');
      await saveTranscribedSegments(db, j.episode_id, j.target_lang, JSON.stringify(out.segments), billed);
      return { did: 'transcribed', episodeId: j.episode_id };
    } catch (e) {
      return onError(db, j, WHISPER, e);
    }
  }

  // translating
  const segs = segmentsOf(j.segments);
  const chunks = chunkLines(segs.map((s, i) => ({ id: i, text: s.text })));
  const chunk = chunks[j.next_chunk];
  if (!chunk) return finish(db, j, segs);
  const need = { tokens: translationCost(chunk.reduce((n, l) => n + estimateTokens(l.text), 0)) };
  if (!fitsEver(TRANSLATOR, need)) return failNow(db, j, 'One transcript line is too long to translate.');
  if (!canSpend(await usageToday(db, TRANSLATOR), TRANSLATOR, need)) return { did: 'waiting' };
  try {
    const out = await groq.translate(chunk, j.source_lang ?? undefined, j.target_lang);
    const tokens = out.tokens > 0 ? out.tokens : need.tokens;
    await spend(db, TRANSLATOR, { requests: 1, tokens });
    const ids = new Set(chunk.map((l) => l.id));
    for (const l of out.lines) if (ids.has(l.id) && segs[l.id]) segs[l.id]!.t = l.text;
    const next = j.next_chunk + 1;
    await saveTranslatedChunk(db, j.episode_id, j.target_lang, JSON.stringify(segs), next, tokens);
    if (next >= chunks.length) return finish(db, { ...j, next_chunk: next }, segs);
    return { did: 'translated', episodeId: j.episode_id };
  } catch (e) {
    return onError(db, j, TRANSLATOR, e);
  }
}

async function onError(db: Db, j: Job, model: GroqModel, e: unknown): Promise<StepResult> {
  if (e instanceof GroqRateLimited) {
    // Groq counted the attempt; park the job until it says.
    await spend(db, model, { requests: 1 });
    await parkTranslationJob(db, j.episode_id, j.target_lang, String(e.retryAfterS));
    return { did: 'rate_limited', episodeId: j.episode_id };
  }
  await spend(db, model, { requests: 1 });
  return fail(db, j, e instanceof Error ? e.message : String(e));
}

async function finish(db: Db, j: Job, segs: Seg[]): Promise<StepResult> {
  const lines: TranslatedRow[] = segs.map((s) => ({ s: Math.round(s.start * 1000), e: Math.round(s.end * 1000), o: s.text, t: s.t ?? '' }));
  await finishTranslationJob(db, j.episode_id, j.target_lang, JSON.stringify(lines));
  return { did: 'done', episodeId: j.episode_id };
}
