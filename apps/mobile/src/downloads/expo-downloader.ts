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
 * NOT VERIFIED until quickstart D0: that a task restored with `fromSavable`
 * after a process restart continues from the bytes on disk.
 */
import { Directory, DownloadTask, File, Paths, type DownloadPauseState } from 'expo-file-system';
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

export function createExpoDownloader(): Downloader {
  const tasks = new Map<string, DownloadTask>();

  function ensureDir(): void {
    if (!DIR.exists) DIR.create({ intermediates: true, idempotent: true });
  }

  return {
    async start(row: DownloadRow, url, onProgress) {
      ensureDir();
      const file = new File(row.filePath);
      let task: DownloadTask;
      if (row.resumeData) {
        const state: DownloadPauseState = JSON.parse(row.resumeData) as DownloadPauseState;
        task = DownloadTask.fromSavable(state);
      } else {
        task = new DownloadTask(url, file);
      }
      tasks.set(row.episodeId, task);
      const sub = task.addListener('progress', (p) => {
        // Persist whatever the task can save mid-flight, so a process kill (which never
        // pauses) has the best chance of resuming (gap 1, 2026-09-21). Empty if the
        // native side only fills `resumeData` on pause — then a kill restarts, and the
        // manager says so.
        let saved: string | undefined;
        try { const sv = task.savable(); if (sv.resumeData) saved = JSON.stringify(sv); } catch { /* not savable yet */ }
        onProgress(p.bytesWritten, p.totalBytes, saved);
      });
      try {
        const result = row.resumeData ? await task.resumeAsync() : await task.downloadAsync();
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
