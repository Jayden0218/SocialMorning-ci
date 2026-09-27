import type { DownloadView, Queue } from './types';

export const QUEUE_MAX = 300;

/**
 * FR-008/FR-011. `end` when full → refused; `front` when full → the last item is
 * evicted (the target app's playlist rule). An episode already queued moves rather
 * than duplicating. Guard G1: drop the cap and the 301st is accepted.
 */
export function enqueue(queue: Queue, episodeId: string, where: 'end' | 'front'): { queue: Queue; refused?: 'full'; evicted?: string } {
  const without = queue.filter((id) => id !== episodeId);
  if (where === 'end') {
    if (without.length >= QUEUE_MAX) return { queue, refused: 'full' };
    return { queue: [...without, episodeId] };
  }
  const next = [episodeId, ...without];
  if (next.length > QUEUE_MAX) {
    const evicted = next[next.length - 1]!;
    return { queue: next.slice(0, QUEUE_MAX), evicted };
  }
  return { queue: next };
}

export function move(queue: Queue, episodeId: string, to: number): Queue {
  const from = queue.indexOf(episodeId);
  if (from === -1) return queue;
  const target = Math.min(queue.length - 1, Math.max(0, to));
  if (target === from) return queue;
  const next = [...queue];
  next.splice(from, 1);
  next.splice(target, 0, episodeId);
  return next;
}

export function remove(queue: Queue, episodeId: string): Queue {
  return queue.includes(episodeId) ? queue.filter((id) => id !== episodeId) : queue;
}

/**
 * FR-009/FR-010: the first item that can play now. Online: the first item. Offline:
 * the first with a complete download; the ones before it are `skipped` — reported,
 * NOT removed (guard G2). Never mutates the queue.
 */
export function nextPlayable(queue: Queue, downloads: readonly DownloadView[], online: boolean): { next?: string; skipped: string[] } {
  if (online) return queue.length > 0 ? { next: queue[0]!, skipped: [] } : { skipped: [] };
  const complete = new Set(downloads.filter((d) => d.state === 'complete').map((d) => d.episodeId));
  const skipped: string[] = [];
  for (const id of queue) {
    if (complete.has(id)) return { next: id, skipped };
    skipped.push(id);
  }
  return { skipped };
}
