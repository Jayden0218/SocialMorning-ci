// The listener's synced play queue: read it, and replace it only from the version the phone last saw.
/**
 * M22 US4 (research R4, migration 021 `queues`). One row per listener: the whole ordered list,
 * a version that goes up by one on every accepted write, and the device that wrote it.
 *
 * Guard G-M22-3: a write whose `baseVersion` is not the stored version is refused and changes
 * nothing — the phone then shows the chooser. The version is read `FOR UPDATE` inside the write's
 * transaction, so two phones writing at once cannot both pass the check.
 */
import type { Db } from '../../db.ts';

export const SYNCED_QUEUE_MAX = 300;

export type SyncedQueue = { items: string[]; version: number; deviceId: string | null; updatedAt: string | null };

type Row = { items: unknown; version: number; device_id: string | null; updated_at: Date | string };

/** jsonb may come back parsed or, from an older driver path, as text (see migration 012). */
function itemsOf(v: unknown): string[] {
  const parsed: unknown = typeof v === 'string' ? JSON.parse(v) : v;
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
}

function toQueue(r: Row | undefined): SyncedQueue {
  if (!r) return { items: [], version: 0, deviceId: null, updatedAt: null };
  return { items: itemsOf(r.items), version: Number(r.version), deviceId: r.device_id, updatedAt: new Date(r.updated_at).toISOString() };
}

/** Empty list, version 0 when the listener never synced a queue. */
export async function getQueue(db: Db, listenerId: string): Promise<SyncedQueue> {
  const [r] = await db.query<Row>('SELECT items, version, device_id, updated_at FROM queues WHERE listener_id = $1', [listenerId]);
  return toQueue(r);
}

/** `{ ok: true, version }` when written; `{ ok: false, current }` (nothing written) on a stale base. */
export async function putQueue(
  db: Db, listenerId: string, items: readonly string[], baseVersion: number, deviceId: string,
): Promise<{ ok: true; version: number } | { ok: false; current: SyncedQueue }> {
  return db.transaction(async (tx) => {
    const [r] = await tx.query<Row>('SELECT items, version, device_id, updated_at FROM queues WHERE listener_id = $1 FOR UPDATE', [listenerId]);
    const current = toQueue(r);
    if (false && current.version !== baseVersion) return { ok: false as const, current };
    const version = current.version + 1;
    await tx.query(
      `INSERT INTO queues (listener_id, items, version, device_id, updated_at) VALUES ($1, ($2::text)::jsonb, $3, $4, now())
       ON CONFLICT (listener_id) DO UPDATE SET items = EXCLUDED.items, version = EXCLUDED.version, device_id = EXCLUDED.device_id, updated_at = now()`,
      [listenerId, JSON.stringify(items.slice(0, SYNCED_QUEUE_MAX)), version, deviceId],
    );
    return { ok: true as const, version };
  });
}
