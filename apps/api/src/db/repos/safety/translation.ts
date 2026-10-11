// Translation queries: the Groq usage ledger, translation jobs, finished translations and the /mod allow-list.
import type { GroqModel } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import type { JobState, TargetLang } from '../../../translate/job.ts';

export type TranslationJobRow = {
  episode_id: string; target_lang: TargetLang; state: JobState; source_lang: string | null; segments: unknown;
  next_chunk: number; audio_s: number; tokens: number; errors: number;
};

export type OfferedEpisodeRow = { id: string; feed_url: string; enclosure_url: string; duration_ms: number | null; guid: string };

/** Today's (UTC) ledger row for one model. */
async function groqUsageTodayRowsPg(db: Db, model: GroqModel): Promise<{ requests: number; audio_s: number; tokens: number }[]> {
  return db.query<{ requests: number; audio_s: number; tokens: number }>(
    "SELECT requests, audio_s, tokens FROM groq_usage WHERE day = (now() AT TIME ZONE 'UTC')::date AND model = $1", [model]);
}

async function addGroqUsagePg(db: Db, model: GroqModel, requests: number, audioS: number, tokens: number): Promise<void> {
  await db.query(
    `INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ((now() AT TIME ZONE 'UTC')::date, $1, $2, $3, $4)
     ON CONFLICT (day, model) DO UPDATE SET requests = groq_usage.requests + EXCLUDED.requests,
       audio_s = groq_usage.audio_s + EXCLUDED.audio_s, tokens = groq_usage.tokens + EXCLUDED.tokens`,
    [model, requests, audioS, tokens]);
}

/** The episode, if its show is on the translation allow-list. */
async function offeredEpisodeRowsPg(db: Db, episodeId: string): Promise<OfferedEpisodeRow[]> {
  return db.query<{ id: string; feed_url: string; enclosure_url: string; duration_ms: number | null; guid: string }>(
    'SELECT e.id, e.feed_url, e.enclosure_url, e.duration_ms, e.guid FROM episodes e JOIN translation_shows s ON s.feed_url = e.feed_url WHERE e.id = $1', [episodeId]);
}

async function insertTranslationJobPg(db: Db, episodeId: string, lang: TargetLang): Promise<void> {
  await db.query('INSERT INTO translation_jobs (episode_id, target_lang) VALUES ($1, $2) ON CONFLICT (episode_id, target_lang) DO NOTHING', [episodeId, lang]);
}

/** Every open job requested no later than this one, with its episode length. */
async function jobsAheadRowsPg(db: Db, episodeId: string, lang: TargetLang): Promise<{ duration_ms: number | null; state: JobState; next_chunk: number; is_me: boolean }[]> {
  return db.query<{ duration_ms: number | null; state: JobState; next_chunk: number; is_me: boolean }>(
    `SELECT e.duration_ms, j.state, j.next_chunk, (j.episode_id = $1 AND j.target_lang = $2) AS is_me
       FROM translation_jobs j LEFT JOIN episodes e ON e.id = j.episode_id
      WHERE j.state IN ('queued','transcribing','translating')
        AND j.requested_at <= coalesce((SELECT requested_at FROM translation_jobs WHERE episode_id = $1 AND target_lang = $2), now())`, [episodeId, lang]);
}

async function translatedLinesRowsPg(db: Db, episodeId: string, lang: TargetLang): Promise<{ lines: unknown }[]> {
  return db.query<{ lines: unknown }>('SELECT lines FROM transcripts_translated WHERE episode_id = $1 AND target_lang = $2', [episodeId, lang]);
}

async function translationJobStateRowsPg(db: Db, episodeId: string, lang: TargetLang): Promise<{ state: JobState }[]> {
  return db.query<{ state: JobState }>('SELECT state FROM translation_jobs WHERE episode_id = $1 AND target_lang = $2', [episodeId, lang]);
}

/** One more error; the job fails once `maxErrors` is reached. */
async function recordTranslationJobErrorPg(db: Db, episodeId: string, lang: TargetLang, errors: number, reason: string, maxErrors: number): Promise<void> {
  await db.query(
    `UPDATE translation_jobs SET errors = $3, error = $4, state = CASE WHEN $3 >= ${maxErrors} THEN 'failed' ELSE state END, updated_at = now()
      WHERE episode_id = $1 AND target_lang = $2`, [episodeId, lang, errors, reason]);
}

async function failTranslationJobPg(db: Db, episodeId: string, lang: TargetLang, reason: string): Promise<void> {
  await db.query("UPDATE translation_jobs SET state = 'failed', error = $3, updated_at = now() WHERE episode_id = $1 AND target_lang = $2", [episodeId, lang, reason]);
}

/** Up to `limit` jobs that may move now, oldest first. */
async function movableTranslationJobsPg(db: Db, limit: number): Promise<TranslationJobRow[]> {
  return db.query<TranslationJobRow>(
    `SELECT episode_id, target_lang, state, source_lang, segments, next_chunk, audio_s, tokens, errors FROM translation_jobs
      WHERE state IN ('queued','transcribing','translating') AND (not_before IS NULL OR not_before <= now())
      ORDER BY requested_at, episode_id LIMIT ${limit}`);
}

async function translationEpisodeRowsPg(db: Db, episodeId: string): Promise<{ feed_url: string; guid: string; enclosure_url: string; duration_ms: number | null }[]> {
  return db.query<{ feed_url: string; guid: string; enclosure_url: string; duration_ms: number | null }>(
    'SELECT feed_url, guid, enclosure_url, duration_ms FROM episodes WHERE id = $1', [episodeId]);
}

/** The publisher's own transcript: straight to translating. */
async function saveFeedTranscriptSegmentsPg(db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, sourceLang: string | null): Promise<void> {
  await db.query("UPDATE translation_jobs SET segments = $3::text::jsonb, source_lang = $4, state = 'translating', next_chunk = 0, updated_at = now() WHERE episode_id = $1 AND target_lang = $2",
    [episodeId, lang, segmentsJson, sourceLang]);
}

async function markTranslationJobTranscribingPg(db: Db, episodeId: string, lang: TargetLang, sourceLang: string | null): Promise<void> {
  await db.query("UPDATE translation_jobs SET state = 'transcribing', source_lang = $3, updated_at = now() WHERE episode_id = $1 AND target_lang = $2", [episodeId, lang, sourceLang]);
}

async function saveTranscribedSegmentsPg(db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, billed: number): Promise<void> {
  await db.query("UPDATE translation_jobs SET segments = $3::text::jsonb, state = 'translating', next_chunk = 0, audio_s = audio_s + $4, updated_at = now() WHERE episode_id = $1 AND target_lang = $2",
    [episodeId, lang, segmentsJson, billed]);
}

async function saveTranslatedChunkPg(db: Db, episodeId: string, lang: TargetLang, segmentsJson: string, next: number, tokens: number): Promise<void> {
  await db.query('UPDATE translation_jobs SET segments = $3::text::jsonb, next_chunk = $4, tokens = tokens + $5, updated_at = now() WHERE episode_id = $1 AND target_lang = $2',
    [episodeId, lang, segmentsJson, next, tokens]);
}

async function parkTranslationJobPg(db: Db, episodeId: string, lang: TargetLang, retryAfterS: string): Promise<void> {
  await db.query("UPDATE translation_jobs SET not_before = now() + ($3 || ' seconds')::interval, updated_at = now() WHERE episode_id = $1 AND target_lang = $2",
    [episodeId, lang, retryAfterS]);
}

/** Store the finished translation and close the job, in one transaction. */
async function finishTranslationJobPg(db: Db, episodeId: string, lang: TargetLang, linesJson: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO transcripts_translated (episode_id, target_lang, lines) VALUES ($1, $2, $3::text::jsonb)
       ON CONFLICT (episode_id, target_lang) DO UPDATE SET lines = EXCLUDED.lines, made_at = now()`, [episodeId, lang, linesJson]);
    await tx.query("UPDATE translation_jobs SET state = 'done', segments = NULL, updated_at = now() WHERE episode_id = $1 AND target_lang = $2", [episodeId, lang]);
  });
}

// ---- /mod

async function listTranslationShowsPg(db: Db): Promise<{ feed_url: string; created_at: Date | string; title: string | null }[]> {
  return db.query<{ feed_url: string; created_at: Date | string; title: string | null }>(
    `SELECT s.feed_url, s.created_at,
            coalesce(o.title, h.title, (SELECT e.show_title FROM episodes e WHERE e.feed_url = s.feed_url AND e.show_title IS NOT NULL ORDER BY e.published_at DESC NULLS LAST LIMIT 1)) AS title
       FROM translation_shows s
       LEFT JOIN show_overrides o ON o.feed_url = s.feed_url
       LEFT JOIN hosted_shows h ON h.feed_url = s.feed_url AND h.deleted_at IS NULL
      ORDER BY s.created_at DESC`);
}

async function addTranslationShowPg(db: Db, feedUrl: string, addedBy: string): Promise<void> {
  await db.query('INSERT INTO translation_shows (feed_url, added_by) VALUES ($1, $2) ON CONFLICT (feed_url) DO NOTHING', [feedUrl, addedBy]);
}

async function removeTranslationShowPg(db: Db, feedUrl: string): Promise<void> {
  await db.query('DELETE FROM translation_shows WHERE feed_url = $1', [feedUrl]);
}

async function utcDayRowsPg(db: Db): Promise<{ day: string }[]> {
  return db.query<{ day: string }>("SELECT (now() AT TIME ZONE 'UTC')::date::text AS day");
}

async function groqUsageTodayAllPg(db: Db): Promise<{ model: string; requests: number; audio_s: number; tokens: number }[]> {
  return db.query<{ model: string; requests: number; audio_s: number; tokens: number }>(
    "SELECT model, requests, audio_s, tokens FROM groq_usage WHERE day = (now() AT TIME ZONE 'UTC')::date");
}

async function translationQueueRowsPg(db: Db): Promise<{ episode_id: string; target_lang: string; state: string; title: string | null; error: string | null; requested_at: Date | string }[]> {
  return db.query<{ episode_id: string; target_lang: string; state: string; title: string | null; error: string | null; requested_at: Date | string }>(
    `SELECT j.episode_id, j.target_lang, j.state, e.title, j.error, j.requested_at FROM translation_jobs j LEFT JOIN episodes e ON e.id = j.episode_id
      WHERE j.state <> 'done' OR j.updated_at > now() - interval '7 days' ORDER BY j.requested_at DESC LIMIT 100`);
}

/** A failed job goes back to the queue. */
async function requeueFailedTranslationJobPg(db: Db, episodeId: string, lang: string): Promise<void> {
  await db.query("UPDATE translation_jobs SET state = 'queued', errors = 0, error = NULL, not_before = NULL, segments = NULL, next_chunk = 0, updated_at = now() WHERE episode_id = $1 AND target_lang = $2 AND state = 'failed'", [episodeId, lang]);
}

// M26 lane SF: each export runs its Postgres body above, or its DynamoDB body (ddb/translation.ts) when a Store is attached.
export const groqUsageTodayRows = dual('sf/translation', 'groqUsageTodayRows', groqUsageTodayRowsPg);
export const addGroqUsage = dual('sf/translation', 'addGroqUsage', addGroqUsagePg);
export const offeredEpisodeRows = dual('sf/translation', 'offeredEpisodeRows', offeredEpisodeRowsPg);
export const insertTranslationJob = dual('sf/translation', 'insertTranslationJob', insertTranslationJobPg);
export const jobsAheadRows = dual('sf/translation', 'jobsAheadRows', jobsAheadRowsPg);
export const translatedLinesRows = dual('sf/translation', 'translatedLinesRows', translatedLinesRowsPg);
export const translationJobStateRows = dual('sf/translation', 'translationJobStateRows', translationJobStateRowsPg);
export const recordTranslationJobError = dual('sf/translation', 'recordTranslationJobError', recordTranslationJobErrorPg);
export const failTranslationJob = dual('sf/translation', 'failTranslationJob', failTranslationJobPg);
export const movableTranslationJobs = dual('sf/translation', 'movableTranslationJobs', movableTranslationJobsPg);
export const translationEpisodeRows = dual('sf/translation', 'translationEpisodeRows', translationEpisodeRowsPg);
export const saveFeedTranscriptSegments = dual('sf/translation', 'saveFeedTranscriptSegments', saveFeedTranscriptSegmentsPg);
export const markTranslationJobTranscribing = dual('sf/translation', 'markTranslationJobTranscribing', markTranslationJobTranscribingPg);
export const saveTranscribedSegments = dual('sf/translation', 'saveTranscribedSegments', saveTranscribedSegmentsPg);
export const saveTranslatedChunk = dual('sf/translation', 'saveTranslatedChunk', saveTranslatedChunkPg);
export const parkTranslationJob = dual('sf/translation', 'parkTranslationJob', parkTranslationJobPg);
export const finishTranslationJob = dual('sf/translation', 'finishTranslationJob', finishTranslationJobPg);
export const listTranslationShows = dual('sf/translation', 'listTranslationShows', listTranslationShowsPg);
export const addTranslationShow = dual('sf/translation', 'addTranslationShow', addTranslationShowPg);
export const removeTranslationShow = dual('sf/translation', 'removeTranslationShow', removeTranslationShowPg);
export const utcDayRows = dual('sf/translation', 'utcDayRows', utcDayRowsPg);
export const groqUsageTodayAll = dual('sf/translation', 'groqUsageTodayAll', groqUsageTodayAllPg);
export const translationQueueRows = dual('sf/translation', 'translationQueueRows', translationQueueRowsPg);
export const requeueFailedTranslationJob = dual('sf/translation', 'requeueFailedTranslationJob', requeueFailedTranslationJobPg);
