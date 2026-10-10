// Comment writes on DynamoDB: the 5-second floor from the author's index, posting and deleting, images, and the reaction toggle with its heat mark.
/**
 * M26 lane SC (SC-T01, SC-T04, SC-T08). The heat curve moves inside the writing transaction through lane LB's
 * helpers (src/heat/ddb.ts): a reaction is `L#<listener>/REACT#<episodeId>#<bb>` and its mark, one TransactWriteItems
 * (constitution: 100 buckets, one count per listener per bucket). While the bridge is on, the Postgres rows and
 * the Postgres `episode_heat` are rebuilt too (other lanes still read them).
 */
import { bucketOf } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Store } from '../../../ddb/store.ts';
import { TxCancelled } from '../../../ddb/tx.ts';
import { addHeatMark, removeHeatMark } from '../../../../heat/ddb.ts';
import { rebuildEpisodeHeat } from '../../../../heat/rebuild.ts';
import { countryOf } from '../../account/country.ts';
import { upsertEpisode, type EpisodeRow } from '../../library/episodes.ts';
import { createComment, deleteComment, type CommentRow } from '../comments.ts';
import * as B from './sc-bridge.ts';
import { bumpSocial, commentItemById, commitRetry, keyOf, nowIso, nowMs, rangeItems, rawPg } from './sc-common.ts';
import { heldImageBytes } from './sc-foreign.ts';
import { imageBytesHeld, imageBytesStep } from './comments.ts';

/** The floor: comments this author still has from the last `floorMs` (their index, read strongly; times from the items). */
export async function recentCommentRows(store: Store, _db: Db, authorId: string, floorMs: string): Promise<{ n: number }[]> {
  const since = nowMs(store) - Number(floorMs);
  // The index is ordered by the time a comment was written; a minute of slack, then the item's own time decides.
  const lo = `CMT#${new Date(since - 60_000).toISOString()}`;
  const items = await rangeItems(store, K.L(authorId), lo, 'CMT#~', { keep: (i) => Date.parse(String(i['createdAt'])) > since });
  return [{ n: items.length }];
}

export async function postCommentInTx(
  _store: Store, db: Db, episode: EpisodeRow, episodeId: string, listenerId: string,
  body: { body: string; offsetMs?: number | undefined; parentId?: string | undefined; durationMs?: number | undefined },
  countryHeader: string | undefined,
): Promise<CommentRow> {
  return db.transaction(async (tx) => {
    if (body.durationMs !== undefined && episode.duration_ms === null) {
      await upsertEpisode(tx, {
        id: episode.id, feedUrl: episode.feed_url, guid: episode.guid, title: episode.title,
        enclosureUrl: episode.enclosure_url, durationMs: body.durationMs,
      });
    }
    const country = countryOf(countryHeader);
    const row = await createComment(tx, { episodeId, authorId: listenerId, body: body.body, offsetMs: body.offsetMs, parentId: body.parentId, ...(country ? { country } : {}) });
    const raw = rawPg(tx);
    if (raw && body.offsetMs !== undefined) await rebuildEpisodeHeat(raw, episodeId); // the bridge's episode_heat
    return row;
  });
}

export async function deleteCommentInTx(_store: Store, db: Db, id: string): Promise<{ placeholder: boolean; episodeId: string }> {
  return db.transaction(async (tx) => {
    const r = await deleteComment(tx, id);
    const raw = rawPg(tx);
    if (raw) await rebuildEpisodeHeat(raw, r.episodeId);
    return r;
  });
}

export async function postVoiceCommentInTx(
  _store: Store, db: Db, episodeId: string, authorId: string,
  v: { offsetMs: number | undefined; parentId: string | undefined; url: string; path: string; ms: number; transcript: string | undefined; country: string | undefined },
): Promise<CommentRow> {
  const { offsetMs, parentId, transcript, country } = v;
  return db.transaction(async (tx) => {
    const row = await createComment(tx, { episodeId, authorId, body: null, ...(offsetMs !== undefined ? { offsetMs } : {}), ...(parentId ? { parentId } : {}), voice: { url: v.url, path: v.path, ms: v.ms, ...(transcript ? { transcript } : {}) }, ...(country ? { country } : {}) });
    const raw = rawPg(tx);
    if (raw && offsetMs !== undefined) await rebuildEpisodeHeat(raw, episodeId);
    return row;
  });
}

/** The image store's bytes for comments: the kept counter (§7 B) plus the pictures waiting with held comments (lane ST). */
export async function commentImageBytesRows(store: Store, db: Db): Promise<{ n: string | number | null }[]> {
  return [{ n: (await imageBytesHeld(store)) + (await heldImageBytes(db)) }];
}

export async function setCommentImage(store: Store, db: Db, id: string, url: string, path: string, w: number, h: number, bytes: number): Promise<void> {
  const it = await commentItemById(store, id);
  if (it) {
    const before = Number(it['imageBytes'] ?? 0);
    const at = nowIso(store);
    await commitRetry(store, (t) => {
      t.update('main', keyOf(it), {
        update: 'SET #u = :u, #p = :p, #w = :w, #h = :h, #b = :b',
        condition: before > 0 ? 'attribute_exists(PK) AND #b = :before' : 'attribute_exists(PK) AND attribute_not_exists(#b)',
        names: { '#u': 'imageUrl', '#p': 'imagePath', '#w': 'imageW', '#h': 'imageH', '#b': 'imageBytes' },
        values: { ':u': url, ':p': path, ':w': w, ':h': h, ':b': bytes, ...(before > 0 ? { ':before': before } : {}) },
      });
      imageBytesStep(t, bytes - before);
      bumpSocial(t, String(it['episodeId']), at);
    });
  }
  const raw = rawPg(db);
  if (raw) await B.setCommentColumns(raw, id, { image_url: url, image_path: path, image_w: w, image_h: h, image_bytes: bytes });
}

/**
 * PUT /v1/episodes/:id/reactions: fill a missing duration, then remove this listener's reaction in the segment or
 * add one — the reaction item and its heat mark in one transaction. A toggle racing another toggle of the same
 * segment re-reads and decides again (the `reaction` condition), so the end state is one of the two, never both.
 */
export async function toggleReactionInTx(
  store: Store, db: Db, found: EpisodeRow, episodeId: string, listenerId: string, body: { offsetMs: number; durationMs?: number | undefined },
): Promise<{ reacted: boolean; bucket: number }> {
  let episode: EpisodeRow = found;
  if (episode.duration_ms === null && body.durationMs !== undefined) {
    episode = await upsertEpisode(db, {
      id: episode.id, feedUrl: episode.feed_url, guid: episode.guid, title: episode.title,
      enclosureUrl: episode.enclosure_url, durationMs: body.durationMs,
    });
  }
  if (episode.duration_ms === null) {
    throw new ApiError('duration_unknown', "This episode's length isn't known yet, so a moment can't be placed.");
  }
  const bucket = bucketOf(body.offsetMs, episode.duration_ms);
  const key = K.reaction(listenerId, episodeId, bucket);
  const mark = { episodeId, listenerId, bucket };
  let reacted = false;
  const at = nowIso(store);
  for (let attempt = 1; ; attempt++) {
    const cur = await get(store, 'main', key);
    try {
      if (cur) {
        await removeHeatMark(store, mark, (t) => { t.delete('main', key, { condition: 'attribute_exists(PK)', label: 'reaction' }); });
        reacted = false;
      } else {
        await addHeatMark(store, mark, (t) => {
          t.put('main', encode('reaction', key, { listenerId, episodeId, bucket, offsetMs: body.offsetMs, createdAt: at }), { condition: 'attribute_not_exists(PK)', label: 'reaction' });
        });
        reacted = true;
      }
      break;
    } catch (e) {
      if (attempt < 4 && e instanceof TxCancelled && e.failed('reaction')) continue;
      throw e;
    }
  }
  const raw = rawPg(db);
  if (raw) {
    if (reacted) await B.insertReaction(raw, { listenerId, episodeId, bucket, offsetMs: body.offsetMs, createdAt: at });
    else await B.deleteReaction(raw, listenerId, episodeId, bucket);
    await rebuildEpisodeHeat(raw, episodeId);
  }
  return { reacted, bucket };
}
