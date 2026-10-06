// Show page rules: the subscriber line, the Host picks list, and Add all to the queue.
/**
 * M21 US5 (FR-040), pure so it is tested without a screen.
 *
 * - `subscriberLine`: our own count, "1.2k" from 1 000 up; under 10 it reads "New here" (a tiny
 *   number says more about us than about the show).
 * - `hostPicksOf`: the host's picks, in the host's order, among the episodes this phone has.
 * - `addAllToQueue`: the list as shown goes to the end of the queue, in that order, up to the
 *   300 limit (player-core's `enqueue`); what is queued already stays where it is.
 */
import { enqueue, QUEUE_MAX } from '@socialmorning/player-core';

/** "1.2k", "12k", "1.5M"; a plain number under 1 000. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${Math.floor(n / 100) / 10}k`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}k`;
  return `${Math.floor(n / 100_000) / 10}M`;
}

export const NEW_HERE_BELOW = 10;

export function subscriberLine(n: number | undefined): string | undefined {
  if (n === undefined) return undefined;
  if (n < NEW_HERE_BELOW) return 'New here';
  return `${compactNumber(n)} subscribers`;
}

export function hostPicksOf<T extends { id: string }>(episodes: readonly T[], picks: readonly string[] | undefined): T[] {
  if (!picks || picks.length === 0) return [];
  const byId = new Map(episodes.map((e) => [e.id, e]));
  return picks.map((id) => byId.get(id)).filter((e): e is T => e !== undefined);
}

/** The new queue and how many were added; `full` when the limit stopped it before the end of the list. */
export function addAllToQueue(queue: readonly string[], ids: readonly string[]): { queue: string[]; added: number; full: boolean } {
  let q = [...queue];
  let added = 0;
  for (const id of ids) {
    if (q.includes(id)) continue;
    if (q.length >= QUEUE_MAX) return { queue: q, added, full: true };
    const r = enqueue(q, id, 'end');
    if (r.refused) return { queue: q, added, full: true };
    q = r.queue;
    added++;
  }
  return { queue: q, added, full: false };
}

/** What the toast says after Add all. */
export function addAllMessage(r: { added: number; full: boolean }): string {
  if (r.added === 0) return r.full ? 'The queue is full (300). Remove something first.' : 'All of these are in the queue already.';
  const n = r.added === 1 ? '1 episode' : `${r.added} episodes`;
  return r.full ? `Added ${n} to the queue — it is full now (300).` : `Added ${n} to the queue.`;
}
