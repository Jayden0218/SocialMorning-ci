/**
 * Queueing with the settings applied (M10): where a one-tap "Queue" puts the episode, and
 * whether it starts downloading at once ("Download queued episodes").
 */
import { enqueue } from '@socialmorning/player-core';
import type { DownloadManager } from '@/downloads/manager';
import type { Stores } from '@/storage/types';
import { getPref } from './prefs';

export type QueueResult = { kind: 'full' } | { kind: 'queued'; where: 'end' | 'front'; evicted: boolean; downloading: boolean };

export function queueEpisode(stores: Pick<Stores, 'queue' | 'settings'>, downloads: Pick<DownloadManager, 'request'> | undefined, episodeId: string, now: number, where?: 'end' | 'front'): QueueResult {
  const at = where ?? (getPref(stores.settings, 'queueAddToEnd') ? 'end' : 'front');
  const r = enqueue(stores.queue.list(), episodeId, at);
  if (r.refused) return { kind: 'full' };
  stores.queue.replace(r.queue, now);
  const downloading = downloads !== undefined && getPref(stores.settings, 'autoDownloadQueued');
  if (downloading) void downloads.request(episodeId);
  return { kind: 'queued', where: at, evicted: r.evicted !== undefined, downloading };
}
