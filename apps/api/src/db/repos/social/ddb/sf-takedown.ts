// Moderation's take-down setters for clips, chat messages and statuses on DynamoDB (lane SF's additive file in lane SC's folder).
/**
 * M26 lane SF (head note: "no take-down setters yet for clips, chat messages and statuses — add them in SC's ddb folder").
 * The items stay lane SC's; these only set or clear what the old SQL set, each with its Postgres bridge row (sc-bridge.ts):
 * - clip: `removedAt` on the clip item (found by `clipItemById`);
 * - chat message: `removedAt` on `CH#<pair>/M#<id>` (found through `CHM#<id>`, `chatRef`);
 * - status: removal ends it now (`expiresAt` = now, and its queue key `Q#statuses` so the hourly sweep deletes it
 *   on time — constitution V); restoring (an accepted appeal) gives back `createdAt + 24 h` only while that is still ahead.
 * Each is idempotent (a second call changes nothing), so moderation's outbox entry can re-apply it.
 */
import * as K from '../../../ddb/keys.ts';
import { ttlAfter } from '../../../ddb/codec.ts';
import { get, update } from '../../../ddb/store.ts';
import type { Db } from '../../../db.ts';
import type { Store } from '../../../ddb/store.ts';
import * as B from './sc-bridge.ts';
import { clipItemById } from './clips.ts';
import { STATUS_LIFE_MS } from './voice-posts.ts';
import { keyOf, nowIso, nowMs, rawPg } from './sc-common.ts';

const DAY_MS = 86_400_000;
const condFailed = (e: unknown) => (e as { name?: string }).name === 'ConditionalCheckFailedException';

export async function setClipRemovedItem(store: Store, db: Db, id: string, removed: boolean): Promise<boolean> {
  const it = await clipItemById(store, id);
  if (!it || Boolean(it['removedAt']) === removed) return false;
  const at = nowIso(store);
  try {
    await update(store, 'main', keyOf(it), removed
      ? { update: 'SET #r = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#r)', names: { '#r': 'removedAt' }, values: { ':at': at } }
      : { update: 'REMOVE #r', condition: 'attribute_exists(#r)', names: { '#r': 'removedAt' } });
  } catch (e) { if (condFailed(e)) return false; throw e; }
  const raw = rawPg(db);
  if (raw) await B.setClipRemoved(raw, id, removed ? at : null);
  return true;
}

export async function setChatRemovedItem(store: Store, db: Db, id: string, removed: boolean): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  const n = Number(id);
  const ref = await get(store, 'main', K.chatRef(n));
  if (!ref) return false;
  const key = { PK: String(ref['pk']), SK: `M#${K.pad(n)}` };
  const at = nowIso(store);
  try {
    await update(store, 'main', key, removed
      ? { update: 'SET #r = :at', condition: 'attribute_exists(PK) AND attribute_not_exists(#r)', names: { '#r': 'removedAt' }, values: { ':at': at } }
      : { update: 'REMOVE #r', condition: 'attribute_exists(#r)', names: { '#r': 'removedAt' } });
  } catch (e) { if (condFailed(e)) return false; throw e; }
  const raw = rawPg(db);
  if (raw) await B.setChatRemoved(raw, n, removed ? at : null);
  return true;
}

/** Ends a live status now (removed = true) or gives back its 24 hours while they last (removed = false). */
export async function setStatusEnded(store: Store, db: Db, id: string, removed: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const p = await get(store, 'main', K.voicePost(id));
  if (!p) return false;
  const now = nowMs(store);
  const exp = Date.parse(String(p['expiresAt']));
  const target = removed ? now : Date.parse(String(p['createdAt'])) + STATUS_LIFE_MS;
  if (removed ? exp <= now : (target <= now || exp >= target)) return false;
  const at = new Date(target).toISOString();
  try {
    await update(store, 'main', K.voicePost(id), {
      update: 'SET #e = :e, G4SK = :sk, #ttl = :ttl', condition: '#e = :old',
      names: { '#e': 'expiresAt', '#ttl': 'ttl' }, values: { ':e': at, ':sk': `${at}#${id}`, ':ttl': ttlAfter(target, DAY_MS), ':old': p['expiresAt'] },
    });
  } catch (e) { if (condFailed(e)) return false; throw e; }
  const ptr = K.voicePostPtr(String(p['listenerId']), String(p['createdAt']), id);
  await update(store, 'main', ptr, { update: 'SET #e = :e', condition: 'attribute_exists(PK)', names: { '#e': 'expiresAt' }, values: { ':e': at } }).catch((e: unknown) => { if (!condFailed(e)) throw e; });
  const raw = rawPg(db);
  if (raw) await raw.query('UPDATE voice_posts SET expires_at = $2 WHERE id = $1', [id, at]);
  return true;
}
