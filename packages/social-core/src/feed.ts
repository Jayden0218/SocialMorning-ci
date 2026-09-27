/**
 * M4 research R4: the Following feed's rules, shared so the phone can show its owner the
 * same "listened" moment the server will write.
 *   listenItemDue  the first time an episode-day's union crosses 5 min, or finished flips
 *   orderFeed      newest first, stable on (createdAt desc, id desc)
 *   unreadCount    items newer than the last time the feed was opened
 */
export const LISTEN_ITEM_THRESHOLD_MS = 300_000;

export function listenItemDue(prevUnionMs: number, newUnionMs: number, finishedBefore: boolean, finishedNow: boolean, thresholdMs: number = LISTEN_ITEM_THRESHOLD_MS): boolean {
  if (finishedNow && !finishedBefore) return true;
  return prevUnionMs < thresholdMs && newUnionMs >= thresholdMs;
}

export type FeedItem = { id: number; createdAt: number };

export function orderFeed<T extends FeedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
}

export function unreadCount(items: readonly { createdAt: number }[], lastOpenedAt: number | undefined): number {
  if (lastOpenedAt === undefined) return items.length;
  return items.filter((i) => i.createdAt > lastOpenedAt).length;
}
