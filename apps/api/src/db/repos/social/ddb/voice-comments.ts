// Voice comments on DynamoDB: the recording of a removed comment leaves the voice store, then the item forgets it.
/**
 * M26 lane SC (SC-T05; M19 US6, guard G-M19-7). Same queue as removed pictures (`Q#removed-media`, comment-images.ts):
 * removed means gone from storage, not merely hidden. A deleted comment already dropped its recording (placeholder).
 */
import type { Db } from '../../../db.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import type { VoiceStorage } from '../../../../storage/voice-blob.ts';
import { VOICE_COMMENT_SWEEP_BATCH } from '../voice-comments.ts';
import * as B from './sc-bridge.ts';
import { commitRetry, keyOf, rawPg } from './sc-common.ts';
import { removedMedia } from './comment-images.ts';

export async function sweepRemovedVoice(store: Store, db: Db, voice: VoiceStorage): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const q of await removedMedia(store, VOICE_COMMENT_SWEEP_BATCH * 2)) {
    const it = await get(store, 'main', keyOf(q));
    if (!it?.['voiceUrl'] || !(it['removedAt'] || it['deletedAt'])) continue;
    try {
      await voice.remove(String(it['voiceUrl']));
      const lastMedia = !it['imagePath'];
      try {
        await commitRetry(store, (t) => {
          t.update('main', keyOf(it), {
            update: `REMOVE #u, #p${lastMedia ? ', G4PK, G4SK' : ''}`, condition: '#u = :u',
            names: { '#u': 'voiceUrl', '#p': 'voicePath' }, values: { ':u': it['voiceUrl'] }, label: 'comment',
          });
        });
      } catch (e) {
        if (!(e instanceof TxCancelled && e.failed('comment'))) throw e;
      }
      const raw = rawPg(db);
      if (raw) await B.setCommentColumns(raw, String(it['id']), { voice_url: null, voice_path: null });
      deleted++;
    } catch {
      failed++;
    }
    if (deleted + failed >= VOICE_COMMENT_SWEEP_BATCH) break;
  }
  return { deleted, failed };
}
