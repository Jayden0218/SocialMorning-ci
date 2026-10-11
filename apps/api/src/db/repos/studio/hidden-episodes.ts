// Episodes of a claimed show that its creator hid from listeners.
/**
 * M24 US11 (specs/025-m24-gaps-and-look). A creator hides one episode of a claimed feed; the
 * server then leaves it out of every list it builds for listeners (Discover, For You, search,
 * next-up, issues, friends' listening, the show's own episode lists the server serves). Rows are
 * keyed by (feed_url, guid) — the publisher's own identity for an item — so a hide survives the
 * episode being re-registered. The phone parses a show's feed itself; it learns the hidden guids
 * from `GET /v1/shows/hidden-episodes?feedUrl=` (creators/extras.ts).
 *
 * Comments, likes and positions on a hidden episode are kept (a hide is undone with one click).
 * M26 lane ST: Admin's hide-with-a-reason (A3) lives here too (it was SQL in admin/admin-lists.ts), so every
 * write of the hidden set goes through this lane's repo (DynamoDB: ddb/page.ts).
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { ApiError } from '../../../errors.ts';

/** The app ids (`episodes.id`) of every hidden episode. One indexed read, for the read paths. */
async function hiddenEpisodeIdsPg(db: Db): Promise<Set<string>> {
  const rows = await db.query<{ id: string }>('SELECT e.id FROM hidden_episodes h JOIN episodes e ON e.feed_url = h.feed_url AND e.guid = h.guid');
  return new Set(rows.map((r) => r.id));
}

/** The hidden guids of one show (for the phone, which parses the feed itself). */
async function hiddenGuidsPg(db: Db, feedUrl: string): Promise<string[]> {
  return (await db.query<{ guid: string }>('SELECT guid FROM hidden_episodes WHERE feed_url = $1 ORDER BY guid', [feedUrl])).map((r) => r.guid);
}

/** A SQL condition: true when the episode aliased `alias` is NOT hidden. */
export const notHidden = (alias: string): string =>
  `NOT EXISTS (SELECT 1 FROM hidden_episodes hx WHERE hx.feed_url = ${alias}.feed_url AND hx.guid = ${alias}.guid)`;

export type HiddenEpisode = { episodeId: string; guid: string; title: string; hiddenAt: string };

async function listHiddenPg(db: Db, feedUrl: string): Promise<HiddenEpisode[]> {
  const rows = await db.query<{ id: string | null; guid: string; title: string | null; hidden_at: Date | string }>(
    `SELECT e.id, h.guid, e.title, h.hidden_at FROM hidden_episodes h
       LEFT JOIN episodes e ON e.feed_url = h.feed_url AND e.guid = h.guid
      WHERE h.feed_url = $1 ORDER BY h.hidden_at DESC`, [feedUrl]);
  return rows.map((r) => ({ episodeId: r.id ?? '', guid: r.guid, title: r.title ?? r.guid, hiddenAt: new Date(r.hidden_at).toISOString() }));
}

async function guidOf(db: Db, feedUrl: string, episodeId: string): Promise<string> {
  const [e] = await db.query<{ guid: string }>('SELECT guid FROM episodes WHERE id = $1 AND feed_url = $2', [episodeId, feedUrl]);
  if (!e) throw new ApiError('not_found', 'That episode is not on this show.');
  return e.guid;
}

async function setHiddenPg(db: Db, feedUrl: string, episodeId: string, hidden: boolean, by: string): Promise<void> {
  const guid = await guidOf(db, feedUrl, episodeId);
  if (hidden) {
    await db.query('INSERT INTO hidden_episodes (feed_url, guid, hidden_by) VALUES ($1, $2, $3) ON CONFLICT (feed_url, guid) DO NOTHING', [feedUrl, guid, by]);
  } else {
    await db.query('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]);
  }
}

// ---- Admin › Lists › hidden episodes (M25 A3; was SQL in admin/admin-lists.ts) ----

export type HiddenEpRow = { feed_url: string; guid: string; reason: string | null; hidden_at: Date | string; title: string | null; show_title: string | null; hidden_by: string | null };

async function hiddenEpisodeRowsPg(db: Db): Promise<HiddenEpRow[]> {
  return db.query<HiddenEpRow>(
      `SELECT h.feed_url, h.guid, h.reason, h.hidden_at, e.title, e.show_title, h.hidden_by::text AS hidden_by
         FROM hidden_episodes h LEFT JOIN episodes e ON e.feed_url = h.feed_url AND e.guid = h.guid
        ORDER BY h.hidden_at DESC LIMIT 500`);
}

async function hiddenEpisodeReasonPg(db: Db, url: string, guid: string): Promise<{ reason: string | null }[]> {
  return db.query<{ reason: string | null }>('SELECT reason FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [url, guid]);
}

/** Hides one episode everywhere with a reason; hiding it again updates the reason. */
async function hideEpisodeWithReasonPg(db: Db, feedUrl: string, guid: string, by: string, reason: string): Promise<Record<string, unknown>[]> {
  return db.query(
      `INSERT INTO hidden_episodes (feed_url, guid, hidden_by, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (feed_url, guid) DO UPDATE SET reason = EXCLUDED.reason`, [feedUrl, guid, by, reason]);
}

async function unhideEpisodePg(db: Db, feedUrl: string, guid: string): Promise<Record<string, unknown>[]> {
  return db.query('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]);
}

// M26 lane ST: each runs on Postgres, or on DynamoDB (ddb/page.ts) when the Db carries a Store (db/backend.ts).
export const hiddenEpisodeIds = dual('st/page', 'hiddenEpisodeIds', hiddenEpisodeIdsPg);
export const hiddenGuids = dual('st/page', 'hiddenGuids', hiddenGuidsPg);
export const listHidden = dual('st/page', 'listHidden', listHiddenPg);
export const setHidden = dual('st/page', 'setHidden', setHiddenPg);
export const hiddenEpisodeRows = dual('st/page', 'hiddenEpisodeRows', hiddenEpisodeRowsPg);
export const hiddenEpisodeReason = dual('st/page', 'hiddenEpisodeReason', hiddenEpisodeReasonPg);
export const hideEpisodeWithReason = dual('st/page', 'hideEpisodeWithReason', hideEpisodeWithReasonPg);
export const unhideEpisode = dual('st/page', 'unhideEpisode', unhideEpisodePg);
