// The social-graph phase of the account deletion job: follows both ways (with the other side's counters), activity, notices, playlist pointers.
/**
 * M26 lane SG, the `graph` phase of lane AC's `JOB#delete` (account/ddb/deletion.ts), run after `others` and before
 * `partition`. Each call handles at most CHUNK things and says whether the phase is done, so a crash half-way resumes.
 *
 * - Every follow edge in the leaving listener's partition goes with its twin in the OTHER listener's partition and
 *   that listener's counter (one transaction per edge, conditional on the edge — a second run moves nothing twice).
 *   This is the old `DELETE FROM follows WHERE follower_id = $1 OR followed_id = $1` (guard G7).
 * - Their activity (`ACT#`), its day/ref items, their recent listens (`LR#`) and the notices to them (`SN#<id>`) go.
 * - Pointers others keep to them (feed inbox, friends listening, notices they caused, mutes of them) are dropped at
 *   read time — every read joins the actor — and expire with their TTL (inbox 60 d, friends 7 d).
 * The rest of their partition (their mutes, muted threads, notices, playlists) is deleted by AC's `partition` phase.
 */
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Key } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { partitionItems, txa } from '../../account/ddb/common.ts';
import { addFollowCount } from '../../account/ddb/listeners.ts';
import type { Hybrid } from './common.ts';

const CHUNK = 25;
const keyOf = (i: Item): Key => ({ PK: String(i['PK']), SK: String(i['SK']) });

async function dropEdge(h: Hybrid, mine: Item, me: string): Promise<void> {
  const other = String(mine['otherId']);
  const iFollow = String(mine['SK']).startsWith(K.LISTENER_SK.follows);
  const twin = iFollow ? K.follower(other, me) : K.follow(other, me);
  const t = txa(h.store).delete('main', keyOf(mine), { condition: 'attribute_exists(PK)', label: 'edge' }).delete('main', twin);
  if (await get(h.store, 'main', K.listener(other))) addFollowCount(t, other, iFollow ? 'followerCount' : 'followingCount', -1);
  try { await t.commit(); } catch (e) { if (!(e instanceof TxCancelled && e.failed('edge'))) throw e; }
}

/** One step of the phase; true when nothing of this lane's is left for `listenerId`. */
export async function graphDeletionStep(h: Hybrid, listenerId: string): Promise<boolean> {
  const out = await partitionItems(h, K.L(listenerId), K.LISTENER_SK.follows, CHUNK);
  const inn = out.length < CHUNK ? await partitionItems(h, K.L(listenerId), K.LISTENER_SK.followers, CHUNK - out.length) : [];
  for (const e of [...out, ...inn]) await dropEdge(h, e, listenerId);
  if (out.length + inn.length > 0) return false;
  const gone: Key[] = [];
  const { items: acts } = await queryAll(h.store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `ACT#${listenerId}` }, ConsistentRead: true }, { max: CHUNK });
  for (const a of acts) {
    gone.push(keyOf(a));
    if (a['day']) gone.push(K.ev.activityDedupe(listenerId, String(a['kind']), String(a['episodeId']), String(a['day'])));
    if (a['refId']) gone.push(K.evSg.activityRef(String(a['kind']), String(a['refId'])));
  }
  const { items: listens } = await queryAll(h.store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `LR#${listenerId}` }, ConsistentRead: true }, { max: CHUNK });
  gone.push(...listens.map(keyOf));
  if (gone.length > 0) {
    await batchWriteAll(h.store, 'events', gone.map((k) => ({ delete: k })));
    return false;
  }
  const { items: notices } = await queryAll(h.store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SN#${listenerId}` }, ConsistentRead: true }, { max: CHUNK });
  const playlists = await partitionItems(h, K.L(listenerId), K.SG_SK.playlists);
  const owners = (await Promise.all(playlists.map(async (p) => ((await get(h.store, 'main', K.playlistOwner(String(p['id'])))) ? [K.playlistOwner(String(p['id']))] : [])))).flat();
  const main = [...notices.map(keyOf), ...owners];
  if (main.length > 0) {
    await batchWriteAll(h.store, 'main', main.map((k) => ({ delete: k })));
    return false;
  }
  return true;
}
