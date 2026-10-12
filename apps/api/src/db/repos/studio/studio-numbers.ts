// A show's Studio numbers: plays, completion, likes, saves, shares, trends, CSV.
/**
 * M11 — a show's numbers for the Studio (specs/011-m11-studio/spec.md FR-006..FR-012).
 * Every query is scoped by the show's feed_url; nothing here is ever called without the
 * role check in `routes/studio/` having passed first.
 *
 * Definitions (research R3, R5):
 *   play       — one `activity` 'listened' row: one listener, one episode, one day (hidden included, FR-012)
 *   completion — per (listener, episode): the union of listened ranges ≥ 90 % of the length, or finished
 *   like       — a listener who reacted to an episode (not a bucket: one fan is not 40 likes)
 *   save       — a live `fav_episode` library item
 *   share      — a `share_events` row (counted from the build that records them)
 */
import { viaStore } from '../../backend.ts';

export const METRICS = ['plays', 'subs', 'comments', 'saves', 'shares', 'likes'] as const;
export type Metric = (typeof METRICS)[number];

export type Totals = { plays: number; completionRate: number | null; subscribers: number; comments: number; likes: number; clips: number; saves: number; shares: number };

/** A zone Intl can use; anything else falls back to UTC. */
export function validTz(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export type RecentComment = { id: string; episodeId: string; episodeTitle: string; author: string | null; body: string; offsetMs: number | null; createdAt: string };
export type RecentEpisode = { id: string; title: string; publishedAt: string | null; plays: number; comments: number };

export type EpisodeStats = {
  id: string; title: string; publishedAt: string | null; plays: number; completionRate: number | null;
  comments: number; shares: number; saves: number; likes: number;
};

export const EPISODE_SORTS = ['publishedAt', 'plays', 'completionRate', 'comments', 'shares', 'saves', 'likes', 'title'] as const;
export type EpisodeSort = (typeof EPISODE_SORTS)[number];

export function sortEpisodes(items: EpisodeStats[], sort: EpisodeSort = 'publishedAt', dir: 'asc' | 'desc' = 'desc'): EpisodeStats[] {
  const k = dir === 'asc' ? 1 : -1;
  const val = (e: EpisodeStats): number | string => {
    if (sort === 'title') return e.title.toLowerCase();
    if (sort === 'publishedAt') return e.publishedAt ? Date.parse(e.publishedAt) : -Infinity;
    const v = e[sort];
    return v === null ? -Infinity : v;
  };
  return [...items].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1) * k;
  });
}

/** Other shows this show's live subscribers also follow — hidden under 5 subscribers (FR-010, G-L1). */
export const ALSO_FOLLOW_MIN = 5;

// ---- CSV (FR-009): built from the same values the JSON routes return (G-E1) ----

/**
 * M25 SB (guard G-SB4, audit #37): a TEXT cell that starts with = + - @ tab or CR would run as a
 * formula when the CSV is opened in a spreadsheet (titles can come from any feed). It gets a
 * leading ' so it is shown as text. Numbers are written as numbers (a refund's -4.99 stays a number).
 */
export function csvSafe(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const cell = (v: string | number | null): string => {
  const s = v === null ? '' : typeof v === 'number' ? String(v) : csvSafe(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC 4180, CRLF rows, a UTF-8 BOM so spreadsheet apps read Chinese titles correctly. */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export const episodeCsv = (items: EpisodeStats[]) =>
  toCsv(
    ['Title', 'Published', 'Plays', 'Completion %', 'Comments', 'Shares', 'Saves', 'Likes'],
    items.map((e) => [e.title, e.publishedAt ? e.publishedAt.slice(0, 10) : null, e.plays, e.completionRate === null ? null : Math.round(e.completionRate * 1000) / 10, e.comments, e.shares, e.saves, e.likes]),
  );

export const trendCsv = (metric: Metric, days: { date: string; value: number }[]) => toCsv(['Date', metric], days.map((d) => [d.date, d.value]));

// DynamoDB bodies: ddb/numbers.ts (db/backend.ts).
export const completion = viaStore<typeof import('./ddb/numbers.ts').completion>('st/numbers', 'completion');
export const totals = viaStore<typeof import('./ddb/numbers.ts').totals>('st/numbers', 'totals');
export const trend = viaStore<typeof import('./ddb/numbers.ts').trend>('st/numbers', 'trend');
export const recentComments = viaStore<typeof import('./ddb/numbers.ts').recentComments>('st/numbers', 'recentComments');
export const recentEpisodes = viaStore<typeof import('./ddb/numbers.ts').recentEpisodes>('st/numbers', 'recentEpisodes');
export const claimedAt = viaStore<typeof import('./ddb/numbers.ts').claimedAt>('st/numbers', 'claimedAt');
export const yesterday = viaStore<typeof import('./ddb/numbers.ts').yesterday>('st/numbers', 'yesterday');
export const episodeStats = viaStore<typeof import('./ddb/numbers.ts').episodeStats>('st/numbers', 'episodeStats');
export const alsoFollow = viaStore<typeof import('./ddb/numbers.ts').alsoFollow>('st/numbers', 'alsoFollow');
export const episodeDetail = viaStore<typeof import('./ddb/numbers.ts').episodeDetail>('st/numbers', 'episodeDetail');
