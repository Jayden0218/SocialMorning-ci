// The listener's synced play queue: read it, and replace it only from the version the phone last saw.
/**
 * M22 US4 (research R4). One row per listener: the whole ordered list,
 * a version that goes up by one on every accepted write, and the device that wrote it.
 *
 * Guard G-M22-3: a write whose `baseVersion` is not the stored version is refused and changes
 * nothing — the phone then shows the chooser. The check is a condition on the write itself, so two
 * phones writing at once cannot both pass it.
 */
import { SYNCED_QUEUE_MAX } from '@socialmorning/social-core';
import { viaStore } from '../../backend.ts';
export { SYNCED_QUEUE_MAX };

export type SyncedQueue = { items: string[]; version: number; deviceId: string | null; updatedAt: string | null };

/** Empty list, version 0 when the listener never synced a queue. */
export const getQueue = viaStore<typeof import('./ddb/index.ts').getQueue>('ac/index', 'getQueue');

/** `{ ok: true, version }` when written; `{ ok: false, current }` (nothing written) on a stale base. */
export const putQueue = viaStore<typeof import('./ddb/index.ts').putQueue>('ac/index', 'putQueue');
