// Routes for past daily picks and curated issues.
import { Hono } from 'hono';
import { pastPickDays, type IssueIn } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import type { Db } from '../../db/db.ts';
import type { EpisodeCard } from '../../catalog/apple.ts';
import { ApiError } from '../../errors.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';
import { hiddenEpisodeIds } from '../../db/repos/studio/hidden-episodes.ts';
import { pickEpisodeRows, type PickEpisodeRow } from '../../db/repos/discover/pick-episodes.ts';

/**
 * M12 FR-070 (past picks) and FR-101 (curated issues), both from the picks file — no
 * tables, no editor UI in M12. Episodes are looked up among those the server already knows;
 * nothing here fetches a feed, so a page costs one query per item and never waits on a
 * publisher. An item whose episode is not known yet comes back with `episode: null` and its
 * feed URL, and the phone opens the show instead.
 */
type EpRow = PickEpisodeRow;
const cardOf = (e: EpRow): EpisodeCard & { id: string } => ({ id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url, ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}) });

/** `visibleOnly` (M24 US11): "the show's latest" skips an episode its creator hid. Listener paths pass true. */
export async function episodeFor(db: Db, feedUrl: string, guid: string | undefined, visibleOnly = false): Promise<(EpisodeCard & { id: string }) | null> {
  const [e] = await pickEpisodeRows(db, feedUrl, guid, visibleOnly);
  return e ? cardOf(e) : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mounted at /v1/picks. */
export const pastPicks = new Hono<AuthEnv>();

pastPicks.get('/past', async (c) => {
  const before = c.req.query('before');
  if (before !== undefined && !DATE.test(before)) throw new ApiError('validation', 'before must be YYYY-MM-DD.', { fields: ['before'] });
  const cat = c.get('catalog');
  const db = c.get('db');
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const page = pastPickDays(cat.picks, cat.today(), before);
  const days = [];
  for (const d of page.days) {
    const picks = [];
    for (const p of d.picks) {
      if (hidden.has(p.feedUrl)) continue;
      const episode = await episodeFor(db, p.feedUrl, p.guid, true);
      if (episode && hiddenEps.has(episode.id)) continue;
      picks.push({ feedUrl: p.feedUrl, ...(p.guid !== undefined ? { guid: p.guid } : {}), why: p.why, episode });
    }
    days.push({ date: d.date, picks });
  }
  c.header('cache-control', 'public, max-age=300');
  return c.json({ days, ...(page.next !== undefined ? { next: page.next } : {}) });
});

/** Mounted at /v1/issues. Newest first; an issue dated after today is not out yet. */
export const issues = new Hono<AuthEnv>();

/**
 * M21 T086: an issue's number is its place among the issues out so far, oldest = 1 — so a later
 * issue never changes an earlier one's number.
 */
function numbered(all: readonly IssueIn[], today: string): Map<string, number> {
  const out = all.filter((i) => i.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return new Map(out.map((i, n) => [i.id, n + 1]));
}

issues.get('/', (c) => {
  const cat = c.get('catalog');
  const today = cat.today();
  const list = cat.issues.filter((i) => i.date <= today).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  const nums = numbered(cat.issues, today);
  c.header('cache-control', 'public, max-age=300');
  return c.json({ issues: list.map((i) => ({ id: i.id, number: nums.get(i.id) ?? 0, date: i.date, title: i.title })) });
});

issues.get('/:id', async (c) => {
  const cat = c.get('catalog');
  const issue = cat.issues.find((i) => i.id === c.req.param('id') && i.date <= cat.today());
  if (!issue) throw new ApiError('not_found', 'No such issue.');
  const db = c.get('db');
  const hidden = await hiddenFeedUrls(db);
  const hiddenEps = await hiddenEpisodeIds(db); // M24 US11: hidden episodes leave this list.
  const items = [];
  for (const it of issue.items) {
    if (hidden.has(it.feedUrl)) continue;
    const episode = await episodeFor(db, it.feedUrl, it.guid, true);
    if (episode && hiddenEps.has(episode.id)) continue;
    items.push({ order: it.order, feedUrl: it.feedUrl, ...(it.guid !== undefined ? { guid: it.guid } : {}), note: it.note, episode });
  }
  c.header('cache-control', 'public, max-age=300');
  return c.json({ id: issue.id, number: numbered(cat.issues, cat.today()).get(issue.id) ?? 0, date: issue.date, title: issue.title, intro: issue.intro, items });
});
