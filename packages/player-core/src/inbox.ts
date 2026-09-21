import type { InboxInput } from './types';

/**
 * FR-018..020 / research R8. An episode is in the inbox iff its show is subscribed,
 * it was published at or after the subscription (guard G5: without this a new
 * subscription floods the inbox with its back catalogue), it has no position row,
 * no complete download, and has not left for a recorded reason. Newest first;
 * undated episodes are never "new".
 */
export function inboxOf(input: InboxInput): string[] {
  const subscribedAt = new Map(input.subscriptions.map((s) => [s.feedUrl, s.subscribedAt]));
  return input.episodes
    .filter((e) => {
      const since = subscribedAt.get(e.feedUrl);
      if (since === undefined || e.publishedAt === undefined) return false;
      if (e.publishedAt < since) return false;

      if (input.positions.has(e.id)) return false;
      if (input.completeDownloads.has(e.id)) return false;
      if (input.left.has(e.id)) return false;
      return true;
    })
    .sort((a, b) => b.publishedAt! - a.publishedAt!)
    .map((e) => e.id);
}
