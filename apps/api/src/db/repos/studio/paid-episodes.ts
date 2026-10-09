// Database queries for paid shows and their episodes (M26 F0: moved here from routes/creators/paid.ts).
import type { Db } from '../../db.ts';

/** One row when the listener owns the show (a 'show' entitlement on its feed address). */
export async function showEntitlementRows(db: Db, listenerId: string, feedUrl: string): Promise<Record<string, unknown>[]> {
  return db.query("SELECT 1 FROM entitlements WHERE listener_id = $1 AND kind = 'show' AND ref = $2", [listenerId, feedUrl]);
}

/** The feed address of a paid, published, live episode. */
export async function paidEpisodeFeedRows(db: Db, id: string): Promise<{ feed_url: string }[]> {
  return db.query<{ feed_url: string }>(
    `SELECT s.feed_url FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
}

/** The free preview window of a paid, published, live episode. */
export async function paidEpisodePreviewRows(db: Db, id: string): Promise<{ preview_start_ms: number | null; preview_end_ms: number | null }[]> {
  return db.query<{ preview_start_ms: number | null; preview_end_ms: number | null }>(
    `SELECT e.preview_start_ms, e.preview_end_ms FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
}

/** The audio address of a paid, live episode. */
export async function paidEpisodeAudioRows(db: Db, id: string): Promise<{ audio_url: string }[]> {
  return db.query<{ audio_url: string }>('SELECT audio_url FROM hosted_episodes WHERE id = $1 AND paid AND deleted_at IS NULL', [id]);
}

export type PaidPreviewAudioRow = { audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; preview_start_ms: number | null; preview_end_ms: number | null };

/** What the preview proxy needs about a paid, published, live episode. */
export async function paidEpisodePreviewAudioRows(db: Db, id: string): Promise<PaidPreviewAudioRow[]> {
  return db.query<{ audio_url: string; audio_bytes: string | number; audio_type: string; duration_ms: number | null; preview_start_ms: number | null; preview_end_ms: number | null }>(
    `SELECT e.audio_url, e.audio_bytes, e.audio_type, e.duration_ms, e.preview_start_ms, e.preview_end_ms FROM hosted_episodes e JOIN hosted_shows s ON s.id = e.show_id
      WHERE e.id = $1 AND e.paid AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND e.status = 'published' AND e.published_at <= now()`, [id]);
}
