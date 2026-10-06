// Data shapes for the queue, downloads, sleep timer, inbox and chapters.
/** Types from specs/003-m2-real-client/contracts/player-core.ts. */
export type Queue = readonly string[]; // episode ids, index 0 = next

export type DownloadState = 'waiting' | 'downloading' | 'paused' | 'complete' | 'failed';
export type DownloadView = { episodeId: string; state: DownloadState; bytesTotal?: number };
export type DownloadCandidate = DownloadView & { requestedAt: number; allowMobile: boolean };
export type NetworkKind = 'wifi' | 'cellular' | 'none';

/** M21: a minutes deadline and the End-of-episode switch may both be armed; the first to fire wins. */
export type SleepTimer = { deadline?: number; minutes?: SleepMinutes; endOfEpisode: boolean };
export type SleepMinutes = 5 | 10 | 15 | 30 | 45 | 60 | 90;
export type SleepChoice = SleepMinutes | 'endOfEpisode' | 'off';

export type InboxInput = {
  episodes: readonly { id: string; feedUrl: string; publishedAt?: number }[];
  subscriptions: readonly { feedUrl: string; subscribedAt: number }[];
  positions: ReadonlySet<string>;
  completeDownloads: ReadonlySet<string>;
  left: ReadonlySet<string>;
};

export type Chapter = { startMs: number; endMs?: number; title?: string; imageUrl?: string; url?: string };
export type TranscriptLine = { startMs: number; endMs?: number; speaker?: string; text: string };
export type Transcript = { lines: TranscriptLine[] } | { text: string };
