// Lists the newest episodes from all your shows in one feed.
/**
 * Updates (更新, owner 2026-09-27): the newest episodes of every subscribed show in one
 * list, newest first — what the Library tab became. Read from the feed cache, so it
 * shows offline. Hidden shows are left out, as they are everywhere else.
 *
 * M21 US4 (FR-036): "Remove from Updates" takes one episode out of this feed only — kept on
 * this phone as a JSON list under `updates.hidden`; the show stays subscribed.
 */
import type { CachedEpisode, SettingsStore, Stores } from '@/storage/types';
import { getPref } from '@/settings/prefs';
import { visibleEpisodes } from '@/feeds/hidden';
import { readList, writeList } from './local-list';

export const UPDATES_HIDDEN_KEY = 'updates.hidden';
/** The list keeps the newest this many; an episode older than that has long left Updates anyway. */
export const UPDATES_HIDDEN_MAX = 500;

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

export function hiddenUpdates(s: Pick<SettingsStore, 'get'>): Set<string> {
  return new Set(readList(s as SettingsStore, UPDATES_HIDDEN_KEY, isId));
}

/** Takes `episodeId` out of the Updates feed on this phone. */
export function hideFromUpdates(s: SettingsStore, episodeId: string): void {
  const list = readList(s, UPDATES_HIDDEN_KEY, isId).filter((id) => id !== episodeId);
  writeList(s, UPDATES_HIDDEN_KEY, [episodeId, ...list].slice(0, UPDATES_HIDDEN_MAX));
}

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

export function latestUpdates(stores: Pick<Stores, 'subscriptions' | 'feeds'> & { settings?: Stores['settings'] }, hidden: ReadonlySet<string>, perShow = 5, limit = 50): UpdateRow[] {
  const rows: UpdateRow[] = [];
  // M10 minor mode (Settings → Minor mode): explicit episodes are left out.
  const noExplicit = stores.settings !== undefined && getPref(stores.settings, 'hideExplicit');
  const removed = stores.settings !== undefined ? hiddenUpdates(stores.settings) : new Set<string>();
  for (const { feedUrl } of stores.subscriptions.list()) {
    if (hidden.has(feedUrl)) continue;
    const show = stores.feeds.getShow(feedUrl);
    // M24 fix F-P: an episode its creator hid in the Studio is not listed (nor played by play-latest, the car, Siri).
    for (const e of visibleEpisodes(stores, feedUrl).filter((x) => !(noExplicit && x.explicit) && !removed.has(x.id)).slice(0, perShow)) {
      const img = e.imageUrl ?? show?.imageUrl;
      rows.push({ episode: e, showTitle: show?.title ?? feedUrl, ...(img ? { imageUrl: img } : {}), summary: plainSummary(e.shownotesHtml) });
    }
  }
  return rows.sort((a, b) => (b.episode.publishedAt ?? 0) - (a.episode.publishedAt ?? 0)).slice(0, limit);
}

/**
 * Defect 5 (owner's iPhone, 2026-10-07): on open, Updates drew "My subscriptions · 0" and Discover's
 * picks until the first refresh, although the phone's database already had the shows. The page now
 * starts from this snapshot of the local database (its first render, not after the sync).
 */
export function updatesSnapshot(stores: Pick<Stores, 'subscriptions' | 'feeds'> & { settings?: Stores['settings'] }, hidden: ReadonlySet<string>): { rows: UpdateRow[]; subscribed: number } {
  return { rows: latestUpdates(stores, hidden), subscribed: stores.subscriptions.list().length };
}
