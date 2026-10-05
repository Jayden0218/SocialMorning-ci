// The monthly listening report: minutes, shows, episodes, top three of each, comments and clips.
/**
 * M19 US8 (FR-060, 月记). Built on read from what is already stored — the listened ranges (the
 * phone's local day), comments and clips — so no table is added. Counts only; no other listener
 * is ever named.
 */
import type { Db } from '../../db.ts';

export type Report = {
  month: string; minutes: number; shows: number; episodes: number;
  topShows: { feedUrl: string; title: string; imageUrl?: string; minutes: number }[];
  topEpisodes: { id: string; title: string; showTitle: string; imageUrl?: string; minutes: number }[];
  comments: number; clips: number;
};

/** "2026-09" → the first day of it and of the next month, as YYYY-MM-DD. */
export function monthBounds(month: string): { from: string; to: string } | undefined {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

const rangesMs = (v: unknown): number => {
  const a = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  if (!Array.isArray(a)) return 0;
  let ms = 0;
  for (const r of a) if (Array.isArray(r) && typeof r[0] === 'number' && typeof r[1] === 'number' && r[1] > r[0]) ms += r[1] - r[0];
  return ms;
};

export async function monthReport(db: Db, listenerId: string, month: string): Promise<Report | undefined> {
  const b = monthBounds(month);
  if (!b) return undefined;
  const rows = await db.query<{ episode_id: string; ranges: unknown; title: string | null; show_title: string | null; feed_url: string | null; image_url: string | null }>(
    `SELECT r.episode_id, r.ranges, e.title, e.show_title, e.feed_url, e.image_url
     FROM listened_ranges r LEFT JOIN episodes e ON e.id = r.episode_id
     WHERE r.listener_id = $1 AND r.day >= $2::date AND r.day < $3::date`,
    [listenerId, b.from, b.to],
  );
  const byEp = new Map<string, { ms: number; title: string; showTitle: string; feedUrl?: string; imageUrl?: string }>();
  for (const r of rows) {
    const cur = byEp.get(r.episode_id) ?? { ms: 0, title: r.title ?? '', showTitle: r.show_title ?? '', ...(r.feed_url ? { feedUrl: r.feed_url } : {}), ...(r.image_url ? { imageUrl: r.image_url } : {}) };
    cur.ms += rangesMs(r.ranges);
    byEp.set(r.episode_id, cur);
  }
  const byShow = new Map<string, { ms: number; title: string; imageUrl?: string }>();
  for (const e of byEp.values()) {
    if (!e.feedUrl) continue;
    const s = byShow.get(e.feedUrl) ?? { ms: 0, title: e.showTitle, ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}) };
    s.ms += e.ms;
    byShow.set(e.feedUrl, s);
  }
  const min = (ms: number) => Math.round(ms / 60_000);
  const listened = [...byEp.entries()].filter(([, e]) => e.ms > 0);
  const [counts] = await db.query<{ comments: number; clips: number }>(
    `SELECT (SELECT count(*)::int FROM comments WHERE author_id = $1 AND deleted_at IS NULL AND created_at >= $2::date AND created_at < $3::date) AS comments,
            (SELECT count(*)::int FROM clips WHERE author_id = $1 AND deleted_at IS NULL AND created_at >= $2::date AND created_at < $3::date) AS clips`,
    [listenerId, b.from, b.to],
  );
  return {
    month,
    minutes: min(listened.reduce((n, [, e]) => n + e.ms, 0)),
    shows: [...byShow.values()].filter((s) => s.ms > 0).length,
    episodes: listened.length,
    topShows: [...byShow.entries()].filter(([, s]) => s.ms > 0).sort((x, y) => y[1].ms - x[1].ms).slice(0, 3)
      .map(([feedUrl, s]) => ({ feedUrl, title: s.title, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), minutes: min(s.ms) })),
    topEpisodes: listened.sort((x, y) => y[1].ms - x[1].ms).slice(0, 3)
      .map(([id, e]) => ({ id, title: e.title, showTitle: e.showTitle, ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}), minutes: min(e.ms) })),
    comments: Number(counts?.comments ?? 0),
    clips: Number(counts?.clips ?? 0),
  };
}
