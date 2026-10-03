// Routes for past daily picks and curated issues.
import { Hono } from 'hono';
import { pastPickDays } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import type { Db } from '../../db/db.ts';
import type { EpisodeCard } from '../../catalog/apple.ts';
import { ApiError } from '../../errors.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';

/**
 * M12 FR-070 (past picks) and FR-101 (curated issues), both from the picks file — no
 * tables, no editor UI in M12. Episodes are looked up among those the server already knows;
 * nothing here fetches a feed, so a page costs one query per item and never waits on a
 * publisher. An item whose episode is not known yet comes back with `episode: null` and its
 * feed URL, and the phone opens the show instead.
 */
type EpRow = { id: string; feed_url: string; guid: string; title: string; show_title: string | null; image_url: string | null; duration_ms: number | null; enclosure_url: string };
const cardOf = (e: EpRow): EpisodeCard & { id: string } => ({ id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title ?? '', enclosureUrl: e.enclosure_url, ...(e.image_url ? { imageUrl: e.image_url } : {}), ...(e.duration_ms !== null ? { durationMs: Number(e.duration_ms) } : {}) });
const COLS = 'id, feed_url, guid, title, show_title, image_url, duration_ms, enclosure_url';

export async function episodeFor(db: Db, feedUrl: string, guid: string | undefined): Promise<(EpisodeCard & { id: string }) | null> {
  const [e] = guid !== undefined
    ? await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1 AND guid = $2`, [feedUrl, guid])
    : await db.query<EpRow>(`SELECT ${COLS} FROM episodes WHERE feed_url = $1 ORDER BY published_at DESC NULLS LAST, first_seen_at DESC LIMIT 1`, [feedUrl]);
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
  const page = pastPickDays(cat.picks, cat.today(), before);
  const days = [];
  for (const d of page.days) {
    const picks = [];
    for (const p of d.picks) {
      if (hidden.has(p.feedUrl)) continue;
      picks.push({ feedUrl: p.feedUrl, ...(p.guid !== undefined ? { guid: p.guid } : {}), why: p.why, episode: await episodeFor(db, p.feedUrl, p.guid) });
    }
    days.push({ date: d.date, picks });
  }
  c.header('cache-control', 'public, max-age=300');
  return c.json({ days, ...(page.next !== undefined ? { next: page.next } : {}) });
});

/** Mounted at /v1/issues. Newest first; an issue dated after today is not out yet. */
export const issues = new Hono<AuthEnv>();

issues.get('/', (c) => {
  const cat = c.get('catalog');
  const today = cat.today();
  const list = cat.issues.filter((i) => i.date <= today).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  c.header('cache-control', 'public, max-age=300');
  return c.json({ issues: list.map((i) => ({ id: i.id, date: i.date, title: i.title })) });
});

issues.get('/:id', async (c) => {
  const cat = c.get('catalog');
  const issue = cat.issues.find((i) => i.id === c.req.param('id') && i.date <= cat.today());
  if (!issue) throw new ApiError('not_found', 'No such issue.');
  const db = c.get('db');
  const hidden = await hiddenFeedUrls(db);
  const items = [];
  for (const it of issue.items) {
    if (hidden.has(it.feedUrl)) continue;
    items.push({ order: it.order, feedUrl: it.feedUrl, ...(it.guid !== undefined ? { guid: it.guid } : {}), note: it.note, episode: await episodeFor(db, it.feedUrl, it.guid) });
  }
  c.header('cache-control', 'public, max-age=300');
  return c.json({ id: issue.id, date: issue.date, title: issue.title, intro: issue.intro, items });
});
