// Show-to-show similarity on DynamoDB: each rebuild writes a new generation; one pointer item says which one readers use.
/**
 * M26 lane DV, DV-T03/T04 (patterns DV-69…DV-74), data-model.md §3 `SIM#…` and "Lane DV changes".
 *
 * The SQL wrote `show_similarity_next` chunk by chunk and swapped the tables in one transaction at the end, so a
 * reader never saw half a neighbourhood. DynamoDB cannot swap tables or delete thousands of rows atomically, so:
 * - rows: `SIM#<generation>#<feedKey(show_a)> / <(1-sim) padded>#<feedKey(show_b)>` (type `similarity`: generation,
 *   showA, showB, sim, computedAt) — one Query per show gives its neighbours best first; TTL 30 days (old generations
 *   expire; the hourly rebuild writes a new one every ≥ 20 h, so the current one never gets near it);
 * - pointer: `CFG#sim-current / V` (type `simPointer`): `generation` (what readers use), `computedAt`, and while a
 *   rebuild runs `building` (the generation being written). The first chunk starts a new `building` generation
 *   (any half-built one is abandoned, as the SQL emptied `_next`); every chunk writes rows only under `building`;
 *   the LAST chunk flips `generation` to it in one conditional UpdateItem. A reader mid-rebuild still reads the old
 *   generation — never a mix (guard G-M26-DV3).
 * - Rule 2 kept: a private listener contributes nothing (`privateListening` on lane AC's listener item, read here and
 *   nowhere else); rule 3 kept: a row holds feed URLs and a number, no listener id (codec allowlist).
 * - `similarityAgeHours` = hours since the pointer's `computedAt` (the SQL's max(computed_at)).
 */
import { randomUUID } from 'node:crypto';
import { LIKE_FINISHED, swingSimilarity, type Liker, type Neighbour } from '@socialmorning/social-core';
import type { Db } from '../../../db.ts';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchWriteAll } from '../../../ddb/batch.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, update, type Store } from '../../../ddb/store.ts';
import type { RebuildResult } from '../similarity.ts';
import { allListeners, DAY_MS, episodesByIds, iso, mapLimit, nowMs, partitionItems } from './common.ts';

export const SIM_KEEP_DAYS = 30;

/** Who likes what: live subscriptions, or ≥ LIKE_FINISHED finished episodes of a show — never a private listener. */
export async function likers(store: Store, _db: Db): Promise<Liker[]> {
  const people = (await allListeners(store)).filter((l) => l['privateListening'] !== true).map((l) => String(l['id'])).sort();
  const per = await mapLimit(people, 16, async (id) => {
    const [subs, pos] = await Promise.all([
      partitionItems(store, K.L(id), { prefix: K.LISTENER_SK.subs }),
      partitionItems(store, K.L(id), { prefix: K.LISTENER_SK.positions, filter: { expr: '#f = :t', names: { '#f': 'finished' }, values: { ':t': true } } }),
    ]);
    const shows = new Set(subs.filter((s) => !s['deletedAt']).map((s) => String(s['feedUrl'])));
    const eps = await episodesByIds(store, pos.map((p) => String(p['episodeId'])));
    const finished = new Map<string, number>();
    for (const p of pos) {
      const e = eps.get(String(p['episodeId']));
      if (e) finished.set(e.feed_url, (finished.get(e.feed_url) ?? 0) + 1);
    }
    for (const [feed, n] of finished) if (n >= LIKE_FINISHED) shows.add(feed);
    return { listenerId: id, shows: [...shows].sort() };
  });
  return per.filter((l) => l.shows.length > 0);
}

async function pointer(store: Store): Promise<{ generation?: string; computedAt?: string; building?: string } | undefined> {
  const p = await get(store, 'main', K.simPointer());
  if (!p) return undefined;
  return {
    ...(typeof p['generation'] === 'string' ? { generation: p['generation'] } : {}),
    ...(typeof p['computedAt'] === 'string' ? { computedAt: p['computedAt'] } : {}),
    ...(typeof p['building'] === 'string' ? { building: p['building'] } : {}),
  };
}

export async function rebuildSimilarity(store: Store, db: Db, cursor: string | undefined, limit = 200): Promise<RebuildResult> {
  const map = swingSimilarity(await likers(store, db));
  const shows = [...map.keys()].sort();
  const from = cursor === undefined ? 0 : shows.findIndex((s) => s > cursor);
  const slice = from < 0 ? [] : shows.slice(from, from + limit);
  const now = nowMs(store);
  const at = iso(now);

  let gen = cursor === undefined ? undefined : (await pointer(store))?.building;
  if (gen === undefined) {
    // A new build (the SQL's `DELETE FROM show_similarity_next`): readers keep the current generation meanwhile.
    gen = `${at.replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 8)}`;
    await update(store, 'main', K.simPointer(), {
      update: 'SET #t = :t, #b = :b, #bs = :at, #n = :zero', names: { '#t': 't', '#b': 'building', '#bs': 'buildingSince', '#n': 'buildingRows' }, values: { ':t': 'simPointer', ':b': gen, ':at': at, ':zero': 0 },
    });
  }

  const ttl = ttlAfter(now, SIM_KEEP_DAYS * DAY_MS);
  const puts = slice.flatMap((show) => map.get(show)!.map((n) => ({
    put: encode('similarity', K.similarity(gen!, show, n.sim, n.show), { generation: gen!, showA: show, showB: n.show, sim: n.sim, computedAt: at }, { ttl }),
  })));
  await batchWriteAll(store, 'main', puts);
  if (puts.length > 0) {
    await update(store, 'main', K.simPointer(), { update: 'ADD #n :k', condition: '#b = :g', names: { '#n': 'buildingRows', '#b': 'building' }, values: { ':k': puts.length, ':g': gen } });
  }

  const last = slice[slice.length - 1];
  const more = from >= 0 && from + limit < shows.length;
  if (!more) {
    // The flip: readers move to the new generation in one write, only if it is still the one being built.
    // An empty generation has no age, as an empty table had no max(computed_at): the next hour builds again.
    const old = await get(store, 'main', K.simPointer());
    const empty = Number(old?.['buildingRows'] ?? 0) === 0;
    await update(store, 'main', K.simPointer(), {
      update: `SET #g = :g, #p = :prev${empty ? '' : ', #c = :at'} REMOVE #b, #bs, #n${empty ? ', #c' : ''}`,
      condition: '#b = :g',
      names: { '#g': 'generation', '#c': 'computedAt', '#p': 'previous', '#b': 'building', '#bs': 'buildingSince', '#n': 'buildingRows' },
      values: { ':g': gen, ':prev': (old?.['generation'] as string | undefined) ?? null, ...(empty ? {} : { ':at': at }) },
    });
    return { done: true, written: puts.length, shows: shows.length };
  }
  return { done: false, ...(last === undefined ? {} : { next: last }), written: puts.length, shows: shows.length };
}

/** Neighbours of the given shows, best first, from the generation the pointer names. */
export async function neighboursOf(store: Store, _db: Db, shows: readonly string[]): Promise<Map<string, readonly Neighbour[]>> {
  const out = new Map<string, Neighbour[]>();
  if (shows.length === 0) return out;
  const gen = (await pointer(store))?.generation;
  if (gen === undefined) return out;
  const lists = await mapLimit([...new Set(shows)], 8, async (show) => {
    const { items } = await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SIM#${gen}#${K.feedKey(show)}` }, ConsistentRead: true,
    });
    // Rows of another show colliding on the 22-character key (never seen) are dropped by `showA`.
    return { show, rows: items.filter((i) => i['showA'] === show).map((i) => ({ show: String(i['showB']), sim: Number(i['sim']) })) };
  });
  for (const { show, rows } of lists) {
    if (rows.length === 0) continue;
    rows.sort((a, b) => b.sim - a.sim);
    out.set(show, rows);
  }
  return out;
}

/** Hours since the generation readers use was made, or null if there never was one (research R4). */
export async function similarityAgeHours(store: Store, _db: Db): Promise<number | null> {
  const at = (await pointer(store))?.computedAt;
  return at === undefined ? null : (nowMs(store) - Date.parse(at)) / 3_600_000;
}
