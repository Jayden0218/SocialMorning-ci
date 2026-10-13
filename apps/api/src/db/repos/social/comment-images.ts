// Comment images: deleting them from the store when their comment or their author goes.
/**
 * M20 US9 (spec FR-055; constitution v3.2.0, G-M20-8). An image is deleted from storage — not
 * merely hidden — when its author deletes the comment (the route does it at once), when moderation
 * removes it (the internal cycle's sweep, which also retries a failed delete), and, for every image
 * of an account, before the account is deleted. A comment its host hid keeps its image: its author
 * still sees it.
 */
import { viaStore } from '../../backend.ts';

export const IMAGE_SWEEP_BATCH = 100;

// Bodies in ddb/comment-images.ts (src/db/backend.ts).
export const sweepRemovedImages = viaStore<typeof import('./ddb/comment-images.ts').sweepRemovedImages>('sc/comment-images', 'sweepRemovedImages');
export const removeImagesFor = viaStore<typeof import('./ddb/comment-images.ts').removeImagesFor>('sc/comment-images', 'removeImagesFor');
