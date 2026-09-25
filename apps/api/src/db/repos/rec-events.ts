/**
 * M8 US6 — what was shown, and what happened next (FR-028, FR-029).
 *
 * Kept deliberately dumb: rows in, counts out. The interesting question this table
 * answers is **per channel** — which of the seven retrieval channels earns its place —
 * because that is the only way to delete one on evidence instead of taste.
 */
import type { Channel } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

export type RecEventIn = { episodeId: string; channel: Channel; rank: number; kind: 'impression' | 'open' | 'play' | 'finish'; at: string };

export async function recordEvents(db: Db, listenerId: string, events: readonly RecEventIn[]): Promise<number> {
  if (events.length === 0) return 0;
  await db.transaction(async (tx) => {
    for (const e of events) {
      await tx.query(
        'INSERT INTO rec_events (listener_id, episode_id, channel, rank, kind, at) VALUES ($1, $2, $3, $4, $5, $6)',
        [listenerId, e.episodeId, e.channel, e.rank, e.kind, e.at],
      );
    }
  });
  return events.length;
}

export type ChannelRollup = { channel: string; shown: number; opened: number; played: number; finished: number };

/** The 7-day table `/mod/recs` shows. Aggregates only — no listener is named. */
export async function rollup(db: Db, days = 7): Promise<ChannelRollup[]> {
  const rows = await db.query<{ channel: string; shown: string; opened: string; played: string; finished: string }>(
    `SELECT channel,
            count(*) FILTER (WHERE kind = 'impression') AS shown,
            count(*) FILTER (WHERE kind = 'open')       AS opened,
            count(*) FILTER (WHERE kind = 'play')       AS played,
            count(*) FILTER (WHERE kind = 'finish')     AS finished
     FROM rec_events WHERE at > now() - ($1 || ' days')::interval
     GROUP BY channel ORDER BY channel`,
    [String(days)],
  );
  return rows.map((r) => ({ channel: r.channel, shown: Number(r.shown), opened: Number(r.opened), played: Number(r.played), finished: Number(r.finished) }));
}
