/**
 * Listened ranges (M4 FR-012, research R3/R4). A phone REPLACES its own merged set per
 * (listener, episode, day, device); time listened is the UNION across devices (guard G3
 * on the server side); the `listened` activity row is written once per (listener,
 * episode, day) when the union first crosses the threshold or the episode is finished
 * (guard G6: the UNIQUE), with `hidden` fixed from the listener's switch at that moment
 * (research R5).
 */
import { listenItemDue, mergeRanges, unionLength, type Range } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

export type ListenedDayIn = { episodeId: string; day: string; ranges: Range[] };

export async function replaceRanges(db: Db, listenerId: string, deviceId: string, days: readonly ListenedDayIn[]): Promise<number> {
  let accepted = 0;
  for (const d of days) {
    await db.transaction(async (tx) => {
      const before = await unionFor(tx, listenerId, d.episodeId, d.day);
      const merged = mergeRanges(d.ranges);
      await tx.query(
        `INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (listener_id, episode_id, day, device_id) DO UPDATE SET ranges = EXCLUDED.ranges, updated_at = now()`,
        [listenerId, d.episodeId, d.day, deviceId, JSON.stringify(merged)],
      );
      const after = await unionFor(tx, listenerId, d.episodeId, d.day);
      const [pos] = await tx.query<{ finished: boolean }>('SELECT finished FROM positions WHERE listener_id = $1 AND episode_id = $2', [listenerId, d.episodeId]);
      const finished = pos?.finished ?? false;
      // "finishedBefore" is whether a listened row already exists for that reason: once written, never again.
      const [existing] = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM activity WHERE actor_id = $1 AND kind = 'listened' AND episode_id = $2 AND day = $3`, [listenerId, d.episodeId, d.day]);
      const already = Number(existing!.n) > 0;
      if (!already && listenItemDue(before, after, false, finished)) {
        const registered = await tx.query('SELECT 1 FROM episodes WHERE id = $1', [d.episodeId]);
        if (registered.length > 0) {
          const [l] = await tx.query<{ private_listening: boolean }>('SELECT private_listening FROM listeners WHERE id = $1', [listenerId]);
          await tx.query(
            `INSERT INTO activity (actor_id, kind, episode_id, day, hidden) VALUES ($1, 'listened', $2, $3, $4) ON CONFLICT DO NOTHING`,
            [listenerId, d.episodeId, d.day, l?.private_listening ?? false],
          );
        }
      }
    });
    accepted++;
  }
  return accepted;
}

async function unionFor(db: Db, listenerId: string, episodeId: string, day: string): Promise<number> {
  const rows = await db.query<{ ranges: Range[] | string }>('SELECT ranges FROM listened_ranges WHERE listener_id = $1 AND episode_id = $2 AND day = $3', [listenerId, episodeId, day]);
  return unionLength(rows.map((r) => (typeof r.ranges === 'string' ? (JSON.parse(r.ranges) as Range[]) : r.ranges)));
}

/** Per (episode, day) union across devices, joined to the episode's show, for the stats. */
export async function listenedRowsFor(db: Db, listenerId: string): Promise<{ episodeId: string; feedUrl?: string; showTitle?: string; day: string; unionMs: number; finished: boolean }[]> {
  const rows = await db.query<{ episode_id: string; day: string; ranges: Range[] | string; feed_url: string | null; show_title: string | null; finished: boolean | null }>(
    `SELECT lr.episode_id, lr.day::text AS day, lr.ranges, e.feed_url, e.show_title, p.finished
     FROM listened_ranges lr
     LEFT JOIN episodes e ON e.id = lr.episode_id
     LEFT JOIN positions p ON p.listener_id = lr.listener_id AND p.episode_id = lr.episode_id
     WHERE lr.listener_id = $1`,
    [listenerId],
  );
  const byKey = new Map<string, { episodeId: string; feedUrl?: string; showTitle?: string; day: string; sets: Range[][]; finished: boolean }>();
  for (const r of rows) {
    const key = `${r.episode_id}\u0000${r.day}`;
    const cur = byKey.get(key) ?? { episodeId: r.episode_id, ...(r.feed_url ? { feedUrl: r.feed_url } : {}), ...(r.show_title ? { showTitle: r.show_title } : {}), day: r.day, sets: [], finished: r.finished ?? false };
    cur.sets.push(typeof r.ranges === 'string' ? (JSON.parse(r.ranges) as Range[]) : r.ranges);
    byKey.set(key, cur);
  }
  return [...byKey.values()].map(({ sets, ...rest }) => ({ ...rest, unionMs: unionLength(sets) }));
}
