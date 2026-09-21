import { mergePosition, type PositionObs } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

export type PositionRow = {
  episode_id: string;
  offset_ms: number;
  finished: boolean;
  progress_seq: string | number;
  explicit_seek: boolean;
  device_id: string;
  received_at: Date | string;
};

export function toObs(r: PositionRow): PositionObs {
  return {
    episodeId: r.episode_id,
    offsetMs: r.offset_ms,
    finished: r.finished,
    progressSeq: Number(r.progress_seq),
    explicitSeek: r.explicit_seek,
    receivedAt: new Date(r.received_at).getTime(),
  };
}

export function toPublic(r: PositionRow) {
  return {
    episodeId: r.episode_id,
    offsetMs: r.offset_ms,
    finished: r.finished,
    progressSeq: Number(r.progress_seq),
    explicitSeek: r.explicit_seek,
    receivedAt: new Date(r.received_at).toISOString(),
    deviceId: r.device_id,
  };
}

const COLS = 'episode_id, offset_ms, finished, progress_seq, explicit_seek, device_id, received_at';

/**
 * One observation from one device, merged with `mergePosition` (research R5) against the
 * stored row, using the SERVER's clock as `receivedAt`. Writes only when the incoming
 * observation wins. Returns the row that now stands.
 */
export async function observePosition(
  db: Db,
  listenerId: string,
  deviceId: string,
  o: Omit<PositionObs, 'receivedAt'>,
  now: Date,
): Promise<PositionRow> {
  const [existing] = await db.query<PositionRow>(
    `SELECT ${COLS} FROM positions WHERE listener_id = $1 AND episode_id = $2 FOR UPDATE`,
    [listenerId, o.episodeId],
  );
  const incoming: PositionObs = { ...o, receivedAt: now.getTime() };
  const winner = mergePosition(existing ? toObs(existing) : null, incoming);
  const incomingWon = winner.receivedAt === incoming.receivedAt && (!existing || winner !== toObs(existing));
  if (!existing || incomingWon || winner.finished !== existing.finished) {
    // `finished` can change even when the stored offset stands (sticky rule) — write the merged row.
    const rows = await db.query<PositionRow>(
      `INSERT INTO positions (listener_id, episode_id, offset_ms, finished, progress_seq, explicit_seek, device_id, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (listener_id, episode_id) DO UPDATE SET
         offset_ms = EXCLUDED.offset_ms, finished = EXCLUDED.finished, progress_seq = EXCLUDED.progress_seq,
         explicit_seek = EXCLUDED.explicit_seek, device_id = EXCLUDED.device_id, received_at = EXCLUDED.received_at
       RETURNING ${COLS}`,
      [
        listenerId, o.episodeId, winner.offsetMs, winner.finished, winner.progressSeq, winner.explicitSeek,
        winner === incoming || winner.receivedAt === incoming.receivedAt ? deviceId : existing!.device_id,
        new Date(winner.receivedAt),
      ],
    );
    return rows[0]!;
  }
  return existing;
}

export async function listPositions(db: Db, listenerId: string, since?: Date): Promise<PositionRow[]> {
  return db.query<PositionRow>(
    `SELECT ${COLS} FROM positions WHERE listener_id = $1 AND ($2::timestamptz IS NULL OR received_at > $2) ORDER BY received_at DESC`,
    [listenerId, since ?? null],
  );
}
