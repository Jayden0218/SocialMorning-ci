// Account deletion, lane ST's phase: the listener's Studio items and the facts that count them, a chunk at a time.
/**
 * M26 lane ST (AC-T09's "each lane replaces its part of `others`"). The old cascade from `listeners` reached these
 * Studio tables: creator_claims, show_members, show_hosts, show_mutes, show_curators, hosted_shows → hosted_episodes,
 * poll_votes, held_comments, milestones_sent — and, through activity / reactions / library items / listened ranges /
 * share events, every Studio number. On DynamoDB the phase `studio` (after `others`, before lane SC's `social`) walks
 * the listener's own pointers and undoes each, idempotently, up to 25 a step:
 *   facts (`STF#<id>` → plays, likes, saves, heard ranges leave their show's counts; a share keeps its count, loses its sharer),
 *   held comments (`L#/HELD#`), host and mute pointers (`HOSTOF#`, `SMUTEON#` → the show's `HOST#` / `SMUTE#`),
 *   role copies (`ROLES#`: a helper's `TEAM#` goes; an owner's proven claim is revoked — `U#PROVEN` freed),
 *   Studio-made shows (`HOSTED#` → the show, its episodes and their bytes, the feed pointer; the Postgres row too),
 *   poll votes (`PVOTE#` → the poll's counts), milestone copies (`MSTONE#` → the show's `MILESTONE#`), curator rows.
 * The pointers themselves are in `L#<id>` and go with lane AC's `partition` phase. `*_by` ids on items others keep
 * (announcement author, poll creator, invite creator, override editor) are never shown and are left as they are —
 * as `admin_audit` keeps its ids (data-model.md "Lane ST changes").
 */
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { deleteFactsStep } from './facts.ts';
import { deleteHeldStep } from './comments.ts';
import { removeVoteOf } from './announce.ts';
import { bridgeOf, keyOf, partition, type Db } from './common.ts';

const CHUNK = 25;

async function swallow(p: Promise<unknown>): Promise<void> {
  try { await p; } catch (e) { if (!isConditionFailed(e)) throw e; }
}

/** One step; true when nothing of the listener is left in lane ST's items. */
export async function deleteStudioStep(store: Store, db: Db, listenerId: string): Promise<boolean> {
  if (!(await deleteFactsStep(store, listenerId))) return false;
  if (!(await deleteHeldStep(store, listenerId))) return false;
  const L = K.L(listenerId);
  const [hostOf, muteOn, roles, hosted, votes, stones] = await Promise.all([
    partition(store, 'main', L, { prefix: K.ST_SK.hostOf, max: CHUNK }),
    partition(store, 'main', L, { prefix: K.ST_SK.muteOn, max: CHUNK }),
    partition(store, 'main', L, { prefix: K.ST_SK.roles, max: CHUNK }),
    partition(store, 'main', L, { prefix: K.ST_SK.hosted, max: CHUNK }),
    partition(store, 'main', L, { prefix: K.ST_SK.votes, max: CHUNK }),
    partition(store, 'main', L, { prefix: K.ST_SK.milestones, max: CHUNK }),
  ]);
  for (const h of hostOf) await tx(store).delete('main', K.showHost(String(h['feedUrl']), listenerId)).delete('main', keyOf(h)).commit();
  for (const m of muteOn) await tx(store).delete('main', K.showMute(String(m['feedUrl']), listenerId)).delete('main', keyOf(m)).commit();
  for (const r of roles) {
    const feedUrl = String(r['feedUrl']);
    const t = tx(store).delete('main', keyOf(r));
    if (r['role'] === 'operator') t.delete('main', K.teamMember(feedUrl, listenerId));
    else t.delete('main', K.U.proven(feedUrl), { condition: 'attribute_not_exists(PK) OR #l = :me', names: { '#l': 'listenerId' }, values: { ':me': listenerId } });
    await swallow(t.commit());
  }
  // A proven claim without a role copy (written before the copy existed) frees its feed too.
  for (const c of await partition(store, 'main', L, { prefix: K.ST_SK.claims })) {
    if (c['status'] !== 'proven') continue;
    await swallow(tx(store).delete('main', K.U.proven(String(c['feedUrl'])), { condition: '#c = :id', names: { '#c': 'claimId' }, values: { ':id': String(c['id']) } })
      .update('main', keyOf(c), { update: 'SET #s = :r', names: { '#s': 'status' }, values: { ':r': 'revoked' } }).commit());
  }
  for (const p of hosted) {
    const showId = String(p['showId']);
    const eps = await partition(store, 'main', `HS#${showId}`);
    const bytes = eps.filter((e) => String(e['SK']).startsWith('E#') && !e['deletedAt']).reduce((n, e) => n + Number(e['audioBytes'] ?? 0), 0);
    const show = await get(store, 'main', K.hostedShow(showId));
    await batchWriteAll(store, 'main', [
      ...eps.filter((e) => String(e['SK']).startsWith('E#')).flatMap((e) => [{ delete: keyOf(e) }, { delete: K.hostedEpisodeRef(String(e['id'])) }]),
      ...(show ? [{ delete: K.hostedFeed(String(show['feedUrl'])) }] : []),
    ]);
    const t = tx(store).delete('main', K.hostedShow(showId)).delete('main', keyOf(p));
    if (bytes > 0) t.update('main', K.config('bytes'), { update: 'ADD #b :d', names: { '#b': 'hostedAudioBytes' }, values: { ':d': -bytes } });
    await t.commit();
    const raw = bridgeOf(db);
    if (raw) await raw.query('DELETE FROM hosted_shows WHERE id = $1', [showId]);
  }
  for (const v of votes) await removeVoteOf(store, String(v['pollId']), listenerId);
  for (const s of stones) {
    const feedUrl = String(s['feedUrl']);
    const m = Number(s['milestone']);
    const t = tx(store).delete('main', keyOf(s));
    if (Number.isInteger(m)) t.delete('main', K.milestoneSent(feedUrl, m), { condition: 'attribute_not_exists(PK) OR #l = :me', names: { '#l': 'listenerId' }, values: { ':me': listenerId } });
    await swallow(t.commit());
  }
  const curators = (await partition(store, 'main', 'CFG#curators')).filter((c) => c['listenerId'] === listenerId);
  if (curators.length) await batchWriteAll(store, 'main', curators.map((c) => ({ delete: keyOf(c) })));
  const more = [hostOf, muteOn, roles, hosted, votes, stones].some((xs) => xs.length >= CHUNK);
  return !more;
}
