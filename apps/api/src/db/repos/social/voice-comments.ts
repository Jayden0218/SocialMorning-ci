// Voice comments: their recording limits, and deleting the audio of removed comments.
/**
 * M19 US6 (FR-044–FR-046, constitution v3.1.0). A comment may be a voice recording of at most 60 s,
 * in the voice store, kept like a text comment. When the author deletes it the route removes the
 * file at once; when moderation removes it, the internal cycle's sweep deletes the file and clears
 * the columns — removed means gone from storage, not merely hidden.
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import type { VoiceStorage } from '../../../storage/voice-blob.ts';

export const VOICE_COMMENT_SWEEP_BATCH = 100;

/** Removed comments still holding a recording: delete each file, then forget it. */
async function sweepRemovedVoicePg(db: Db, store: VoiceStorage): Promise<{ deleted: number; failed: number }> {
  const rows = await db.query<{ id: string; voice_url: string }>(
    `SELECT id, voice_url FROM comments WHERE voice_url IS NOT NULL AND (removed_at IS NOT NULL OR deleted_at IS NOT NULL) LIMIT ${VOICE_COMMENT_SWEEP_BATCH}`,
  );
  let deleted = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await store.remove(r.voice_url);
      await db.query('UPDATE comments SET voice_url = NULL, voice_path = NULL WHERE id = $1', [r.id]);
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}

// M26 lane SC: runs on Postgres, or on DynamoDB (`ddb/voice-comments.ts`) when the Db carries a Store (db/backend.ts).
export const sweepRemovedVoice = dual('sc/voice-comments', 'sweepRemovedVoice', sweepRemovedVoicePg);
