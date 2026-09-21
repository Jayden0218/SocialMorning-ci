/**
 * The `Downloader` (specs/003-m2-real-client/contracts/downloader.ts) on
 * expo-file-system 58's `DownloadTask` — research R1 (corrected). This is the ONLY
 * file that imports expo-file-system, so the fallback (the legacy module, or
 * fetch + Range) is a one-file swap.
 *
 * API VERIFIED against the installed typings, not recalled (Principle III):
 * `node_modules/expo-file-system/build/NetworkTasks.d.ts` — `DownloadTask`,
 * `downloadAsync`, `pauseAsync`, `resumeAsync`, `cancel`, `savable`,
 * `static fromSavable`, `addListener('progress')`; `Paths.document`; `File`.
 *
 * D0 on build 3 (2026-09-21): a kill AND a network loss both RESTARTED from 0 %.
 * Read the source, not the docs (Principle III):
 *   - `savable()` throws unless the task is `paused`, so saving it on progress
 *     (gap 1) never produced anything; and a task that failed on its own is never
 *     `paused`, so the manager's `pause()` after a network error found no task.
 *   - On Android `resumeData` is just the byte offset as a string
 *     (`FileSystemDownloadTask.kt` `pause()` → `destinationFile.length()`), and
 *     `resume()` sends `Range: bytes=<offset>-`, truncates the file to the offset
 *     and appends; a 200 (server ignored Range) starts over from 0 — which the
 *     manager reports as `no-resume`.
 * So when a row has no resumeData but its partial file is on disk, the offset is
 * the file size. iOS resumeData is an opaque NSURLSession blob; there this stays a
 * restart (noted, not targeted: the gate phone is Android).
 */
import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from 'expo-file-system';
import { Platform } from 'react-native';
import type { Downloader, DownloadRow } from './types';

const DIR = new Directory(Paths.document, 'downloads');

export function downloadPathFor(episodeId: string, enclosureUrl: string, enclosureType?: string): string {
  const ext = extensionFor(enclosureUrl, enclosureType);
  return new File(DIR, `${episodeId}.${ext}`).uri;
}

export function extensionFor(url: string, mime?: string): string {
  const byMime: Record<string, string> = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/wav': 'wav' };
  if (mime && byMime[mime]) return byMime[mime]!;
  const m = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url);
  return m ? m[1]!.toLowerCase() : 'mp3';
}

/**
 * Where to continue from: the saved pause state if there is one, else (Android) the
 * partial file's size, else nothing — a fresh download.
 */
export function resumeStateFor(row: DownloadRow, url: string, file: { exists: boolean; size: number | null; uri: string }, os: string = Platform.OS): DownloadPauseState | undefined {
  if (row.resumeData) return JSON.parse(row.resumeData) as DownloadPauseState;
  if (os !== 'android' || !file.exists || !(file.size !== null && file.size > 0)) return undefined;
  return { url, fileUri: file.uri, isDirectory: false, resumeData: String(file.size) };
}

export function createExpoDownloader(): Downloader {
  const tasks = new Map<string, DownloadTask>();

  function ensureDir(): void {
    if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  }

  return {
    async start(row: DownloadRow, url, onProgress) {
      ensureDir();
      const file = new File(row.filePath);
      const state = resumeStateFor(row, url, file);
      const task = state ? DownloadTask.fromSavable(state) : new DownloadTask(url, file);
      tasks.set(row.episodeId, task);
      const sub = task.addListener('progress', (p) => onProgress(p.bytesWritten, p.totalBytes));
      try {
        const result = state ? await task.resumeAsync() : await task.downloadAsync();
        if (result === null && task.state === 'paused') {
          return { resumeData: JSON.stringify(task.savable()), paused: true };
        }
        return {};
      } finally {
        sub.remove();
        tasks.delete(row.episodeId);
        task.release();
      }
    },
    async pause(episodeId) {
      const task = tasks.get(episodeId);
      if (!task) return undefined;
      await task.pauseAsync();
      return { resumeData: JSON.stringify(task.savable()) };
    },
    async cancel(episodeId) {
      tasks.get(episodeId)?.cancel();
    },
    async remove(filePath) {
      const f = new File(filePath);
      if (f.exists) f.delete();
    },
    async size(filePath) {
      const f = new File(filePath);
      if (!f.exists) return undefined;
      return f.size ?? undefined;
    },
  };
}
