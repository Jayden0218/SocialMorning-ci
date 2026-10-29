// The Studio's facts and hourly rollups on DynamoDB: one small item per counted thing in the show's partition, kept in step with its source.
/**
 * M26 lane ST, ST-T05 (patterns ST-115…ST-123, ST-127, ST-133, ST-134, ST-158), data-model.md "Lane ST changes".
 *
 * The Studio counts things other lanes own — a `listened` activity (lane SG), a reaction (SC), a saved episode (LB),
 * listened ranges and a finished position (LB) — per SHOW, and none of those items is indexed by show. So each source
 * write tells the Studio, and the Studio keeps one FACT per counted thing in `SX#<feedKey>` (sm-events):
 *
 *   P#<day>#<episodeId>#<listenerId>   a play: one `listened` activity (one listener, one episode, one day — hidden included)
 *   L#<episodeId>#<listenerId>          a like: the listener's FIRST reaction on the episode (`at`)
 *   V#<episodeId>#<listenerId>          a save: a live `fav_episode` library item (`at` = its updatedAt)
 *   R#<episodeId>#<listenerId>          what the listener heard of the episode (merged ranges) and whether they finished it
 *   S#<at>#<id>                         a share (the Studio's own `share_events`, written here)
 *
 * How a source tells: an outbox entry `st:fact` { kind, listenerId, episodeId[, day] } — in the source's own
 * transaction where it has one (SG's activity, SC's reaction, LB's ranges), right after the write where it is a single
 * Put (LB's library item and position). The handler never trusts the entry: it RE-READS the source and makes the fact
 * match it (`refreshFact`), so an entry that runs twice, late or out of order changes nothing.
 *
 * Rollups `R#st#<feedKey>#<metric>` / `yyyy-mm-ddThh` (likes, saves, shares) and `… #plays` / `yyyy-mm-dd` (plays, by the
 * listener's own day, as the SQL's `activity.day`) move in the SAME transaction as the fact they count, conditioned on
 * the fact's state — so a rollup always equals a recount of the facts (guard G-M26-ST3), and the nightly check
 * (`checkRollups`) recounts yesterday and repairs any drift (Principle IV).
 * Account deletion: each fact has a pointer `STF#<listenerId>/<feedKey>#<sk>`; the deletion phase walks them.
 */
import { randomUUID } from 'node:crypto';
import { mergeRanges, unionLength, type Range } from '@socialmorning/social-core';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { queryDay } from '../../../ddb/day-index.ts';
import { withRetry, isConditionFailed, isConflict } from '../../../ddb/retry.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, type Tx } from '../../../ddb/tx.ts';
import { enqueue, registerHandler } from '../../../../jobs/outbox.ts';
import { DAY_MS, keyOf, nowIso, nowMs, partition, str } from './common.ts';

export const ST_FACT = 'st:fact';
export type FactKind = 'play' | 'like' | 'save' | 'pair';
export type FactIn = { kind: FactKind; listenerId: string; episodeId: string; day?: string | null };

/** Rollup metrics: hourly, except plays (by the listener's own day). */
export type RollMetric = 'plays' | 'likes' | 'saves' | 'shares';

/** The source tells the Studio, inside its own transaction. */
export function enqueueFact(t: Tx, store: Store, f: FactIn): void {
  enqueue(t, store, { kind: ST_FACT, payload: { kind: f.kind, listenerId: f.listenerId, episodeId: f.episodeId, ...(f.day ? { day: f.day } : {}) } });
}

/** The source tells the Studio right after a single-item write (an outbox entry of its own). */
export async function enqueueFactNow(store: Store, f: FactIn): Promise<void> {
  const t = tx(store);
  enqueueFact(t, store, f);
  await t.commit();
}

registerHandler(ST_FACT, async (store, entry) => {
  const p = entry.payload as FactIn;
  await refreshFact(store, p);
});

const hourOf = (at: string): string => K.ts(at).slice(0, 13);
const skOf = (f: FactIn): string => {
  switch (f.kind) {
    case 'play': return `P#${f.day}#${f.episodeId}#${f.listenerId}`;
    case 'like': return `L#${f.episodeId}#${f.listenerId}`;
    case 'save': return `V#${f.episodeId}#${f.listenerId}`;
    case 'pair': return `R#${f.episodeId}#${f.listenerId}`;
  }
};
const METRIC: Record<FactKind, RollMetric | null> = { play: 'plays', like: 'likes', save: 'saves', pair: null };
const TYPE = { play: 'stPlay', like: 'stLike', save: 'stSave', pair: 'stRanges' } as const;
/** The rollup bucket a fact counts in: the listener's day for a play, the UTC hour of `at` otherwise. */
const bucketOf = (kind: FactKind, fact: { day?: unknown; at?: unknown }): string => (kind === 'play' ? String(fact.day) : hourOf(String(fact.at)));

/** Adds `n` to one rollup item in `t`. */
export function rollAdd(t: Tx, fk: string, metric: RollMetric, bucket: string, n: number): void {
  t.update('events', K.stRollup(fk, metric, bucket), {
    update: 'SET #t = :t, #m = :m ADD #n :n', names: { '#t': 't', '#m': 'metric', '#n': 'n' }, values: { ':t': 'rollup', ':m': `st:${metric}`, ':n': n },
    label: `roll:${metric}:${bucket}`,
  });
}

type Want = Record<string, unknown> | null;

/** What the fact should hold now, read from its source (null: there should be no fact). */
async function wantOf(store: Store, f: FactIn): Promise<Want> {
  switch (f.kind) {
    case 'play': {
      if (!f.day) return null;
      const mark = await get(store, 'events', K.ev.activityDedupe(f.listenerId, 'listened', f.episodeId, f.day));
      const owner = str(mark?.['owner']);
      if (!owner) return null;
      const [pk, sk] = owner.split('|') as [string, string];
      const act = await get(store, 'events', { PK: pk, SK: sk });
      return act ? { day: f.day, at: String(act['createdAt']), activityId: Number(act['id']) } : null;
    }
    case 'like': {
      const { items } = await queryAll(store, 'main', {
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(f.listenerId), ':p': `REACT#${f.episodeId}#` }, ConsistentRead: true,
      });
      if (items.length === 0) return null;
      return { at: items.map((i) => K.ts(String(i['createdAt']))).sort()[0]! };
    }
    case 'save': {
      const lib = await get(store, 'main', K.libraryItem(f.listenerId, 'fav_episode', f.episodeId));
      return lib && !lib['deletedAt'] ? { at: K.ts(String(lib['updatedAt'])) } : null;
    }
    case 'pair': {
      const [{ items }, pos] = await Promise.all([
        queryAll(store, 'main', { KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(f.listenerId), ':p': `RANGE#${f.episodeId}#` }, ConsistentRead: true }),
        get(store, 'main', K.position(f.listenerId, f.episodeId)),
      ]);
      const ranges = mergeRanges(items.flatMap((i) => (i['ranges'] as unknown as Range[] | undefined) ?? []));
      const finished = pos?.['finished'] === true;
      return ranges.length === 0 && !finished ? null : { ranges, finished };
    }
  }
}

/** The fact's show: the episode's feed (lane LB's META). No episode, no show — nothing to count (the SQL's JOIN). */
async function feedKeyOf(store: Store, episodeId: string): Promise<string | undefined> {
  const ep = await get(store, 'main', K.episode(episodeId));
  return ep ? K.feedKey(String(ep['feedUrl'])) : undefined;
}

/**
 * Makes one fact match its source: put, move or delete it, with its rollup in the same transaction, conditioned on the
 * fact as read — a racing refresh fails the condition and starts again from the source. `force: 'gone'` deletes it
 * whatever the source says (the listener's account is being deleted).
 */
export async function refreshFact(store: Store, f: FactIn, opts: { fk?: string; force?: 'gone' } = {}): Promise<void> {
  const fk = opts.fk ?? (await feedKeyOf(store, f.episodeId));
  if (!fk) return;
  const sk = skOf(f);
  const key = K.stFact(fk, sk);
  const metric = METRIC[f.kind];
  await withRetry(async () => {
    const [want, cur] = await Promise.all([opts.force === 'gone' ? Promise.resolve(null) : wantOf(store, f), get(store, 'events', key)]);
    if (!want && !cur) return;
    const t = tx(store);
    const ptr = K.stFactPtr(f.listenerId, fk, sk);
    const v = Number(cur?.['v'] ?? 0);
    const seen = { condition: 'attribute_exists(PK) AND #v = :v', names: { '#v': 'v' }, values: { ':v': v }, label: 'fact' };
    if (!want) {
      t.delete('events', key, seen);
      t.delete('events', ptr);
      if (metric) rollAdd(t, fk, metric, bucketOf(f.kind, cur!), -1);
    } else {
      const item = encode(TYPE[f.kind], key, { episodeId: f.episodeId, listenerId: f.listenerId, ...want, v: v + 1 }, { gsi: K.E1(K.day(String(want['at'] ?? nowIso(store))), 'st', `${fk}#${sk}`) });
      const same = cur && JSON.stringify(stripMeta(cur)) === JSON.stringify(stripMeta(item));
      if (same) return;
      t.put('events', item, cur ? seen : { condition: 'attribute_not_exists(PK)', label: 'fact' });
      if (!cur) t.put('events', encode('stFactPtr', ptr, { pk: key.PK, sk: key.SK }));
      if (metric) {
        const to = bucketOf(f.kind, want);
        const from = cur ? bucketOf(f.kind, cur) : null;
        if (from !== to) {
          if (from !== null) rollAdd(t, fk, metric, from, -1);
          rollAdd(t, fk, metric, to, 1);
        }
      }
    }
    await t.commit();
  }, { tries: 5, retryOn: (e) => isConditionFailed(e) || isConflict(e) });
}

const stripMeta = (i: Item): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(i)) if (k !== 'v' && k !== 'E1PK' && k !== 'E1SK') out[k] = v;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

// ---- shares (the Studio's own events) ----

/** A share: the event in the show's partition, its hourly rollup and the sharer's burst marker — one transaction. */
export async function recordShare(store: Store, s: { listenerId: string | null; targetKind: string; targetId: string; feedUrl: string }): Promise<void> {
  const fk = K.feedKey(s.feedUrl);
  const id = await nextSeq(store, 'share_events');
  const at = nowIso(store);
  const sk = `S#${K.ts(at)}#${K.pad(id)}`;
  const t = tx(store).put('events', encode('shareEvent', K.stFact(fk, sk), { id, listenerId: s.listenerId, targetKind: s.targetKind, targetId: s.targetId, feedUrl: s.feedUrl, at }, {
    gsi: K.E1(K.day(at), 'st', `${fk}#${sk}`),
  }), { condition: 'attribute_not_exists(PK)' });
  rollAdd(t, fk, 'shares', hourOf(at), 1);
  if (s.listenerId) {
    t.put('events', encode('shareRate', K.shareRate(s.listenerId, at, String(id)), { at }, { ttl: ttlAfter(nowMs(store), DAY_MS) }));
    t.put('events', encode('stFactPtr', K.stFactPtr(s.listenerId, fk, sk), { pk: `SX#${fk}`, sk }));
  }
  await t.commit();
}

/** Shares this listener made in the last minute (the burst limit). */
export async function recentShares(store: Store, listenerId: string): Promise<number> {
  const from = new Date(nowMs(store) - 60_000).toISOString();
  return (await partition(store, 'events', `SHR#${listenerId}`, { from })).length;
}

// ---- reading facts and rollups ----

export type Facts = { plays: Item[]; likes: Item[]; saves: Item[]; ranges: Item[]; shares: Item[] };

/** Every fact of a show, one partition Query (paged at 1 MB). */
export async function factsOf(store: Store, feedUrl: string): Promise<Facts> {
  const all = await partition(store, 'events', `SX#${K.feedKey(feedUrl)}`);
  const out: Facts = { plays: [], likes: [], saves: [], ranges: [], shares: [] };
  for (const i of all) {
    const sk = String(i['SK']);
    if (sk.startsWith('P#')) out.plays.push(i);
    else if (sk.startsWith('L#')) out.likes.push(i);
    else if (sk.startsWith('V#')) out.saves.push(i);
    else if (sk.startsWith('R#')) out.ranges.push(i);
    else if (sk.startsWith('S#')) out.shares.push(i);
  }
  return out;
}

/** Rollup items of one metric between two buckets (inclusive), as bucket → n. */
export async function rollups(store: Store, feedUrl: string, metric: RollMetric, from: string, to: string): Promise<Map<string, number>> {
  const items = await partition(store, 'events', `R#st#${K.feedKey(feedUrl)}#${metric}`, { from, to: `${to}~` });
  return new Map(items.map((i) => [String(i['SK']), Number(i['n'] ?? 0)]));
}

/** A recount of one UTC day from the facts: metric → bucket → n (plays by their day; the rest by UTC hour). */
export async function recountDay(store: Store, fk: string, day: string): Promise<Record<RollMetric, Map<string, number>>> {
  const out: Record<RollMetric, Map<string, number>> = { plays: new Map(), likes: new Map(), saves: new Map(), shares: new Map() };
  const add = (m: RollMetric, b: string) => out[m].set(b, (out[m].get(b) ?? 0) + 1);
  for (const i of await partition(store, 'events', `SX#${fk}`)) {
    const sk = String(i['SK']);
    if (sk.startsWith('P#')) { if (String(i['day']) === day) add('plays', day); continue; }
    const at = String(i['at'] ?? '');
    if (!at.startsWith(day)) continue;
    if (sk.startsWith('L#')) add('likes', hourOf(at));
    else if (sk.startsWith('V#')) add('saves', hourOf(at));
    else if (sk.startsWith('S#')) add('shares', hourOf(at));
  }
  return out;
}

/** The stored rollups of one UTC day of a show: metric → bucket → n (zeros left out). */
export async function storedDay(store: Store, fk: string, day: string): Promise<Record<RollMetric, Map<string, number>>> {
  const out: Record<RollMetric, Map<string, number>> = { plays: new Map(), likes: new Map(), saves: new Map(), shares: new Map() };
  for (const m of ['plays', 'likes', 'saves', 'shares'] as const) {
    for (const i of await partition(store, 'events', `R#st#${fk}#${m}`, m === 'plays' ? { from: day, to: day } : { from: `${day}T00`, to: `${day}T23` })) {
      const n = Number(i['n'] ?? 0);
      if (n !== 0) out[m].set(String(i['SK']), n);
    }
  }
  return out;
}

/**
 * The nightly check (an hourly sweep step, once per UTC day): every show with a fact dated `day` (E1 `DAY#<day>`) is
 * recounted and each rollup that differs is set to the recount. Returns how many rollup items were repaired.
 */
export async function checkRollups(store: Store, day: string): Promise<number> {
  const items = await queryDay(store, day, { condition: 'begins_with(E1SK, :p)', values: { ':p': 'st#' } });
  const shows = new Set(items.map((i) => String(i['E1SK']).split('#')[1]!));
  let fixed = 0;
  for (const fk of shows) {
    const [want, have] = await Promise.all([recountDay(store, fk, day), storedDay(store, fk, day)]);
    for (const m of ['plays', 'likes', 'saves', 'shares'] as const) {
      const buckets = new Set([...want[m].keys(), ...have[m].keys()]);
      for (const b of buckets) {
        const n = want[m].get(b) ?? 0;
        if ((have[m].get(b) ?? 0) === n) continue;
        const t = tx(store);
        t.update('events', K.stRollup(fk, m, b), { update: 'SET #t = :t, #m = :m, #n = :n', names: { '#t': 't', '#m': 'metric', '#n': 'n' }, values: { ':t': 'rollup', ':m': `st:${m}`, ':n': n } });
        await t.commit();
        fixed++;
      }
    }
  }
  return fixed;
}

// ---- account deletion ----

/** One step of the deletion phase: up to 25 of the listener's facts go (a share keeps its count, loses the sharer). True when none is left. */
export async function deleteFactsStep(store: Store, listenerId: string): Promise<boolean> {
  const ptrs = await partition(store, 'events', `STF#${listenerId}`, { max: 25 });
  if (ptrs.length === 0) return true;
  for (const p of ptrs) {
    const fk = String(p['SK']).split('#')[0]!;
    const sk = String(p['sk']);
    if (sk.startsWith('S#')) {
      const t = tx(store);
      t.update('events', { PK: String(p['pk']), SK: sk }, { update: 'SET #l = :n', condition: 'attribute_exists(PK)', names: { '#l': 'listenerId' }, values: { ':n': null } });
      await t.commit().catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
      await tx(store).delete('events', keyOf(p)).commit();
      continue;
    }
    const [kind, a, b, c] = sk.split('#') as [string, string, string, string];
    const f: FactIn | null = kind === 'P' ? { kind: 'play', day: a, episodeId: b, listenerId: c }
      : kind === 'L' ? { kind: 'like', episodeId: a, listenerId: b }
      : kind === 'V' ? { kind: 'save', episodeId: a, listenerId: b }
      : kind === 'R' ? { kind: 'pair', episodeId: a, listenerId: b } : null;
    if (f) await refreshFact(store, f, { fk, force: 'gone' });
    await tx(store).delete('events', keyOf(p)).commit();
  }
  return false;
}

export const newId = (): string => randomUUID();
export { unionLength };
