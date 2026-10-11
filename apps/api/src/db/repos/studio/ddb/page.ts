// The show page's server parts on DynamoDB: overrides, hosts with faces, host picks, show info, hidden episodes, feed sync, shares.
/**
 * M26 lane ST, ST-T03 (patterns ST-47…ST-56, ST-97…ST-104, ST-153, ST-155…ST-158), data-model.md "Lane ST changes".
 *
 * - Overrides: `SH#<feedKey>/OVERRIDE` (one item, replaced whole); while it has a milestone message it carries G4
 *   `Q#milestone-msgs` (the sweep's list, milestones in announce.ts).
 * - Hidden episodes: by (feed, guid) — `SH#<feedKey>/HIDDENEP#<sha(guid)>` (the show's list, the phone's guids) and a
 *   copy in ONE partition `CFG#hidden-eps` that every listener list reads (`hiddenEpisodeIds`: one Query, then the
 *   episode ids from lane LB's `U#GUID` items — the old JOIN on (feed_url, guid)). The episode's META also gets
 *   `hidden: true` (projected on G2) while it is hidden — a hint for readers of one episode; the set is the truth (a
 *   hide also covers an episode registered later). The Postgres row is bridged: lane DV's SQL still filters with it.
 * - Host picks: one item `SH#<feedKey>/PICKS` (the old delete-all + insert-n, ≤ 20, is one Put).
 * - Feed sync: `SH#<feedKey>/FEEDSYNC`; "Sync now" claims its 10-minute slot with one conditional update.
 * - Shares: facts.ts (`recordShare`), with the per-listener burst marker.
 */
import { HOST_PICKS_MAX } from '@socialmorning/social-core';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { deleteCacheKey } from '../../library/ddb/cache.ts';
import { adminHiddenAmong } from '../../safety/ddb/moderation.ts';
import type { Overrides, OverridesIn, Contact } from '../show-overrides.ts';
import type { ShowHost, ShowInfo, ShowPageAnnouncementRow } from '../show-page.ts';
import type { HiddenEpisode } from '../hidden-episodes.ts';
import { MANUAL_EVERY_MS, type SyncStatus } from '../feed-sync.ts';
import { provenOf } from './claims.ts';
import { hostedByFeed } from './hosted.ts';
import { recentShares, recordShare } from './facts.ts';
import { bridgeOf, episodesById, getMany, keyOf, listenersById, nowIso, nowMs, partition, str, visible, type Db } from './common.ts';

// ---- overrides ----

const list = <T>(v: unknown): T[] | null => (v === null || v === undefined ? null : typeof v === 'string' ? (JSON.parse(v) as T[]) : (v as T[]));

function toOverrides(i: Item): Overrides {
  return {
    title: str(i['title']), description: str(i['description']), coverUrl: str(i['coverUrl']), themeColour: str(i['themeColour']), milestoneMessage: str(i['milestoneMessage']),
    hosts: list<string>(i['hosts']), links: list<{ label: string; url: string }>(i['links']), updatedAt: new Date(String(i['updatedAt'])).toISOString(),
    contacts: list<Contact>(i['contacts']), tipsEnabled: i['tipsEnabled'] === true,
  };
}

export async function getOverrides(store: Store, _db: Db, feedUrl: string): Promise<Overrides | null> {
  const i = await get(store, 'main', K.showSingleton(feedUrl, 'OVERRIDE'));
  return i ? toOverrides(i) : null;
}

/** Overrides of many shows (BatchGet), by feed URL — the lists that show an override's title and cover. */
export async function overridesOf(store: Store, feedUrls: readonly string[]): Promise<Map<string, Overrides>> {
  const items = await getMany(store, 'main', [...new Set(feedUrls)].map((u) => K.showSingleton(u, 'OVERRIDE')));
  return new Map(items.map((i) => [String(i['feedUrl']), toOverrides(i)]));
}

/** Upsert the given fields; a field left out keeps its value, `null` clears it back to the feed's. */
export async function putOverrides(store: Store, db: Db, feedUrl: string, by: string, o: OverridesIn): Promise<Overrides> {
  const cur = await getOverrides(store, db, feedUrl);
  const pick = <Key extends keyof OverridesIn>(k: Key, curV: unknown) => (k in o ? (o[k] ?? null) : curV ?? null);
  const next = {
    feedUrl, title: pick('title', cur?.title), description: pick('description', cur?.description), coverUrl: pick('coverUrl', cur?.coverUrl),
    themeColour: pick('themeColour', cur?.themeColour), milestoneMessage: pick('milestoneMessage', cur?.milestoneMessage),
    hosts: pick('hosts', cur?.hosts), links: pick('links', cur?.links), contacts: pick('contacts', cur?.contacts),
    tipsEnabled: 'tipsEnabled' in o ? o.tipsEnabled === true : cur?.tipsEnabled ?? false,
    updatedAt: nowIso(store), updatedBy: by,
  };
  const msg = typeof next.milestoneMessage === 'string' && next.milestoneMessage.trim() !== '';
  await tx(store).put('main', encode('showOverride', K.showSingleton(feedUrl, 'OVERRIDE'), next, msg ? { gsi: K.G4('milestone-msgs', next.updatedAt, K.feedKey(feedUrl)) } : {})).commit();
  return (await getOverrides(store, db, feedUrl))!;
}

/** Lane SG's profile "hosts": the shows a listener owns (proven claims) then co-hosts (`HOSTOF#`), in the SQL's order. */
export async function showsHostedBy(store: Store, listenerId: string): Promise<{ feedUrl: string; rank: number; since: string }[]> {
  const [{ provenClaimsOf }, ptrs] = await Promise.all([import('./claims.ts'), partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.hostOf })]);
  const owned = (await provenClaimsOf(store, listenerId)).map((c) => ({ feedUrl: c.feedUrl, rank: 0, since: c.provenAt }));
  const hosted = ptrs.map((p) => ({ feedUrl: String(p['feedUrl']), rank: 1, since: String(p['addedAt']) }));
  return [...owned, ...hosted].sort((a, b) => a.rank - b.rank || a.since.localeCompare(b.since));
}

/** A show's own title as lane ST knows it: the override's, else the live Studio-made show's (null: the feed's own). */
export async function stTitles(store: Store, db: Db, feedUrls: readonly string[]): Promise<Map<string, string>> {
  const over = await overridesOf(store, feedUrls);
  const out = new Map<string, string>();
  for (const u of new Set(feedUrls)) {
    const t = over.get(u)?.title ?? (await hostedByFeed(store, db, u))?.title ?? null;
    if (t) out.set(u, t);
  }
  return out;
}

/** The public show card: every feed with a proven claim (G4 `Q#proven`). */
export async function provenFeedRows(store: Store, _db: Db): Promise<{ feed_url: string }[]> {
  const { allProven } = await import('./claims.ts');
  return [...new Set((await allProven(store)).map((p) => p.feedUrl))].map((feed_url) => ({ feed_url }));
}

/** The public show card's title, description and cover: the override, the live Studio-made show, then the newest episode (LB's show META). */
export async function showCardInfoRows(store: Store, db: Db, feedUrl: string): Promise<{ title: string | null; description: string | null; cover: string | null }[]> {
  const [o, h, meta] = await Promise.all([getOverrides(store, db, feedUrl), hostedByFeed(store, db, feedUrl), get(store, 'main', K.show(feedUrl))]);
  let title = o?.title ?? h?.title ?? str(meta?.['newestTitle']);
  if (title === null && meta?.['latestEpisodeId']) {
    const e = await get(store, 'main', K.episode(String(meta['latestEpisodeId'])));
    title = str(e?.['showTitle']) ?? str(e?.['title']);
  }
  return [{ title, description: o?.description ?? h?.description ?? null, cover: o?.coverUrl ?? h?.coverUrl ?? str(meta?.['newestImage']) }];
}

// ---- the show page ----

export async function subscriberCount(store: Store, _db: Db, feedUrl: string): Promise<number> {
  if ((await adminHiddenAmong(store, [feedUrl])).has(feedUrl)) return 0;
  return Number((await get(store, 'main', K.show(feedUrl)))?.['subscriberCount'] ?? 0);
}

export async function showHosts(store: Store, _db: Db, feedUrl: string): Promise<ShowHost[]> {
  const [proven, hosts] = await Promise.all([provenOf(store, feedUrl), partition(store, 'main', K.SH(feedUrl), { prefix: 'HOST#' })]);
  const order = [
    ...(proven ? [{ id: proven.listenerId, rank: 0, since: proven.provenAt }] : []),
    ...hosts.map((h) => ({ id: String(h['listenerId']), rank: 1, since: String(h['addedAt']) })),
  ].sort((a, b) => a.rank - b.rank || a.since.localeCompare(b.since));
  const people = await listenersById(store, order.map((o) => o.id));
  const seen = new Set<string>();
  return order.flatMap((o) => {
    const l = people.get(o.id);
    if (!visible(l) || seen.has(o.id)) return [];
    seen.add(o.id);
    return [{ id: o.id, name: String(l['displayName']), avatarUrl: str(l['avatarUrl']) }];
  });
}

async function picksOf(store: Store, feedUrl: string): Promise<string[]> {
  return ((await get(store, 'main', K.hostPicks(feedUrl)))?.['episodeIds'] as string[] | undefined)?.map(String) ?? [];
}

/** (feed, guid) of each episode → hidden by its host? (the copies in `CFG#hidden-eps`, BatchGet). */
async function hiddenAmong(store: Store, eps: readonly Item[]): Promise<Set<string>> {
  const items = await getMany(store, 'main', eps.map((e) => K.hiddenEpAll(String(e['feedUrl']), String(e['guid']))));
  const hidden = new Set(items.map((i) => `${String(i['feedUrl'])}\u0001${String(i['guid'])}`));
  return new Set(eps.filter((e) => hidden.has(`${String(e['feedUrl'])}\u0001${String(e['guid'])}`)).map((e) => String(e['id'])));
}

export async function hostPicks(store: Store, _db: Db, feedUrl: string): Promise<string[]> {
  const ids = await picksOf(store, feedUrl);
  if (ids.length === 0) return [];
  const eps = await episodesById(store, ids);
  const hidden = await hiddenAmong(store, [...eps.values()]);
  return ids.filter((id) => !hidden.has(id));
}

export async function setHostPicks(store: Store, _db: Db, feedUrl: string, episodeIds: readonly string[], by: string): Promise<string[]> {
  const ids = [...new Set(episodeIds)];
  if (ids.length > HOST_PICKS_MAX) throw new ApiError('validation', `At most ${HOST_PICKS_MAX} host picks.`, { fields: ['episodeIds'] });
  if (ids.length > 0) {
    const eps = await episodesById(store, ids);
    if (ids.some((id) => eps.get(id)?.['feedUrl'] !== feedUrl)) throw new ApiError('validation', 'Pick episodes of this show only.', { fields: ['episodeIds'] });
  }
  await tx(store).put('main', encode('hostPicks', K.hostPicks(feedUrl), { feedUrl, episodeIds: ids, pickedBy: by, updatedAt: nowIso(store) })).commit();
  return ids;
}

export async function hostPickItems(store: Store, _db: Db, feedUrl: string): Promise<{ id: string; title: string }[]> {
  const ids = await picksOf(store, feedUrl);
  const eps = await episodesById(store, ids);
  return ids.flatMap((id) => { const e = eps.get(id); return e ? [{ id, title: String(e['title']) }] : []; });
}

export async function showInfo(store: Store, db: Db, feedUrl: string): Promise<ShowInfo> {
  const p = await provenOf(store, feedUrl);
  if (!p) return { ownerType: 'feed', ownerCountry: null, feedUrl, claimedAt: null };
  const [owner, hosted] = await Promise.all([get(store, 'main', K.listener(p.listenerId)), hostedByFeed(store, db, feedUrl)]);
  if (!owner) return { ownerType: 'feed', ownerCountry: null, feedUrl, claimedAt: null }; // the SQL's JOIN on listeners
  const c = str(owner['country']);
  return {
    ownerType: hosted ? 'studio' : 'claimed',
    ownerCountry: c && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : null,
    feedUrl, claimedAt: new Date(p.provenAt).toISOString(),
  };
}

/** The show page's three newest released announcements. */
export async function latestAnnouncementRows(store: Store, _db: Db, feedUrl: string): Promise<ShowPageAnnouncementRow[]> {
  const now = nowMs(store);
  const anns = await partition(store, 'main', K.SH(feedUrl), { prefix: 'ANN#', newestFirst: true });
  return anns.filter((a) => !a['deletedAt'] && Date.parse(String(a['releaseAt'])) <= now).slice(0, 3)
    .map((a) => ({ id: String(a['id']), body: String(a['body']), created_at: String(a['createdAt']), edited_at: str(a['editedAt']), images: a['images'] ?? [] }));
}

/** The newest episode image of a feed (lane LB's show META), for the show page's last-resort cover. */
export async function newestEpisodeImageRows(store: Store, _db: Db, feedUrl: string): Promise<{ image_url: string }[]> {
  const img = str((await get(store, 'main', K.show(feedUrl)))?.['newestImage']);
  return img ? [{ image_url: img }] : [];
}

// ---- hidden episodes ----

/** The app ids of every hidden episode: one Query of the hidden set, then lane LB's `U#GUID` items. */
export async function hiddenEpisodeIds(store: Store, _db: Db): Promise<Set<string>> {
  const all = await partition(store, 'main', 'CFG#hidden-eps');
  const owners = await getMany(store, 'main', all.map((h) => K.U.guid(String(h['feedUrl']), String(h['guid']))));
  return new Set(owners.map((o) => String(o['owner'])));
}

/** Lane LB's daily pick: one row when the episode is hidden by its show. */
export async function episodeHiddenRows(store: Store, _db: Db, episodeId: string): Promise<Record<string, unknown>[]> {
  const e = await get(store, 'main', K.episode(episodeId));
  if (!e) return [];
  return (await get(store, 'main', K.hiddenEpAll(String(e['feedUrl']), String(e['guid'])))) ? [{ '?column?': 1 }] : [];
}

export async function hiddenGuids(store: Store, _db: Db, feedUrl: string): Promise<string[]> {
  return (await partition(store, 'main', K.SH(feedUrl), { prefix: 'HIDDENEP#' })).map((h) => String(h['guid'])).sort();
}

export async function listHidden(store: Store, _db: Db, feedUrl: string): Promise<HiddenEpisode[]> {
  const rows = await partition(store, 'main', K.SH(feedUrl), { prefix: 'HIDDENEP#' });
  const owners = await getMany(store, 'main', rows.map((h) => K.U.guid(feedUrl, String(h['guid']))));
  const idOf = new Map(owners.map((o) => [String(o['PK']), String(o['owner'])]));
  const eps = await episodesById(store, [...idOf.values()]);
  return rows.map((h) => {
    const id = idOf.get(K.U.guid(feedUrl, String(h['guid'])).PK);
    const e = id ? eps.get(id) : undefined;
    return { episodeId: e ? String(e['id']) : '', guid: String(h['guid']), title: e ? String(e['title']) : String(h['guid']), hiddenAt: new Date(String(h['hiddenAt'])).toISOString() };
  }).sort((a, b) => b.hiddenAt.localeCompare(a.hiddenAt));
}

/** Hides (or shows again) one (feed, guid) — the item, its copy in the set, the META hint, and the Postgres row (lane DV reads it). */
export async function hideByGuid(store: Store, db: Db, feedUrl: string, guid: string, hidden: boolean, by: string | null, reason: string | null = null): Promise<void> {
  const owner = await get(store, 'main', K.U.guid(feedUrl, guid));
  const episodeId = str(owner?.['owner']);
  const meta = episodeId ? await get(store, 'main', K.episode(episodeId)) : undefined;
  const t = tx(store);
  const at = nowIso(store);
  if (hidden) {
    t.put('main', encode('hiddenEpisode', K.hiddenEp(feedUrl, guid), { feedUrl, guid, hiddenBy: by, reason, hiddenAt: at }), { condition: 'attribute_not_exists(PK)', label: 'hide' });
    t.put('main', encode('hiddenEpCopy', K.hiddenEpAll(feedUrl, guid), { feedUrl, guid, hiddenAt: at }));
    if (meta) t.update('main', keyOf(meta), { update: 'SET #h = :y', names: { '#h': 'hidden' }, values: { ':y': true } });
  } else {
    t.delete('main', K.hiddenEp(feedUrl, guid)).delete('main', K.hiddenEpAll(feedUrl, guid));
    if (meta) t.update('main', keyOf(meta), { update: 'REMOVE #h', names: { '#h': 'hidden' } });
  }
  try {
    await t.commit();
  } catch (e) {
    if (!(e instanceof TxCancelled && e.failed('hide'))) throw e; // already hidden: ON CONFLICT DO NOTHING
  }
  const raw = bridgeOf(db);
  if (raw) {
    if (hidden) await raw.query('INSERT INTO hidden_episodes (feed_url, guid, hidden_by, reason) VALUES ($1, $2, $3, $4) ON CONFLICT (feed_url, guid) DO NOTHING', [feedUrl, guid, by, reason]);
    else await raw.query('DELETE FROM hidden_episodes WHERE feed_url = $1 AND guid = $2', [feedUrl, guid]);
  }
}

export async function setHidden(store: Store, db: Db, feedUrl: string, episodeId: string, hidden: boolean, by: string): Promise<void> {
  const e = await get(store, 'main', K.episode(episodeId));
  if (!e || e['feedUrl'] !== feedUrl) throw new ApiError('not_found', 'That episode is not on this show.');
  await hideByGuid(store, db, feedUrl, String(e['guid']), hidden, by);
}

/** Admin › Lists › hidden episodes: every hidden (feed, guid) with its episode's title, newest first (admin-lists.ts). */
export async function hiddenEpisodeRows(store: Store, _db: Db): Promise<{ feed_url: string; guid: string; reason: string | null; hidden_at: string; title: string | null; show_title: string | null; hidden_by: string | null }[]> {
  const all = await partition(store, 'main', 'CFG#hidden-eps');
  const items = await getMany(store, 'main', all.map((h) => K.hiddenEp(String(h['feedUrl']), String(h['guid']))));
  const owners = await getMany(store, 'main', items.map((h) => K.U.guid(String(h['feedUrl']), String(h['guid']))));
  const idOf = new Map(owners.map((o) => [String(o['PK']), String(o['owner'])]));
  const eps = await episodesById(store, [...idOf.values()]);
  return items.map((h) => {
    const id = idOf.get(K.U.guid(String(h['feedUrl']), String(h['guid'])).PK);
    const e = id ? eps.get(id) : undefined;
    return { feed_url: String(h['feedUrl']), guid: String(h['guid']), reason: str(h['reason']), hidden_at: String(h['hiddenAt']), title: str(e?.['title']), show_title: str(e?.['showTitle']), hidden_by: str(h['hiddenBy']) };
  }).sort((a, b) => b.hidden_at.localeCompare(a.hidden_at)).slice(0, 500);
}

export async function hiddenEpisodeReason(store: Store, _db: Db, feedUrl: string, guid: string): Promise<{ reason: string | null }[]> {
  const h = await get(store, 'main', K.hiddenEp(feedUrl, guid));
  return h ? [{ reason: str(h['reason']) }] : [];
}

/** Admin: hides one episode everywhere with a reason; hiding it again updates the reason. */
export async function hideEpisodeWithReason(store: Store, db: Db, feedUrl: string, guid: string, by: string, reason: string): Promise<Record<string, unknown>[]> {
  if (await get(store, 'main', K.hiddenEp(feedUrl, guid))) {
    await tx(store).update('main', K.hiddenEp(feedUrl, guid), { update: 'SET #r = :r', condition: 'attribute_exists(PK)', names: { '#r': 'reason' }, values: { ':r': reason } }).commit();
    const raw = bridgeOf(db);
    if (raw) await raw.query('UPDATE hidden_episodes SET reason = $3 WHERE feed_url = $1 AND guid = $2', [feedUrl, guid, reason]);
  } else {
    await hideByGuid(store, db, feedUrl, guid, true, by, reason);
  }
  return [];
}

export async function unhideEpisode(store: Store, db: Db, feedUrl: string, guid: string): Promise<Record<string, unknown>[]> {
  await hideByGuid(store, db, feedUrl, guid, false, null);
  return [];
}

// ---- feed sync ----

export async function recordSync(store: Store, _db: Db, feedUrl: string, ok: boolean, error: string | null, manual = false): Promise<void> {
  const at = nowIso(store);
  await tx(store).update('main', K.feedSync(feedUrl), {
    update: `SET #t = :t, #f = :f, #fa = :at, #ok = :ok, #e = :e${manual ? ', #m = :at' : ''}`,
    names: { '#t': 't', '#f': 'feedUrl', '#fa': 'fetchedAt', '#ok': 'ok', '#e': 'error', ...(manual ? { '#m': 'manualAt' } : {}) },
    values: { ':t': 'feedSync', ':f': feedUrl, ':at': at, ':ok': ok, ':e': error === null ? null : error.slice(0, 500) },
  }).commit();
}

export async function syncStatus(store: Store, _db: Db, feedUrl: string): Promise<SyncStatus> {
  const r = await get(store, 'main', K.feedSync(feedUrl));
  if (!r) return { fetchedAt: null, ok: null, error: null, nextManualAt: null };
  const next = r['manualAt'] ? Date.parse(String(r['manualAt'])) + MANUAL_EVERY_MS : 0;
  return { fetchedAt: new Date(String(r['fetchedAt'])).toISOString(), ok: r['ok'] === true, error: str(r['error']), nextManualAt: next > nowMs(store) ? new Date(next).toISOString() : null };
}

/** Claims the manual slot: true when no Sync now ran in the last 10 minutes (one conditional update). */
export async function claimManual(store: Store, _db: Db, feedUrl: string): Promise<boolean> {
  const now = nowMs(store);
  try {
    await tx(store).update('main', K.feedSync(feedUrl), {
      update: 'SET #t = :t, #f = :f, #m = :now, #fa = if_not_exists(#fa, :now), #ok = if_not_exists(#ok, :no), #e = if_not_exists(#e, :started)',
      condition: 'attribute_not_exists(#m) OR #m <= :cut',
      names: { '#t': 't', '#f': 'feedUrl', '#m': 'manualAt', '#fa': 'fetchedAt', '#ok': 'ok', '#e': 'error' },
      values: { ':t': 'feedSync', ':f': feedUrl, ':now': new Date(now).toISOString(), ':no': false, ':started': 'Sync started', ':cut': new Date(now - MANUAL_EVERY_MS).toISOString() },
    }).commit();
    return true;
  } catch (e) {
    if (isConditionFailed(e)) return false;
    throw e;
  }
}

/** Drop the cached copy of a feed so the next fetch is a real one (lane LB's cache). */
export async function dropFeedCache(store: Store, db: Db, feedUrl: string): Promise<void> {
  await deleteCacheKey(store, db, `feed:${feedUrl}`);
}

// ---- shares ----

export async function recentShareCountRows(store: Store, _db: Db, listenerId: string): Promise<{ n: number }[]> {
  return [{ n: await recentShares(store, listenerId) }];
}

export async function insertShareEvent(store: Store, _db: Db, listenerId: string | null, targetKind: string, targetId: string, feedUrl: string): Promise<void> {
  await recordShare(store, { listenerId, targetKind, targetId, feedUrl });
}

export { keyOf };
