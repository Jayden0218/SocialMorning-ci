// Shows and episodes created in the Studio, and the RSS feed built from them.
/**
 * M13 — shows created in the Studio, and their episodes (specs/013-m13-create-show).
 * A created show is ALSO a proven claim on its own feed address (plan R3), so the whole M11
 * Studio — roles, numbers, comments, settings — works on it without a second code path.
 */
import { CATEGORY_NAMES } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

/** Apple Podcasts' top-level categories (podcasters.apple.com/support/1691, read 2026-09-29). */
export const CATEGORIES = CATEGORY_NAMES;

/** Storage ceiling across all created shows: Blob Hobby's 1 GB minus headroom (FR-008, guard G-Q1). */
export const DEFAULT_CEILING_BYTES = 900 * 1024 * 1024;

export type HostedShow = {
  id: string; ownerId: string; feedUrl: string; title: string; description: string; author: string;
  language: string; category: string; explicit: boolean; coverUrl: string | null; createdAt: string; updatedAt: string;
  /** M20 US6: the show's price level (1–5) for its paid episodes; null = sells nothing. */
  priceTier: number | null;
};
export type HostedEpisode = {
  id: string; guid: string; episodeId: string; title: string; description: string; audioUrl: string;
  audioBytes: number; audioType: string; durationMs: number | null; publishedAt: string;
  /** M14 US4: a draft is not in the feed; a published episode with a future time is scheduled. */
  status: 'draft' | 'published'; coverUrl: string | null; scheduled: boolean;
  /** M20 US6: sold with the show's price level; out of the public feed. `paidAllowed`: made after M20 (FR-024). */
  paid: boolean; paidAllowed: boolean;
  /** M24 US13: a paid episode's free preview, [startMs, endMs) — present only when set. */
  preview?: { startMs: number; endMs: number };
};

export type ShowIn = { title: string; description?: string; author?: string; language?: string; category?: string; explicit?: boolean; coverUrl?: string | null };

// ---- The public feed (FR-003): RSS 2.0 + iTunes tags, read back by the app's own parser in tests ----

const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rfc822 = (d: string) => new Date(d).toUTCString();
const secs = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));

export function feedXml(show: HostedShow, eps: HostedEpisode[]): string {
  const items = eps.map((e) => `    <item>
      <title>${x(e.title)}</title>
      <description>${x(e.description)}</description>
      <guid isPermaLink="false">${x(e.guid)}</guid>
      <pubDate>${rfc822(e.publishedAt)}</pubDate>
      <enclosure url="${x(e.audioUrl)}" length="${e.audioBytes}" type="${x(e.audioType)}"/>
${e.coverUrl ? `      <itunes:image href="${x(e.coverUrl)}"/>\n` : ''}${secs(e.durationMs) === null ? '' : `      <itunes:duration>${secs(e.durationMs)}</itunes:duration>\n`}    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${x(show.title)}</title>
    <link>${x(show.feedUrl)}</link>
    <description>${x(show.description)}</description>
    <language>${x(show.language)}</language>
    <itunes:author>${x(show.author)}</itunes:author>
    <itunes:category text="${x(show.category)}"/>
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
${show.coverUrl ? `    <itunes:image href="${x(show.coverUrl)}"/>\n    <image><url>${x(show.coverUrl)}</url><title>${x(show.title)}</title><link>${x(show.feedUrl)}</link></image>\n` : ''}${items}
  </channel>
</rss>
`;
}

/** M24 US13: the longest free preview — 10 minutes (checked on write). */
export const PREVIEW_MAX_MS = 600_000;

// DynamoDB bodies: ddb/hosted.ts (db/backend.ts).
export const createHostedShow = viaStore<typeof import('./ddb/hosted.ts').createHostedShow>('st/hosted', 'createHostedShow');
export const hostedByFeed = viaStore<typeof import('./ddb/hosted.ts').hostedByFeed>('st/hosted', 'hostedByFeed');
export const hostedById = viaStore<typeof import('./ddb/hosted.ts').hostedById>('st/hosted', 'hostedById');
export const updateHostedShow = viaStore<typeof import('./ddb/hosted.ts').updateHostedShow>('st/hosted', 'updateHostedShow');
export const listHostedEpisodes = viaStore<typeof import('./ddb/hosted.ts').listHostedEpisodes>('st/hosted', 'listHostedEpisodes');
export const promoteDue = viaStore<typeof import('./ddb/hosted.ts').promoteDue>('st/hosted', 'promoteDue');
export const storedBytes = viaStore<typeof import('./ddb/hosted.ts').storedBytes>('st/hosted', 'storedBytes');
export const publishEpisode = viaStore<typeof import('./ddb/hosted.ts').publishEpisode>('st/hosted', 'publishEpisode');
export const updateEpisode = viaStore<typeof import('./ddb/hosted.ts').updateEpisode>('st/hosted', 'updateEpisode');
export const removeEpisode = viaStore<typeof import('./ddb/hosted.ts').removeEpisode>('st/hosted', 'removeEpisode');
export const setPriceTier = viaStore<typeof import('./ddb/hosted.ts').setPriceTier>('st/hosted', 'setPriceTier');
export const setEpisodePaid = viaStore<typeof import('./ddb/hosted.ts').setEpisodePaid>('st/hosted', 'setEpisodePaid');
export const setPreview = viaStore<typeof import('./ddb/hosted.ts').setPreview>('st/hosted', 'setPreview');
export const markHostedShowDeleted = viaStore<typeof import('./ddb/hosted.ts').markHostedShowDeleted>('st/hosted', 'markHostedShowDeleted');
export const markHostedEpisodesDeleted = viaStore<typeof import('./ddb/hosted.ts').markHostedEpisodesDeleted>('st/hosted', 'markHostedEpisodesDeleted');
export const paidEpisodeRows = viaStore<typeof import('./ddb/hosted.ts').paidEpisodeRows>('st/hosted', 'paidEpisodeRows');
export const hostedShowDeletedRows = viaStore<typeof import('./ddb/hosted.ts').hostedShowDeletedRows>('st/hosted', 'hostedShowDeletedRows');
export const ownedShowCountRows = viaStore<typeof import('./ddb/hosted.ts').ownedShowCountRows>('st/hosted', 'ownedShowCountRows');
