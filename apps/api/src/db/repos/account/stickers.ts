// Stickers placed on a profile header: read them, replace them all, and what a viewer may see.
/**
 * M21 US9 (contracts/api.md; migration 019 `sticker_placements`). A PUT replaces the whole set in
 * one transaction. The server checks the catalogue id and the bounds, never whether the listener
 * has earned the sticker (that is worked out on the phone).
 */
import type { Placement } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

type Row = { sticker_id: string; x: number; y: number; scale: number; rot: number; z: number };

/** Back to front (z), then by id, so every phone stacks them the same way. */
export const placementsFor = dual('ac/index', 'placementsFor', async (db: Db, listenerId: string): Promise<Placement[]> => {
  const rows = await db.query<Row>('SELECT sticker_id, x, y, scale, rot, z FROM sticker_placements WHERE listener_id = $1 ORDER BY z, sticker_id', [listenerId]);
  return rows.map((r) => ({ stickerId: r.sticker_id, x: Number(r.x), y: Number(r.y), scale: Number(r.scale), rot: Number(r.rot), z: Number(r.z) }));
});

export const replacePlacements = dual('ac/index', 'replacePlacements', async (db: Db, listenerId: string, items: readonly Placement[]): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM sticker_placements WHERE listener_id = $1', [listenerId]);
    for (const p of items) {
      await tx.query(
        'INSERT INTO sticker_placements (listener_id, sticker_id, x, y, scale, rot, z) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [listenerId, p.stickerId, p.x, p.y, p.scale, p.rot, p.z],
      );
    }
  });
});

/**
 * What a profile read carries about stickers (US9 + US10 privacy): the placements unless the owner
 * hides their decorations (then none, for every viewer, the owner too — what you see is what
 * others see), and `stickersHidden` when the owner hides their sticker library from others.
 */
export const stickerView = dual('ac/index', 'stickerView', async (db: Db, listenerId: string, viewerId: string | undefined): Promise<{ stickers: Placement[]; stickersHidden?: true }> => {
  const [l] = await db.query<{ hide_stickers: boolean; hide_decorations: boolean }>('SELECT hide_stickers, hide_decorations FROM listeners WHERE id = $1', [listenerId]);
  const stickers = l?.hide_decorations ? [] : await placementsFor(db, listenerId);
  return { stickers, ...(l?.hide_stickers && viewerId !== listenerId ? { stickersHidden: true as const } : {}) };
});
