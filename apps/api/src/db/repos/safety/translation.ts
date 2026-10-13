// Translation: the Groq usage ledger, translation jobs, finished translations and the /mod allow-list.
import { viaStore } from '../../backend.ts';
import type { JobState, TargetLang } from '../../../translate/job.ts';

export type TranslationJobRow = {
  episode_id: string; target_lang: TargetLang; state: JobState; source_lang: string | null; segments: unknown;
  next_chunk: number; audio_s: number; tokens: number; errors: number;
};

export type OfferedEpisodeRow = { id: string; feed_url: string; enclosure_url: string; duration_ms: number | null; guid: string };

// DynamoDB bodies: ddb/translation.ts (db/backend.ts).
export const groqUsageTodayRows = viaStore<typeof import('./ddb/translation.ts').groqUsageTodayRows>('sf/translation', 'groqUsageTodayRows');
export const addGroqUsage = viaStore<typeof import('./ddb/translation.ts').addGroqUsage>('sf/translation', 'addGroqUsage');
export const offeredEpisodeRows = viaStore<typeof import('./ddb/translation.ts').offeredEpisodeRows>('sf/translation', 'offeredEpisodeRows');
export const insertTranslationJob = viaStore<typeof import('./ddb/translation.ts').insertTranslationJob>('sf/translation', 'insertTranslationJob');
export const jobsAheadRows = viaStore<typeof import('./ddb/translation.ts').jobsAheadRows>('sf/translation', 'jobsAheadRows');
export const translatedLinesRows = viaStore<typeof import('./ddb/translation.ts').translatedLinesRows>('sf/translation', 'translatedLinesRows');
export const translationJobStateRows = viaStore<typeof import('./ddb/translation.ts').translationJobStateRows>('sf/translation', 'translationJobStateRows');
export const recordTranslationJobError = viaStore<typeof import('./ddb/translation.ts').recordTranslationJobError>('sf/translation', 'recordTranslationJobError');
export const failTranslationJob = viaStore<typeof import('./ddb/translation.ts').failTranslationJob>('sf/translation', 'failTranslationJob');
export const movableTranslationJobs = viaStore<typeof import('./ddb/translation.ts').movableTranslationJobs>('sf/translation', 'movableTranslationJobs');
export const translationEpisodeRows = viaStore<typeof import('./ddb/translation.ts').translationEpisodeRows>('sf/translation', 'translationEpisodeRows');
export const saveFeedTranscriptSegments = viaStore<typeof import('./ddb/translation.ts').saveFeedTranscriptSegments>('sf/translation', 'saveFeedTranscriptSegments');
export const markTranslationJobTranscribing = viaStore<typeof import('./ddb/translation.ts').markTranslationJobTranscribing>('sf/translation', 'markTranslationJobTranscribing');
export const saveTranscribedSegments = viaStore<typeof import('./ddb/translation.ts').saveTranscribedSegments>('sf/translation', 'saveTranscribedSegments');
export const saveTranslatedChunk = viaStore<typeof import('./ddb/translation.ts').saveTranslatedChunk>('sf/translation', 'saveTranslatedChunk');
export const parkTranslationJob = viaStore<typeof import('./ddb/translation.ts').parkTranslationJob>('sf/translation', 'parkTranslationJob');
export const finishTranslationJob = viaStore<typeof import('./ddb/translation.ts').finishTranslationJob>('sf/translation', 'finishTranslationJob');
export const listTranslationShows = viaStore<typeof import('./ddb/translation.ts').listTranslationShows>('sf/translation', 'listTranslationShows');
export const addTranslationShow = viaStore<typeof import('./ddb/translation.ts').addTranslationShow>('sf/translation', 'addTranslationShow');
export const removeTranslationShow = viaStore<typeof import('./ddb/translation.ts').removeTranslationShow>('sf/translation', 'removeTranslationShow');
export const utcDayRows = viaStore<typeof import('./ddb/translation.ts').utcDayRows>('sf/translation', 'utcDayRows');
export const groqUsageTodayAll = viaStore<typeof import('./ddb/translation.ts').groqUsageTodayAll>('sf/translation', 'groqUsageTodayAll');
export const translationQueueRows = viaStore<typeof import('./ddb/translation.ts').translationQueueRows>('sf/translation', 'translationQueueRows');
export const requeueFailedTranslationJob = viaStore<typeof import('./ddb/translation.ts').requeueFailedTranslationJob>('sf/translation', 'requeueFailedTranslationJob');
