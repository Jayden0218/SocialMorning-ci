// The Monday digest for PLUS members: up to 10 unplayed episodes from last week, once per ISO week, at noon local time.
/**
 * M22 US15 (FR-045, FR-046; research R13; guard G-M22-13). The hourly internal step `digest` looks
 * at every PLUS member whose local time (`listeners.tz`, default Asia/Kuala_Lumpur) is Monday
 * 12:00–12:59 and who has the push switch "Weekly digest" on. It picks at most 10 episodes from
 * their subscriptions published in the 7 local days before this Monday and never played (no
 * `positions` row), newest first. Nothing unplayed → nothing is stored or sent that week.
 * `weekly_digests` has the key (listener, ISO week), so a second run in the same hour — or the
 * same week — inserts nothing and pushes nothing. Digests older than 28 days are swept.
 */
import type { Db } from '../../db.ts';
import { ApiError } from '../../../errors.ts';
import { sendExpo, type PushMessage } from './push.ts';
import { notHidden } from '../studio/hidden-episodes.ts';

export const DEFAULT_TZ = 'Asia/Kuala_Lumpur';
export const DIGEST_MAX = 10;
export const DIGEST_KEEP_DAYS = 28;

/** A real IANA zone (Intl knows it), at most 64 characters. */
export function validTz(tz: string): boolean {
  if (tz.length === 0 || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export async function setTz(db: Db, listenerId: string, tz: string): Promise<void> {
  if (!validTz(tz)) throw new ApiError('validation', 'That is not a time zone.', { fields: ['tz'] });
  await db.query('UPDATE listeners SET tz = $2 WHERE id = $1', [listenerId, tz]);
}

/** The wall clock in a zone: weekday (1 = Monday … 7 = Sunday), hour, and the local date. */
export function localClock(now: Date, tz: string): { weekday: number; hour: number; minute: number; second: number; y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { weekday, hour: Number(get('hour')) % 24, minute: Number(get('minute')), second: Number(get('second')), y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
}

/** ISO 8601 week of a calendar date: "2026-W41". */
export function isoWeek(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export type DigestCard = { id: string; feedUrl: string; guid: string; title: string; showTitle: string | null; enclosureUrl: string; imageUrl: string | null; durationMs: number | null; publishedAt: string | null };

type Due = { id: string; tz: string | null };

/** PLUS members, push switch on, not hidden or suspended. */
async function candidates(db: Db): Promise<Due[]> {
  return db.query<Due>(
    `SELECT l.id, l.tz FROM listeners l
       LEFT JOIN push_prefs p ON p.listener_id = l.id
      WHERE l.suspended_at IS NULL AND l.hidden_at IS NULL AND COALESCE(p.digest, true)
        -- Fix F-S: PLUS from any source (store, code, admin), each listener once.
        AND EXISTS (SELECT 1 FROM entitlements e WHERE e.listener_id = l.id AND e.kind = 'plus' AND (e.until IS NULL OR e.until > now()))`);
}

/** The episodes for one listener's week: published in [from, to), in a live subscription, never played. */
async function pick(db: Db, listenerId: string, from: Date, to: Date): Promise<string[]> {
  // M24 US11: hidden episodes leave this list.
  const rows = await db.query<{ id: string }>(
    `SELECT e.id FROM episodes e
       JOIN subscriptions s ON s.feed_url = e.feed_url AND s.listener_id = $1 AND s.deleted_at IS NULL
      WHERE e.published_at >= $2 AND e.published_at < $3
        AND NOT EXISTS (SELECT 1 FROM positions p WHERE p.listener_id = $1 AND p.episode_id = e.id)
        AND ${notHidden('e')}
      ORDER BY e.published_at DESC, e.id LIMIT ${DIGEST_MAX}`, [listenerId, from.toISOString(), to.toISOString()]);
  return rows.map((r) => r.id);
}

/** The internal step. `now` is injectable so tests can stand on a Monday noon anywhere. */
export async function runDigests(db: Db, pushFetch: typeof fetch, now: Date = new Date()): Promise<{ made: number; pushed: number; swept: number }> {
  const swept = (await db.query(`DELETE FROM weekly_digests WHERE sent_at < now() - interval '${DIGEST_KEEP_DAYS} days' RETURNING 1`)).length;
  let made = 0;
  let pushed = 0;
  for (const who of await candidates(db)) {
    const tz = who.tz && validTz(who.tz) ? who.tz : DEFAULT_TZ;
    const c = localClock(now, tz);
    if (c.weekday !== 1 || c.hour !== 12) continue;
    // This Monday 00:00 local, as an instant: now minus the time since local midnight.
    const midnight = new Date(now.getTime() - ((c.hour * 60 + c.minute) * 60 + c.second) * 1000 - (now.getTime() % 1000));
    const from = new Date(midnight.getTime() - 7 * 86_400_000);
    const week = isoWeek(c.y, c.m, c.d);
    const ids = await pick(db, who.id, from, midnight);
    if (ids.length === 0) continue;
    // G-M22-13: the (listener, ISO week) key — a second run this week inserts nothing and sends nothing.
    const [row] = await db.query<{ iso_week: string }>(
      'INSERT INTO weekly_digests (listener_id, iso_week, episode_ids) VALUES ($1, $2, $3::text[]) ON CONFLICT (listener_id, iso_week) DO NOTHING RETURNING iso_week',
      [who.id, week, ids]);
    if (!row) continue;
    made++;
    const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = $1', [who.id]);
    const n = ids.length;
    const messages = tokens.map((t): PushMessage => ({
      to: t.token, title: 'Your weekly catch-up', body: `${n} new ${n === 1 ? 'episode' : 'episodes'} from your shows last week`,
      data: { kind: 'digest', href: `/digest/${week}` }, sound: 'default', channelId: 'social', tag: `digest:${week}`, threadId: 'digest',
    }));
    if (messages.length > 0) {
      try { pushed += (await sendExpo(db, pushFetch, messages)).sent; } catch (e) { console.error('digest push failed; the digest page still has it', e instanceof Error ? e.message : String(e)); }
    }
  }
  return { made, pushed, swept };
}

/** GET /v1/me/digests — the last 4 weeks, newest first, each with its episode cards in the stored order. */
export async function listDigests(db: Db, listenerId: string): Promise<{ items: { isoWeek: string; episodes: DigestCard[]; sentAt: string }[] }> {
  const rows = await db.query<{ iso_week: string; episode_ids: string[]; sent_at: Date | string }>(
    `SELECT iso_week, episode_ids, sent_at FROM weekly_digests WHERE listener_id = $1 AND sent_at >= now() - interval '${DIGEST_KEEP_DAYS} days' ORDER BY sent_at DESC`, [listenerId]);
  const all = [...new Set(rows.flatMap((r) => r.episode_ids))];
  const eps = all.length === 0 ? [] : await db.query<{ id: string; feed_url: string; guid: string; title: string; show_title: string | null; enclosure_url: string; image_url: string | null; duration_ms: number | null; published_at: Date | string | null }>(
    'SELECT id, feed_url, guid, title, show_title, enclosure_url, image_url, duration_ms, published_at FROM episodes WHERE id = ANY($1::text[])', [all]);
  const byId = new Map(eps.map((e) => [e.id, {
    id: e.id, feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title, enclosureUrl: e.enclosure_url, imageUrl: e.image_url,
    durationMs: e.duration_ms === null ? null : Number(e.duration_ms), publishedAt: e.published_at ? new Date(e.published_at).toISOString() : null,
  } satisfies DigestCard]));
  return {
    items: rows.map((r) => ({
      isoWeek: r.iso_week,
      episodes: r.episode_ids.map((id) => byId.get(id)).filter((x): x is DigestCard => x !== undefined),
      sentAt: new Date(r.sent_at).toISOString(),
    })),
  };
}
