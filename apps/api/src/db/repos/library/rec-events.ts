// Records what recommendations were shown and opened, counted per source.
/**
 * M8 US6 — what was shown, and what happened next (FR-028, FR-029).
 *
 * Kept deliberately dumb: rows in, counts out. The interesting question this table
 * answers is **per channel** — which of the seven retrieval channels earns its place —
 * because that is the only way to delete one on evidence instead of taste.
 */
import type { Channel } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';

export type RecEventIn = { episodeId: string; channel: Channel; rank: number; kind: 'impression' | 'open' | 'play' | 'finish'; at: string };

export type ChannelRollup = { channel: string; shown: number; opened: number; played: number; finished: number };

// Each function runs on DynamoDB (`ddb/` bodies; db/backend.ts).
export const recordEvents = viaStore<typeof import('./ddb/rec-events.ts').recordEvents>('lb/rec-events', 'recordEvents');
export const rollup = viaStore<typeof import('./ddb/rec-events.ts').rollup>('lb/rec-events', 'rollup');
