// Stores and merges playback positions sent from each device.
import type { PositionObs } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

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

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const observePosition = viaStore<typeof import('./ddb/positions.ts').observePosition>('lb/positions', 'observePosition');
export const listPositions = viaStore<typeof import('./ddb/positions.ts').listPositions>('lb/positions', 'listPositions');
export const knownEpisodeIds = viaStore<typeof import('./ddb/positions.ts').knownEpisodeIds>('lb/positions', 'knownEpisodeIds');
export const observePositions = viaStore<typeof import('./ddb/positions.ts').observePositions>('lb/positions', 'observePositions');
export const deleteAllPositions = viaStore<typeof import('./ddb/positions.ts').deleteAllPositions>('lb/positions', 'deleteAllPositions');
export const deletePositionsFor = viaStore<typeof import('./ddb/positions.ts').deletePositionsFor>('lb/positions', 'deletePositionsFor');
