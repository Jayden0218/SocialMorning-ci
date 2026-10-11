// Stores feedback with up to three small images; images deleted after 90 days.
/**
 * M10b US6 — feedback, with up to 3 small images, delivered to the owner (FR-019/020).
 * Images live in the existing database (no storage service — Principle V): each ≤ 250 000
 * bytes after the phone shrank it, JPEG or PNG by their first bytes (not by the claimed
 * type), readable only on the owner's /mod page, and deleted after 90 days.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

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

export const createFeedback = dual('ac/index', 'createFeedback', async (db: Db, f: { listenerId: string | null; kind: string; body: string; appVersion?: string; images: readonly ImageIn[] }): Promise<string> => {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      'INSERT INTO feedback (listener_id, kind, body, app_version) VALUES ($1, $2, $3, $4) RETURNING id',
      [f.listenerId, f.kind, f.body, f.appVersion ?? null],
    );
    const id = row!.id;
    let n = 0;
    for (const img of f.images.slice(0, IMAGES_MAX)) {
      n++;
      await tx.query('INSERT INTO feedback_images (feedback_id, n, mime, bytes) VALUES ($1, $2, $3, $4)', [id, n, img.mime, img.bytes]);
    }
    return id;
  });
});

/** M23 US3: feedback messages with pictures this listener sent in the last 24 hours. */
export const imagesSentToday = dual('ac/index', 'imagesSentToday', async (db: Db, listenerId: string): Promise<number> => {
  const [r] = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM feedback f
      WHERE f.listener_id = $1 AND f.created_at > now() - interval '24 hours'
        AND EXISTS (SELECT 1 FROM feedback_images i WHERE i.feedback_id = f.id)`,
    [listenerId],
  );
  return r?.n ?? 0;
});

/** M23 US3: every stored feedback picture together, in bytes (the ceiling check). */
export const feedbackImageBytes = dual('ac/index', 'feedbackImageBytes', async (db: Db): Promise<number> => {
  const [r] = await db.query<{ n: string | number }>('SELECT COALESCE(sum(octet_length(bytes)), 0)::bigint AS n FROM feedback_images');
  return Number(r?.n ?? 0);
});

export type FeedbackRow = { id: string; kind: string; body: string; app_version: string | null; created_at: string | Date; display_name: string | null; images: number };

export const recentFeedback = dual('ac/index', 'recentFeedback', async (db: Db, limit = 50): Promise<FeedbackRow[]> => {
  return db.query<FeedbackRow>(
    `SELECT f.id, f.kind, f.body, f.app_version, f.created_at, l.display_name,
            (SELECT count(*)::int FROM feedback_images i WHERE i.feedback_id = f.id) AS images
     FROM feedback f LEFT JOIN listeners l ON l.id = f.listener_id
     ORDER BY f.created_at DESC LIMIT $1`,
    [limit],
  );
});

export const feedbackImage = dual('ac/index', 'feedbackImage', async (db: Db, id: string, n: number): Promise<{ mime: string; bytes: Uint8Array } | undefined> => {
  const [r] = await db.query<{ mime: string; bytes: Uint8Array }>('SELECT mime, bytes FROM feedback_images WHERE feedback_id = $1 AND n = $2', [id, n]);
  return r;
});

/** FR-020: images older than 90 days are deleted (the text stays). */
export const sweepImages = dual('ac/index', 'sweepImages', async (db: Db): Promise<number> => {
  const rows = await db.query<{ n: number }>(`DELETE FROM feedback_images WHERE created_at < now() - ($1 || ' days')::interval RETURNING n`, [String(IMAGE_DAYS)]);
  return rows.length;
});
