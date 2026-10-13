// Stickers placed on a profile header: read them, replace them all, and what a viewer may see.
/**
 * M21 US9 (contracts/api.md; migration 019 `sticker_placements`). A PUT replaces the whole set in
 * one transaction. The server checks the catalogue id and the bounds, never whether the listener
 * has earned the sticker (that is worked out on the phone).
 */
import { viaStore } from '../../backend.ts';

/** Back to front (z), then by id, so every phone stacks them the same way. */
export const placementsFor = viaStore<typeof import('./ddb/index.ts').placementsFor>('ac/index', 'placementsFor');

export const replacePlacements = viaStore<typeof import('./ddb/index.ts').replacePlacements>('ac/index', 'replacePlacements');

/**
 * What a profile read carries about stickers (US9 + US10 privacy): the placements unless the owner
 * hides their decorations (then none, for every viewer, the owner too — what you see is what
 * others see), and `stickersHidden` when the owner hides their sticker library from others.
 */
export const stickerView = viaStore<typeof import('./ddb/index.ts').stickerView>('ac/index', 'stickerView');
