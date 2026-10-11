// A show's Studio numbers on DynamoDB: totals, trends, sparklines, episode table, subscribers, demographics, retention, money.
/**
 * M26 lane ST, ST-T05…ST-T08 (patterns ST-35…ST-38, ST-45, ST-46, ST-89, ST-114…ST-138, ST-145), data-model.md §7 and
 * "Lane ST changes". The same definitions as studio-numbers.ts (a play, a completion, a like, a save, a share).
 *
 * Sources: the show's facts (facts.ts — plays, likes, saves, heard ranges, shares: one partition), lane SC's comments and
 * clips (one Query per episode of the show, in parallel; one load per request), lane LB's show META (`subscriberCount`),
 * its subscription events `SE#<feedKey>`, its live subscribers (G2 `SHSUBS#`) and the heat curve; lane PD's `EARN#` items
 * and tips (G2 `SHTIPS#`); lane AC's listeners and push tokens.
 * - Trends and sparklines read the ROLLUPS: plays by the listener's own day (`activity.day`, never shifted), likes /
 *   saves / shares by UTC hour, summed into the viewer's days in code — any zone with a whole-hour offset gets exactly
 *   the SQL's answer (a half-hour zone such as Asia/Kolkata counts each hour in the day it starts in: a stated limit).
 *   Comments and subscribe events are counted from their own items (both carry their exact time).
 * - Retention, demographics and "also follow" are computed when asked (exact, as the SQL), not by a nightly job: a
 *   nightly copy would answer up to a day late (data-model.md "Lane ST changes" says why; the scale limit is stated).
 */
import { completionRate, isComplete, type Range } from '@socialmorning/social-core';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { heatCurve } from '../../../../heat/ddb.ts';
import { subscriptionItems } from '../../library/ddb/subscriptions.ts';
import { adminHiddenAmong } from '../../safety/ddb/moderation.ts';
import type { EpisodeStats, Metric, RecentComment, RecentEpisode, Totals } from '../studio-numbers.ts';
import { ALSO_FOLLOW_MIN } from '../studio-numbers.ts';
import { MIN_GROUP, type Bucket, type Demographics } from '../demographics.ts';
import { RETENTION_MAX_MINUTES } from '../retention.ts';
import { byMonth, type EarningKind, type EarningMonth, type EarningRow } from '../studio-earnings.ts';
import { provenOf } from './claims.ts';
import { showComments, visibleComment } from './comments.ts';
import { factsOf, rollups, type Facts } from './facts.ts';
import { byPublishedDesc, DAY_MS, getMany, listenersById, mapLimit, nowMs, partition, shared, showEpisodes, str, visible, type Db } from './common.ts';

// ---- days in a time zone ----

const fmt = new Map<string, Intl.DateTimeFormat>();
/** The calendar day (YYYY-MM-DD) of an instant in `tz`. */
export function localDay(ms: number, tz: string): string {
  let f = fmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); fmt.set(tz, f); }
  return f.format(new Date(ms));
}
const hourFmt = new Map<string, Intl.DateTimeFormat>();
export function localHour(ms: number, tz: string): number {
  let f = hourFmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }); hourFmt.set(tz, f); }
  return Number(f.format(new Date(ms))) % 24;
}
const addDays = (d: string, n: number): string => new Date(Date.parse(`${d}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** Exactly `days` dates ending today in `tz`. */
function dayList(now: number, days: number, tz: string): string[] {
  const end = localDay(now, tz);
  return Array.from({ length: days }, (_, i) => addDays(end, i - (days - 1)));
}

// ---- loads (one per request at a time) ----

const factsShared = (store: Store, feedUrl: string): Promise<Facts> => shared(`facts|${store.tables.main}|${feedUrl}`, () => factsOf(store, feedUrl));

function clipsShared(store: Store, feedUrl: string): Promise<Item[]> {
  return shared(`clips|${store.tables.main}|${feedUrl}`, async () => {
    const eps = await showEpisodes(store, feedUrl);
    return (await mapLimit(eps, 16, (e) => partition(store, 'main', K.EP(String(e['id'])), { prefix: 'CLIP#' }))).flat();
  });
}

const countBy = <T>(xs: readonly T[], key: (x: T) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};

// ---- completion, totals ----

export async function completion(store: Store, _db: Db, feedUrl: string): Promise<{ all: number | null; byEpisode: Map<string, number | null> }> {
  const [facts, eps] = await Promise.all([factsShared(store, feedUrl), showEpisodes(store, feedUrl)]);
  const duration = new Map(eps.map((e) => [String(e['id']), e['durationMs'] === undefined || e['durationMs'] === null ? null : Number(e['durationMs'])]));
  const heard = new Map(facts.ranges.map((r) => [`${String(r['listenerId'])}|${String(r['episodeId'])}`, r]));
  const pairs = new Set(facts.plays.filter((p) => duration.has(String(p['episodeId']))).map((p) => `${String(p['listenerId'])}|${String(p['episodeId'])}`));
  const per = new Map<string, (boolean | null)[]>();
  const all: (boolean | null)[] = [];
  for (const pair of pairs) {
    const episodeId = pair.split('|')[1]!;
    const r = heard.get(pair);
    const done = isComplete(r ? [(r['ranges'] as unknown as Range[]) ?? []] : [], duration.get(episodeId) ?? null, r?.['finished'] === true);
    all.push(done);
    per.set(episodeId, [...(per.get(episodeId) ?? []), done]);
  }
  return { all: completionRate(all), byEpisode: new Map([...per].map(([k, v]) => [k, completionRate(v)])) };
}

export async function totals(store: Store, db: Db, feedUrl: string): Promise<Totals> {
  const [facts, { comments }, clips, meta, comp] = await Promise.all([
    factsShared(store, feedUrl), showComments(store, feedUrl), clipsShared(store, feedUrl), get(store, 'main', K.show(feedUrl)), completion(store, db, feedUrl),
  ]);
  return {
    plays: facts.plays.length, completionRate: comp.all, subscribers: Number(meta?.['subscriberCount'] ?? 0), comments: comments.filter(visibleComment).length,
    likes: facts.likes.length, clips: clips.filter((c) => !c['deletedAt']).length, saves: facts.saves.length, shares: facts.shares.length,
  };
}

// ---- trends (rollups) ----

async function subEvents(store: Store, feedUrl: string, fromIso: string, toIso: string): Promise<Item[]> {
  return partition(store, 'events', `SE#${K.feedKey(feedUrl)}`, { from: fromIso, to: `${toIso}~` });
}

/** Exactly `days` points ending today (in `tz`), every missing day 0. */
export async function trend(store: Store, _db: Db, feedUrl: string, metric: Metric, days: number, tz: string): Promise<{ date: string; value: number }[]> {
  const now = nowMs(store);
  const dates = dayList(now, days, tz);
  const from = addDays(dates[0]!, -1);
  const to = addDays(dates[dates.length - 1]!, 1);
  const byDay = new Map<string, number>();
  const add = (d: string, n: number) => byDay.set(d, (byDay.get(d) ?? 0) + n);
  if (metric === 'plays') {
    for (const [d, n] of await rollups(store, feedUrl, 'plays', dates[0]!, dates[dates.length - 1]!)) add(d, n);
  } else if (metric === 'likes' || metric === 'saves' || metric === 'shares') {
    for (const [h, n] of await rollups(store, feedUrl, metric, `${from}T00`, `${to}T23`)) add(localDay(Date.parse(`${h}:00:00.000Z`), tz), n);
  } else if (metric === 'subs') {
    for (const e of await subEvents(store, feedUrl, `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`)) if (e['kind'] === 'sub') add(localDay(Date.parse(String(e['at'])), tz), 1);
  } else {
    for (const c of (await showComments(store, feedUrl)).comments) if (visibleComment(c)) add(localDay(Date.parse(String(c['createdAt'])), tz), 1);
  }
  return dates.map((date) => ({ date, value: byDay.get(date) ?? 0 }));
}

export async function yesterday(store: Store, db: Db, feedUrl: string, tz: string): Promise<{ plays: number; subs: number; comments: number; shares: number }> {
  const one = async (m: Metric) => (await trend(store, db, feedUrl, m, 2, tz))[0]?.value ?? 0;
  const [plays, subs, comments, shares] = await Promise.all([one('plays'), one('subs'), one('comments'), one('shares')]);
  return { plays, subs, comments, shares };
}

// ---- overview lists ----

export async function recentComments(store: Store, _db: Db, feedUrl: string, limit = 5): Promise<RecentComment[]> {
  const { comments, episodes } = await showComments(store, feedUrl);
  const rows = comments.filter((c) => visibleComment(c) && c['body'] !== null && c['body'] !== undefined)
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt']))).slice(0, limit);
  const people = await listenersById(store, rows.map((c) => str(c['authorId'])));
  return rows.map((c) => ({
    id: String(c['id']), episodeId: String(c['episodeId']), episodeTitle: String(episodes.get(String(c['episodeId']))?.['title'] ?? ''),
    author: str(people.get(String(c['authorId']))?.['displayName']), body: String(c['body']),
    offsetMs: c['offsetMs'] === undefined || c['offsetMs'] === null ? null : Number(c['offsetMs']), createdAt: new Date(String(c['createdAt'])).toISOString(),
  }));
}

export async function recentEpisodes(store: Store, _db: Db, feedUrl: string, limit = 5): Promise<RecentEpisode[]> {
  const [eps, facts, { comments }] = await Promise.all([showEpisodes(store, feedUrl), factsShared(store, feedUrl), showComments(store, feedUrl)]);
  const plays = countBy(facts.plays, (p) => String(p['episodeId']));
  const comm = countBy(comments.filter(visibleComment), (c) => String(c['episodeId']));
  return [...eps].sort(byPublishedDesc).slice(0, limit).map((e) => ({
    id: String(e['id']), title: String(e['title']), publishedAt: e['publishedAt'] ? new Date(String(e['publishedAt'])).toISOString() : null,
    plays: plays.get(String(e['id'])) ?? 0, comments: comm.get(String(e['id'])) ?? 0,
  }));
}

export async function claimedAt(store: Store, _db: Db, feedUrl: string): Promise<string | null> {
  const p = await provenOf(store, feedUrl);
  return p ? new Date(p.provenAt).toISOString() : null;
}

// ---- the episode table, its page, its CSV ----

export async function episodeStats(store: Store, db: Db, feedUrl: string): Promise<EpisodeStats[]> {
  const [eps, facts, { comments }, comp] = await Promise.all([showEpisodes(store, feedUrl), factsShared(store, feedUrl), showComments(store, feedUrl), completion(store, db, feedUrl)]);
  const plays = countBy(facts.plays, (p) => String(p['episodeId']));
  const comm = countBy(comments.filter(visibleComment), (c) => String(c['episodeId']));
  const shares = countBy(facts.shares.filter((s) => s['targetKind'] === 'episode'), (s) => String(s['targetId']));
  const saves = countBy(facts.saves, (s) => String(s['episodeId']));
  const likes = countBy(facts.likes, (l) => String(l['episodeId']));
  return eps.map((e) => {
    const id = String(e['id']);
    return {
      id, title: String(e['title']), publishedAt: e['publishedAt'] ? new Date(String(e['publishedAt'])).toISOString() : null,
      plays: plays.get(id) ?? 0, completionRate: comp.byEpisode.get(id) ?? null,
      comments: comm.get(id) ?? 0, shares: shares.get(id) ?? 0, saves: saves.get(id) ?? 0, likes: likes.get(id) ?? 0,
    };
  });
}

export async function episodeDetail(store: Store, db: Db, feedUrl: string, episodeId: string) {
  const stats = (await episodeStats(store, db, feedUrl)).find((e) => e.id === episodeId);
  if (!stats) return undefined;
  const [curve, { comments }, ep] = await Promise.all([heatCurve(store, episodeId), showComments(store, feedUrl), get(store, 'main', K.episode(episodeId))]);
  const perMinute = countBy(comments.filter((c) => c['episodeId'] === episodeId && c['offsetMs'] !== undefined && c['offsetMs'] !== null && visibleComment(c)), (c) => String(Math.floor(Number(c['offsetMs']) / 60_000)));
  const max = Math.max(0, ...curve);
  return {
    episode: { ...stats, durationMs: ep?.['durationMs'] === undefined || ep?.['durationMs'] === null ? null : Number(ep['durationMs']) },
    heat: curve.map((v) => (max === 0 ? 0 : v / max)),
    commentsByMinute: [...perMinute].map(([m, n]) => ({ minute: Number(m), count: n })).sort((a, b) => a.minute - b.minute),
  };
}

/** M10b: the claimant's view — distinct listeners, visible comments, episodes, the five busiest minutes. */
export async function showStats(store: Store, _db: Db, feedUrl: string): Promise<{ listeners: number; comments: number; episodes: number; topMoments: { episodeId: string; title: string; offsetMs: number; comments: number }[] }> {
  const [facts, { comments, episodes }] = await Promise.all([factsShared(store, feedUrl), showComments(store, feedUrl)]);
  const visibleOnes = comments.filter(visibleComment);
  const moments = countBy(visibleOnes.filter((c) => c['offsetMs'] !== undefined && c['offsetMs'] !== null), (c) => `${String(c['episodeId'])}|${Math.floor(Number(c['offsetMs']) / 60_000) * 60_000}`);
  const top = [...moments].map(([k, n]) => { const [episodeId, minute] = k.split('|') as [string, string]; return { episodeId, offsetMs: Number(minute), comments: n }; })
    .sort((a, b) => b.comments - a.comments || (a.episodeId < b.episodeId ? -1 : a.episodeId > b.episodeId ? 1 : 0)).slice(0, 5);
  return {
    listeners: new Set(facts.plays.map((p) => String(p['listenerId']))).size, comments: visibleOnes.length, episodes: episodes.size,
    topMoments: top.map((t) => ({ ...t, title: String(episodes.get(t.episodeId)?.['title'] ?? '') })),
  };
}

// ---- subscribers ----

/** The show's live subscribers with when they subscribed (lane LB's G2 `SHSUBS#<feedKey>`). */
async function liveSubscribers(store: Store, feedUrl: string): Promise<{ listenerId: string; createdAt: string }[]> {
  const { items } = await queryAll(store, 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHSUBS#${K.feedKey(feedUrl)}` } });
  return items.map((i) => { const sk = String(i['G2SK']); return { createdAt: sk.slice(0, 24), listenerId: sk.slice(25) }; });
}

/** "Listeners also follow": the other shows this show's live subscribers follow — hidden under 5 (G-L1). */
export async function alsoFollow(store: Store, _db: Db, feedUrl: string): Promise<{ hidden: 'too_few' } | { shows: { feedUrl: string; title: string | null; image: string | null; listeners: number }[] }> {
  if (Number((await get(store, 'main', K.show(feedUrl)))?.['subscriberCount'] ?? 0) < ALSO_FOLLOW_MIN) return { hidden: 'too_few' };
  const subs = await liveSubscribers(store, feedUrl);
  const others = await mapLimit(subs, 16, async (s) => (await subscriptionItems(store, s.listenerId)).filter((i) => !i['deletedAt'] && i['feedUrl'] !== feedUrl).map((i) => String(i['feedUrl'])));
  const counts = new Map<string, number>();
  for (const list of others) for (const u of new Set(list)) counts.set(u, (counts.get(u) ?? 0) + 1);
  const hidden = await adminHiddenAmong(store, [...counts.keys()]);
  const top = [...counts].filter(([u]) => !hidden.has(u)).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 5);
  const metas = new Map((await getMany(store, 'main', top.map(([u]) => K.show(u)))).map((m) => [String(m['feedUrl']), m]));
  return { shows: top.map(([u, n]) => ({ feedUrl: u, title: str(metas.get(u)?.['newestTitle']), image: str(metas.get(u)?.['newestImage']), listeners: n })) };
}

/** When subscribe/unsubscribe events began (migration 008 on the old database); MIG copies it to `CFG#studio-history-since`. */
export const HISTORY_SINCE_DEFAULT = '2026-09-29';

export async function subscriberStats(store: Store, _db: Db, feedUrl: string, days: number, tz: string) {
  const now = nowMs(store);
  const dates = dayList(now, days, tz);
  const [meta, events, facts, subs, tokens, since] = await Promise.all([
    get(store, 'main', K.show(feedUrl)),
    subEvents(store, feedUrl, `${addDays(dates[0]!, -1)}T00:00:00.000Z`, `${addDays(dates[dates.length - 1]!, 1)}T23:59:59.999Z`),
    factsShared(store, feedUrl),
    liveSubscribers(store, feedUrl),
    queryAll(store, 'main', { IndexName: K.INDEX.G4, KeyConditionExpression: 'G4PK = :q', ExpressionAttributeValues: { ':q': 'Q#pushtok' } }),
    get(store, 'main', K.config('studio-history-since')),
  ]);
  const sub = new Map<string, number>(); const unsub = new Map<string, number>();
  for (const e of events) {
    const d = localDay(Date.parse(String(e['at'])), tz);
    const m = e['kind'] === 'sub' ? sub : unsub;
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const p of facts.plays) { const h = localHour(Date.parse(String(p['at'])), tz); byHour[h] = (byHour[h] ?? 0) + 1; }
  // The newest token's platform per listener (the old correlated `ORDER BY created_at DESC LIMIT 1`).
  const newest = new Map<string, { at: string; platform: string }>();
  for (const t of tokens.items) {
    const id = String(t['listenerId']); const at = String(t['createdAt']);
    if (!newest.has(id) || newest.get(id)!.at < at) newest.set(id, { at, platform: String(t['platform']) });
  }
  const plat = { ios: 0, android: 0, unknown: 0 };
  for (const s of subs) { const p = newest.get(s.listenerId)?.platform; plat[p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'unknown'] += 1; }
  return {
    total: Number(meta?.['subscriberCount'] ?? 0),
    trend: dates.map((date) => ({ date, sub: sub.get(date) ?? 0, unsub: unsub.get(date) ?? 0 })),
    hours: byHour,
    platforms: plat,
    historySince: str(since?.['since']) ?? HISTORY_SINCE_DEFAULT,
  };
}

/** Current subscribers, newest first, 50 a page (an integer page over the walk of the show's G2 list); suspended accounts left out. */
export async function subscriberList(store: Store, _db: Db, feedUrl: string, page: number, q = '') {
  const needle = q.trim().slice(0, 100).toLowerCase();
  const subs = await liveSubscribers(store, feedUrl);
  const people = await listenersById(store, subs.map((s) => s.listenerId));
  const rows = subs.filter((s) => visible(people.get(s.listenerId)) && (!needle || String(people.get(s.listenerId)!['displayName']).toLowerCase().includes(needle)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.listenerId < b.listenerId ? -1 : 1));
  const slice = rows.slice((page - 1) * 50, page * 50);
  const muted = new Set((await getMany(store, 'main', slice.map((s) => K.showMute(feedUrl, s.listenerId)))).map((m) => String(m['listenerId'])));
  return {
    total: rows.length, page, pageSize: 50,
    items: slice.map((s) => ({ id: s.listenerId, displayName: String(people.get(s.listenerId)!['displayName']), subscribedAt: new Date(s.createdAt).toISOString(), muted: muted.has(s.listenerId) })),
  };
}

export async function demographics(store: Store, _db: Db, feedUrl: string): Promise<Demographics> {
  const subs = await liveSubscribers(store, feedUrl);
  const people = [...(await listenersById(store, subs.map((s) => s.listenerId))).values()].filter((l) => visible(l));
  const ids = new Set(subs.map((s) => s.listenerId));
  const counted = people.filter((l) => ids.has(String(l['id'])));
  const group = (attr: string): Bucket[] => [...countBy(counted.filter((l) => str(l[attr]) !== null && String(l[attr]) !== ''), (l) => String(l[attr]))]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([k, n]) => ({ key: k.trim(), count: n >= MIN_GROUP ? n : ('<10' as const) }));
  return { total: counted.length, age: group('ageRange'), gender: group('gender'), countries: group('country') };
}

/** The share of an episode's listeners still listening at each minute — from the heard ranges kept per listener (facts.ts). */
export async function retention(store: Store, _db: Db, episodeId: string, durationMs: number | null): Promise<number[]> {
  const ep = await get(store, 'main', K.episode(episodeId));
  if (!ep) return [];
  const rows = await partition(store, 'events', `SX#${K.feedKey(String(ep['feedUrl']))}`, { prefix: `R#${episodeId}#` });
  const starters = rows.map((r) => ((r['ranges'] as unknown as [number, number][] | undefined) ?? []).filter((x) => Array.isArray(x) && x[1] > x[0])).filter((rs) => rs.length > 0);
  if (starters.length === 0) return [];
  const furthest = Math.max(...starters.flatMap((rs) => rs.map((r) => r[1])));
  const minutes = Math.min(RETENTION_MAX_MINUTES, Math.max(1, Math.ceil((durationMs ?? furthest) / 60_000)));
  const out: number[] = [];
  for (let m = 0; m < minutes; m++) {
    const at = m * 60_000 + 30_000;
    const still = starters.filter((rs) => rs.some(([a, b]) => a <= at && at < b)).length;
    out.push(Math.round((still / starters.length) * 1000) / 1000);
  }
  return out;
}

// ---- money (lane PD's items) ----

/** Every money row for the show, newest first: lane PD's `SH#<feedKey>/EARN#…` items (never written for a test purchase). */
export async function earningRows(store: Store, _db: Db, feedUrl: string, limit = 5000): Promise<EarningRow[]> {
  const items = await partition(store, 'main', K.SH(feedUrl), { prefix: 'EARN#', newestFirst: true, max: limit });
  return items.map((i) => ({
    at: new Date(String(i['createdAt'])).toISOString(), kind: String(i['kind']) as EarningKind,
    amountMicros: i['amountMicros'] === null || i['amountMicros'] === undefined ? null : Number(i['amountMicros']),
    currency: str(i['currency'])?.trim() || null, refunded: i['refunded'] === true,
  }));
}

export async function earnings(store: Store, db: Db, feedUrl: string): Promise<{ months: EarningMonth[]; items: EarningRow[] }> {
  const rows = await earningRows(store, db, feedUrl);
  return { months: byMonth(rows), items: rows.slice(0, 200) };
}

/** Tips the show received, newest first, refunded purchases left out (G-T1) — lane PD's tip items through G2 `SHTIPS#`. */
export async function tipsFor(store: Store, _db: Db, feedUrl: string) {
  const { items: refs } = await queryAll(store, 'main', { IndexName: K.INDEX.G2, KeyConditionExpression: 'G2PK = :p', ExpressionAttributeValues: { ':p': `SHTIPS#${K.feedKey(feedUrl)}` }, ScanIndexForward: false });
  const tips = await getMany(store, 'main', refs.map((r) => ({ PK: String(r['PK']), SK: String(r['SK']) })));
  const purchases = new Map((await getMany(store, 'main', tips.map((t) => ({ PK: String(t['purchasePK']), SK: 'P' })))).map((p) => [String(p['PK']), p]));
  const live = tips.filter((t) => purchases.get(String(t['purchasePK']))?.['status'] !== 'refunded')
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt']))).slice(0, 200);
  const people = await listenersById(store, live.map((t) => str(t['fromListener'])));
  const totals: Record<string, number> = {};
  const items = live.map((t) => {
    const p = purchases.get(String(t['purchasePK']));
    const amount = p?.['amountMicros'] ?? t['amountMicros'];
    const currency = str(p?.['currency'] ?? t['currency']);
    const micros = amount === null || amount === undefined ? null : Number(amount);
    if (currency && micros !== null) totals[currency] = (totals[currency] ?? 0) + micros;
    const name = str(people.get(String(t['fromListener']))?.['displayName']);
    return { at: new Date(String(t['createdAt'])).toISOString(), amountMicros: micros, currency, from: name ? { displayName: name } : null };
  });
  return { totalMicrosByCurrency: totals, items };
}

/** Lane SF's dashboard: shares per UTC+8 day (the share facts' E1 day index is UTC — counted from each show's facts instead). */
export async function sharesOnDays(store: Store, days: readonly string[]): Promise<number[]> {
  const counts = new Map<string, number>();
  const from = days[0]; const to = days[days.length - 1];
  if (!from || !to) return [];
  for (const d of [addDays(from, -1), ...days, addDays(to, 1)]) {
    const { items } = await queryAll(store, 'events', { IndexName: K.INDEX.E1, KeyConditionExpression: 'E1PK = :d AND begins_with(E1SK, :p)', ExpressionAttributeValues: { ':d': `DAY#${d}`, ':p': 'st#' } });
    for (const i of items) {
      if (!String(i['SK']).startsWith('S#')) continue;
      const kl = new Date(Date.parse(String(i['SK']).slice(2, 26)) + 8 * 3_600_000).toISOString().slice(0, 10);
      counts.set(kl, (counts.get(kl) ?? 0) + 1);
    }
  }
  return days.map((d) => counts.get(d) ?? 0);
}

export type { Item };
