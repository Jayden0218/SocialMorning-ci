// Stores feedback with up to three small images; images deleted after 90 days.
/**
 * M10b US6 — feedback, with up to 3 small images, delivered to the owner (FR-019/020).
 * Images live in the existing database (no storage service — Principle V): each ≤ 250 000
 * bytes after the phone shrank it, JPEG or PNG by their first bytes (not by the claimed
 * type), readable only on the owner's /mod page, and deleted after 90 days.
 */
import { viaStore } from '../../backend.ts';

export const IMAGE_MAX_BYTES = 250_000;
export const IMAGES_MAX = 3;
export const IMAGE_DAYS = 90;

export type ImageIn = { mime: 'image/jpeg' | 'image/png'; bytes: Uint8Array };

/** The file's own first bytes decide what it is; a claimed type that disagrees is refused. */
export function sniff(bytes: Uint8Array): 'image/jpeg' | 'image/png' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return undefined;
}

export const createFeedback = viaStore<typeof import('./ddb/index.ts').createFeedback>('ac/index', 'createFeedback');

/** M23 US3: feedback messages with pictures this listener sent in the last 24 hours. */
export const imagesSentToday = viaStore<typeof import('./ddb/index.ts').imagesSentToday>('ac/index', 'imagesSentToday');

/** M23 US3: every stored feedback picture together, in bytes (the ceiling check). */
export const feedbackImageBytes = viaStore<typeof import('./ddb/index.ts').feedbackImageBytes>('ac/index', 'feedbackImageBytes');

export type FeedbackRow = { id: string; kind: string; body: string; app_version: string | null; created_at: string | Date; display_name: string | null; images: number };

export const recentFeedback = viaStore<typeof import('./ddb/index.ts').recentFeedback>('ac/index', 'recentFeedback');

export const feedbackImage = viaStore<typeof import('./ddb/index.ts').feedbackImage>('ac/index', 'feedbackImage');

/** FR-020: images older than 90 days are deleted (the text stays). */
export const sweepImages = viaStore<typeof import('./ddb/index.ts').sweepImages>('ac/index', 'sweepImages');
