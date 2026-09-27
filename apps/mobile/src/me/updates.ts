/**
 * Updates (更新, owner 2026-09-27): the newest episodes of every subscribed show in one
 * list, newest first — what the Library tab became. Read from the feed cache, so it
 * shows offline. Hidden shows are left out, as they are everywhere else.
 */
import type { CachedEpisode, Stores } from '../storage/types';

export type UpdateRow = { episode: CachedEpisode; showTitle: string; imageUrl?: string; summary: string };

/** Show notes as one plain line: tags and entities out, spaces squeezed. */
export function plainSummary(html: string | undefined, max = 160): string {
  if (!html) return '';
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function latestUpdates(stores: Pick<Stores, 'subscriptions' | 'feeds'>, hidden: ReadonlySet<string>, perShow = 5, limit = 50): UpdateRow[] {
  const rows: UpdateRow[] = [];
  for (const { feedUrl } of stores.subscriptions.list()) {
    if (hidden.has(feedUrl)) continue;
    const show = stores.feeds.getShow(feedUrl);
    for (const e of stores.feeds.listEpisodes(feedUrl).slice(0, perShow)) {
      const img = e.imageUrl ?? show?.imageUrl;
      rows.push({ episode: e, showTitle: show?.title ?? feedUrl, ...(img ? { imageUrl: img } : {}), summary: plainSummary(e.shownotesHtml) });
    }
  }
  return rows.sort((a, b) => (b.episode.publishedAt ?? 0) - (a.episode.publishedAt ?? 0)).slice(0, limit);
}
