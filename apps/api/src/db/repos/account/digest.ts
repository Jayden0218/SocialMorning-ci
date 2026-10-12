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
import { viaStore } from '../../backend.ts';

export const DEFAULT_TZ = 'Asia/Kuala_Lumpur';
export const DIGEST_MAX = 10;
export const DIGEST_KEEP_DAYS = 28;

/** A real IANA zone (Intl knows it), at most 64 characters. */
export function validTz(tz: string): boolean {
  if (tz.length === 0 || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export const setTz = viaStore<typeof import('./ddb/index.ts').setTz>('ac/index', 'setTz');

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

/** The internal step. `now` is injectable so tests can stand on a Monday noon anywhere. */
export const runDigests = viaStore<typeof import('./ddb/index.ts').runDigests>('ac/index', 'runDigests');

/** GET /v1/me/digests — the last 4 weeks, newest first, each with its episode cards in the stored order. */
export const listDigests = viaStore<typeof import('./ddb/index.ts').listDigests>('ac/index', 'listDigests');
