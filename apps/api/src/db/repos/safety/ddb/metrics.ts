// The admin dashboard on DynamoDB: numbers recounted from the source items behind the 5-minute cache, and the nightly check of the safety counters.
/**
 * M26 lane SF (M18 on DynamoDB; data-model.md "Lane SF changes"). Same numbers, same shape, each section still
 * fails on its own (`section()` of admin/metrics.ts); days are UTC+8 calendar days (the Kuala Lumpur day of the
 * `DA#` keys is the same day). Nothing here returns a listener's id, email or name (G-AD2).
 *
 * Where each number comes from:
 * - users      — lane AC's listener items on G4 `Q#listeners` (total, suspended, new per day); app use = the
 *                listener's session pointers `L#<id>/SESS#…` → `SESS#<tokenHash>` items (not `studio-web`,
 *                `lastSeenAt` within d days); `DA#<day>` partitions in sm-events (Select COUNT per day; the earliest
 *                day of the last 400 that has one = recordedSince).
 * - listening  — lane LB's `L#<id>/LDAY#<day>` rollups (`eps` = episode → union ms), episode META for the show;
 *                finished = `POS#` items finished with receivedAt ≥ the range start.
 * - library    — LB's `SE#<feedKey>` events read by UTC day through E1 `DAY#<day>` / `se#…` (KEYS_ONLY → BatchGet),
 *                bucketed by the UTC+8 day of `at`; top shows = show META on G4 `Q#feeds` by `subscriberCount`.
 * - recs       — LB's hourly rollup `R#recs#all` (one counter per `channel|kind`), from the range's first hour.
 * - safety     — lane SF's own hourly counters `R#dash#<metric>` (dash.ts); open reports = G4 `Q#reports-open`.
 * - social, money, creators — lanes still on Postgres: the same SQL on the plain handle (bottom of this file).
 * Recounting on demand is fine behind the cache: the dashboard is the owner's page, opened a few times a day.
 *
 * `checkDashboard` (guard G-M26-SF4) recounts one UTC+8 day of the safety counters per UTC hour from the items
 * (`recountDay`) and sets any counter that drifted to the recount.
 */
import type { NativeAttributeValue } from '@aws-sdk/lib-dynamodb';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll, countAll } from '../../../ddb/paginate.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { get, put, queryPage, update } from '../../../ddb/store.ts';
import { deleteCacheKey } from '../../cache.ts';
import {
  creatorsSection, rangeDays, section, series, socialSection, startOf, summariseListening, utc8Day,
  type ListenedEntry, type MetricRange, type Metrics,
} from '../../admin/metrics.ts';
import { DASH_METRICS, dashKey, type DashMetric } from './dash.ts';
import { DAY_MS, getMany, iso, keyOf, pgOf, queue, queueCount, type Db, type Item, type Store } from './common.ts';

const STUDIO = 'studio-web';
/** How far back `recordedSince` looks: the sweep keeps 400 days (old-rows-sweep.ts). */
const KEEP_DAYS = 400;
/** Parallel requests per round (per-listener reads, day partitions). */
const FAN = 25;

/** `f` over `xs`, FAN at a time, results in order. */
async function fan<T, R>(xs: readonly T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += FAN) out.push(...(await Promise.all(xs.slice(i, i + FAN).map(f))));
  return out;
}

/** Rows `{ d, n }` from a day → count map. */
const toRows = (m: Map<string, number>) => [...m].map(([d, n]) => ({ d, n }));
const bump = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const daPk = (d: string) => K.ev.dailyActive(d, '-').PK;
/** The UTC day `yyyy-mm-dd` `n` days after `d`. */
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isSet = (v: unknown) => v !== undefined && v !== null;

/** Every listener item (lane AC's G4 `Q#listeners`, projection ALL). */
const allListeners = (store: Store): Promise<Item[]> => queue(store, 'listeners');

/** Items of one listener partition under an SK prefix (or SK range), strongly consistent. */
async function listenerItems(store: Store, id: string, cond: { prefix: string } | { from: string; to: string }): Promise<Item[]> {
  const values: Record<string, string> = { ':pk': K.L(id) };
  let expr = 'PK = :pk';
  if ('prefix' in cond) { expr += ' AND begins_with(SK, :p)'; values[':p'] = cond.prefix; }
  else { expr += ' AND SK BETWEEN :from AND :to'; values[':from'] = cond.from; values[':to'] = cond.to; }
  return (await queryAll(store, 'main', { KeyConditionExpression: expr, ExpressionAttributeValues: values, ConsistentRead: true })).items;
}

// ---- users ----

/** The newest `lastSeenAt` of each listener's app sessions (a Studio session never counts — G-AD3). */
async function lastSeenByListener(store: Store, ids: readonly string[]): Promise<number[]> {
  return fan(ids, async (id) => {
    const ptrs = await listenerItems(store, id, { prefix: K.LISTENER_SK.sessions });
    const sessions = await getMany(store, 'main', ptrs.flatMap((p) => (p['tokenHash'] ? [K.session(String(p['tokenHash']))] : [])));
    let best = Number.NEGATIVE_INFINITY;
    for (const s of sessions) {
      if (s['deviceLabel'] === STUDIO) continue;
      const t = Date.parse(String(s['lastSeenAt']));
      if (t > best) best = t;
    }
    return best;
  });
}

/** The earliest day (UTC+8) of the last 400 that has an app-use marker, oldest first; null when none. */
async function recordedSince(store: Store, now: number): Promise<string | null> {
  const today = utc8Day(now);
  const days = Array.from({ length: KEEP_DAYS + 1 }, (_, i) => plusDays(today, i - KEEP_DAYS));
  for (let i = 0; i < days.length; i += FAN) {
    const batch = days.slice(i, i + FAN);
    const hit = await Promise.all(batch.map(async (d) => ((await queryPage(store, 'events', {
      KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': daPk(d) }, Limit: 1, ProjectionExpression: 'PK',
    })).Items ?? []).length > 0));
    const k = hit.indexOf(true);
    if (k >= 0) return batch[k]!;
  }
  return null;
}

const users = (store: Store, days: string[], now: number) => section('users', async () => {
  const listeners = await allListeners(store);
  const from = Date.parse(startOf(days[0]!));
  const created = new Map<string, number>();
  for (const l of listeners) { const t = Date.parse(String(l['createdAt'])); if (t >= from) bump(created, utc8Day(t)); }
  const [seen, dau, since] = await Promise.all([
    lastSeenByListener(store, listeners.map((l) => String(l['id']))),
    fan(days, async (d) => ({ d, n: await countAll(store, 'events', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': daPk(d) } }) })),
    recordedSince(store, now),
  ]);
  const activeIn = (d: number) => seen.filter((t) => t > now - d * DAY_MS).length;
  return {
    total: listeners.length,
    suspended: listeners.filter((l) => isSet(l['suspendedAt'])).length,
    active: { d1: activeIn(1), d7: activeIn(7), d30: activeIn(30) },
    newPerDay: series(days, toRows(created)),
    dauPerDay: series(days, dau),
    recordedSince: since,
  };
});

// ---- listening ----

const listening = (store: Store, days: string[]) => section('listening', async () => {
  const from = Date.parse(startOf(days[0]!));
  const ids = (await allListeners(store)).map((l) => String(l['id']));
  const per = await fan(ids, async (id) => {
    const [ldays, positions] = await Promise.all([
      listenerItems(store, id, { from: `LDAY#${days[0]!}`, to: `LDAY#${days[days.length - 1]!}` }),
      listenerItems(store, id, { prefix: K.LISTENER_SK.positions }),
    ]);
    const unions = ldays.flatMap((it) => Object.entries((it['eps'] as unknown as Record<string, number> | undefined) ?? {})
      .map(([episode, ms]) => ({ listener: id, episode, d: String(it['day']), ms: Number(ms) })));
    const finished = positions.filter((p) => p['finished'] === true && Date.parse(String(p['receivedAt'])) >= from).length;
    return { unions, finished };
  });
  const unions = per.flatMap((p) => p.unions);
  const eps = new Map((await getMany(store, 'main', [...new Set(unions.map((u) => u.episode))].map((e) => K.episode(e)))).map((it) => [String(it['id']), it]));
  const str = (v: unknown) => (isSet(v) ? String(v) : null);
  const entries: ListenedEntry[] = unions.map((u) => {
    const e = eps.get(u.episode);
    return { ...u, feedUrl: str(e?.['feedUrl']), title: str(e?.['title']), showTitle: str(e?.['showTitle']) };
  });
  const { listenersPerDay, hoursPerDay, topShows, topEpisodes } = summariseListening(days, entries);
  return { listenersPerDay, hoursPerDay, finished: per.reduce((s, p) => s + p.finished, 0), topShows, topEpisodes };
});

// ---- library ----

const library = (store: Store, days: string[]) => section('library', async () => {
  const start = startOf(days[0]!);
  const from = Date.parse(start);
  // The UTC days that hold the range's instants: the day before the first UTC+8 day (its 16:00Z start) … the last.
  const utcDays: string[] = [];
  for (let d = start.slice(0, 10); d <= days[days.length - 1]!; d = plusDays(d, 1)) utcDays.push(d);
  const keys = (await fan(utcDays, async (d) => (await queryAll(store, 'events', {
    IndexName: K.INDEX.E1, KeyConditionExpression: 'E1PK = :d AND begins_with(E1SK, :se)', ExpressionAttributeValues: { ':d': `DAY#${d}`, ':se': 'se#' },
  })).items.map(keyOf))).flat();
  const added = new Map<string, number>();
  const removed = new Map<string, number>();
  for (const ev of await getMany(store, 'events', keys)) {
    const t = Date.parse(String(ev['at']));
    if (!(t >= from)) continue;
    if (ev['kind'] === 'sub') bump(added, utc8Day(t));
    else if (ev['kind'] === 'unsub') bump(removed, utc8Day(t));
  }
  const shows = (await queue(store, 'feeds'))
    .map((m) => ({ feedUrl: String(m['feedUrl']), title: isSet(m['newestTitle']) ? String(m['newestTitle']) : String(m['feedUrl']), subscribers: Number(m['subscriberCount'] ?? 0) }))
    .filter((s) => s.subscribers > 0)
    .sort((a, b) => b.subscribers - a.subscribers || (a.feedUrl < b.feedUrl ? -1 : a.feedUrl > b.feedUrl ? 1 : 0))
    .slice(0, 10);
  return { addedPerDay: series(days, toRows(added)), removedPerDay: series(days, toRows(removed)), topShows: shows };
});

// ---- recs ----

const recs = (store: Store, days: string[]) => section('recs', async () => {
  const first = K.ev.rollup('recs', 'all', startOf(days[0]!));
  const { items } = await queryAll(store, 'events', { KeyConditionExpression: 'PK = :pk AND SK >= :from', ExpressionAttributeValues: { ':pk': first.PK, ':from': first.SK } });
  const by = new Map<string, { channel: string; shown: number; played: number }>();
  for (const it of items) {
    for (const [attr, n] of Object.entries(it)) {
      const bar = attr.indexOf('|');
      if (bar <= 0) continue;
      const channel = attr.slice(0, bar);
      const kind = attr.slice(bar + 1);
      const row = by.get(channel) ?? { channel, shown: 0, played: 0 };
      if (kind === 'impression') row.shown += Number(n);
      else if (kind === 'play') row.played += Number(n);
      by.set(channel, row);
    }
  }
  return { byChannel: [...by.values()].sort((a, b) => (a.channel < b.channel ? -1 : a.channel > b.channel ? 1 : 0)) };
});

// ---- safety (lane SF's own hourly counters) ----

async function counterSum(store: Store, metric: DashMetric, fromIso: string): Promise<number> {
  const k = dashKey(metric, fromIso);
  const { items } = await queryAll(store, 'events', { KeyConditionExpression: 'PK = :pk AND SK >= :from', ExpressionAttributeValues: { ':pk': k.PK, ':from': k.SK } });
  return items.reduce((s, it) => s + Number(it['n'] ?? 0), 0);
}

const safety = (store: Store, days: string[]) => section('safety', async () => {
  const from = startOf(days[0]!);
  const [openReports, reports, actions, blocks] = await Promise.all([
    queueCount(store, 'reports-open'), counterSum(store, 'reports', from), counterSum(store, 'actions', from), counterSum(store, 'blocks', from),
  ]);
  return { openReports, reports, actions, blocks };
});

export async function computeMetrics(store: Store, db: Db, range: MetricRange, now: number = store.clock.now()): Promise<Metrics> {
  const days = rangeDays(range, now);
  const sections = {
    users: await users(store, days, now),
    listening: await listening(store, days),
    library: await library(store, days),
    social: await social(db, days),
    recs: await recs(store, days),
    safety: await safety(store, days),
    money: await money(store, days),
    creators: await creators(db),
  };
  return {
    days: range, from: days[0]!, to: days[days.length - 1]!, countedAt: new Date(now).toISOString(),
    partial: Object.values(sections).some((s) => !s.ok),
    sections,
  };
}

/** Drops one cached dashboard result (lane LB's cache on DynamoDB). */
export async function dropCachedMetrics(_store: Store, db: Db, key: string): Promise<void> {
  await deleteCacheKey(db, key);
}

// ---- the nightly check (guard G-M26-SF4) ----

export type Recount = Record<DashMetric, Record<string, number>>;

/**
 * One UTC+8 day of the safety counters recounted from the items, per UTC hour (`yyyy-mm-ddThh`, the counter's SK):
 * reports from both report queues (every report is on exactly one: `Q#reports-open` by createdAt,
 * `Q#reports-closed` by closedAt ≥ createdAt) by createdAt; actions from `Q#actions`; blocks that exist from `Q#blocks`.
 */
export async function recountDay(store: Store, day: string): Promise<Recount> {
  const from = Date.parse(startOf(day));
  const to = from + DAY_MS;
  const fromIso = iso(from);
  const toIso = iso(to);
  const out: Recount = { reports: {}, actions: {}, blocks: {} };
  const count = (metric: DashMetric, items: Item[], type: string) => {
    for (const it of items) {
      if (it['t'] !== type) continue;
      const at = String(it['createdAt']);
      const t = Date.parse(at);
      if (!(t >= from && t < to)) continue;
      const sk = dashKey(metric, at).SK;
      out[metric][sk] = (out[metric][sk] ?? 0) + 1;
    }
  };
  const [open, closed, actions, blocks] = await Promise.all([
    queue(store, 'reports-open', { from: fromIso, to: toIso }),
    queue(store, 'reports-closed', { from: fromIso }),
    queue(store, 'actions', { from: fromIso, to: toIso }),
    queue(store, 'blocks', { from: fromIso, to: toIso }),
  ]);
  count('reports', [...open, ...closed], 'report');
  count('actions', actions, 'moderationAction');
  count('blocks', blocks, 'block');
  return out;
}

/** The lock that makes the automatic run once a night (the sweep runs hourly). */
const checkLock = (day: string) => K.U.lock(`dash-check#${day}`);

/**
 * Compares each hour's counter of `day` (default: yesterday, UTC+8, by the Store clock — then once per day) with
 * `recountDay` and sets a counter that differs to the recount (conditioned on the value read, so a racing event
 * is never overwritten — the next night sees it). Returns how many counters it repaired; each is logged.
 */
export async function checkDashboard(store: Store, _db: Db, day?: string): Promise<number> {
  const now = store.clock.now();
  const d = day ?? utc8Day(now - DAY_MS);
  if (day === undefined && (await get(store, 'main', checkLock(d)))) return 0;
  const recount = await recountDay(store, d);
  const start = Date.parse(startOf(d));
  let fixed = 0;
  for (const metric of DASH_METRICS) {
    const first = dashKey(metric, iso(start));
    const last = dashKey(metric, iso(start + DAY_MS - 1));
    const { items } = await queryAll(store, 'events', {
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :a AND :b', ExpressionAttributeValues: { ':pk': first.PK, ':a': first.SK, ':b': last.SK }, ConsistentRead: true,
    });
    const have = new Map(items.map((it) => [String(it['SK']), Number(it['n'] ?? 0)]));
    for (let h = 0; h < 24; h++) {
      const key = dashKey(metric, iso(start + h * 3_600_000));
      const want = recount[metric][key.SK] ?? 0;
      const got = have.get(key.SK);
      if ((got ?? 0) === want) continue;
      const values: Record<string, NativeAttributeValue> = { ':t': 'rollup', ':m': metric, ':n': want };
      if (got !== undefined) values[':seen'] = got;
      try {
        await update(store, 'events', key, {
          update: 'SET #t = :t, #m = :m, #n = :n',
          condition: got === undefined ? 'attribute_not_exists(PK)' : '#n = :seen',
          names: { '#t': 't', '#m': 'metric', '#n': 'n' },
          values,
        });
      } catch (e) {
        if (isConditionFailed(e)) continue; // an event moved it meanwhile: next night
        throw e;
      }
      console.warn(`[dashboard check] ${metric} ${key.SK}: counter ${got ?? 0} → recount ${want}`);
      fixed++;
    }
  }
  if (day === undefined) await put(store, 'main', encode('unique', checkLock(d), { owner: 'dash-check' }, { ttl: ttlAfter(now, 7 * DAY_MS) }));
  return fixed;
}

// ---- money: lane PD's items (moved) — each listener's purchase pointers (`PURCH#`) and tips (`TIP#`) ----

/** Same four numbers as the SQL: live purchases, purchases and tips since the range start, amounts per currency. */
const money = (store: Store, days: string[]) => section('money', async () => {
  const from = startOf(days[0]!);
  const ids = (await allListeners(store)).map((l) => String(l['id']));
  const per = await fan(ids, async (id) => {
    const items = (await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :p)', ExpressionAttributeValues: { ':pk': K.L(id), ':p': K.PD_SK.purchases }, ConsistentRead: true,
    })).items;
    const tips = (await queryAll(store, 'main', {
      KeyConditionExpression: 'PK = :pk AND SK BETWEEN :from AND :to', ExpressionAttributeValues: { ':pk': K.L(id), ':from': `${K.PD_SK.tips}${from}`, ':to': `${K.PD_SK.tips}~` }, ConsistentRead: true,
    })).items.filter((t) => String(t['createdAt']) >= from).length;
    return { ptrs: items, tips };
  });
  const purchases = await getMany(store, 'main', per.flatMap((p) => p.ptrs).map((p) => ({ PK: String(p['purchasePK']), SK: 'P' })));
  const recent = purchases.filter((p) => String(p['createdAt']) >= from);
  const sums = new Map<string, number>();
  for (const p of recent) if (isSet(p['amountMicros']) && isSet(p['currency'])) bump(sums, String(p['currency']), Number(p['amountMicros']));
  return {
    activePurchases: purchases.filter((p) => p['status'] === 'active').length,
    purchases: recent.length,
    tips: per.reduce((n, p) => n + p.tips, 0),
    amounts: [...sums].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([currency, micros]) => ({ currency, micros })),
  };
});

// ---- foreign (still Postgres): lanes SC (social), ST (creators) ----
// The same SQL as admin/metrics.ts on the plain Postgres handle; the lane that moves replaces its line.

const social = (db: Db, days: string[]) => socialSection(pgOf(db), days);
const creators = (db: Db) => creatorsSection(pgOf(db));
