/** contracts/downloader.ts, as the app uses it. */
import type { DownloadRow } from '../storage/types';
export type { DownloadRow };

export interface Downloader {
  /**
   * Starts (or, when `row.resumeData` is set, resumes) the transfer. Resolves when the
   * transfer ends: `{}` on completion, `{ paused: true, resumeData }` when paused by
   * `pause()`. Rejects on a network or disk failure.
   */
  start(row: DownloadRow, url: string, onProgress: (bytesDone: number, bytesTotal: number, resumeData?: string) => void): Promise<{ resumeData?: string; paused?: boolean }>;
  pause(episodeId: string): Promise<{ resumeData: string } | undefined>;
  cancel(episodeId: string): Promise<void>;
  remove(filePath: string): Promise<void>;
  /** Size on disk, or undefined when the file is missing (FR-007). */
  size(filePath: string): Promise<number | undefined>;
}

export interface Network {
  kind(): Promise<'wifi' | 'cellular' | 'none'>;
  /** Calls `fn` on every connectivity change; returns the unsubscribe. Optional: tests and R7's poller do without. */
  onChange?(fn: () => void): () => void;
}
