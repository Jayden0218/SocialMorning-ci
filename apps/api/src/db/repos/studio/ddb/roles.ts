// The Studio role wall on DynamoDB: one role copy per (listener, show), checked against the feed's proven claim.
/**
 * M26 lane ST, ST-T01 (pattern ST-132, hard case 6), data-model.md §3 `ROLES#` and "Lane ST changes".
 *
 * Every Studio request runs `roleFor` (guard G-A1). The SQL was a CTE over claims and members with five correlated
 * subselects; here the listener's copy `L#<id>/ROLES#<showKey>` (written when a claim is proven or a helper added,
 * deleted when they go) answers who, and ONE BatchGet confirms it against the truth: `U#PROVEN#<feedKey>` (an owner
 * copy counts only while its listener holds the proven claim; a helper's only while the show still has one, and only
 * while its `TEAM#` item exists) and reads the title parts (a live Studio-made show's own title and cover, else the
 * show's newest episode — lane LB's show META). A stale copy can never grant a role.
 */
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { showKey, type StudioShow } from '../studio-roles.ts';
import { getMany, partition, str, type Db } from './common.ts';

type Copy = { feedUrl: string; role: 'owner' | 'operator'; since: string };

/** The copies that are still true, with their shows' titles, in the SQL's order (owner first, then by since). */
async function resolve(store: Store, listenerId: string, copies: Copy[]): Promise<StudioShow[]> {
  if (copies.length === 0) return [];
  const feeds = [...new Set(copies.map((c) => c.feedUrl))];
  const items = await getMany(store, 'main', [
    ...feeds.map((u) => K.U.proven(u)),
    ...copies.filter((c) => c.role === 'operator').map((c) => K.teamMember(c.feedUrl, listenerId)),
    ...feeds.map((u) => K.hostedFeed(u)),
    ...feeds.map((u) => K.show(u)),
  ]);
  const by = new Map(items.map((i) => [`${String(i['PK'])}|${String(i['SK'])}`, i]));
  const at = (k: { PK: string; SK: string }) => by.get(`${k.PK}|${k.SK}`);
  const live = copies.filter((c) => {
    const proven = at(K.U.proven(c.feedUrl));
    if (!proven) return false;
    return c.role === 'owner' ? proven['listenerId'] === listenerId : Boolean(at(K.teamMember(c.feedUrl, listenerId)));
  });
  const hostedIds = [...new Set(live.map((c) => str(at(K.hostedFeed(c.feedUrl))?.['showId'])).filter((x): x is string => x !== null))];
  const hosted = new Map((await getMany(store, 'main', hostedIds.map((id) => K.hostedShow(id)))).filter((h) => !h['deletedAt']).map((h) => [String(h['feedUrl']), h]));
  const latestIds = live.flatMap((c) => {
    const meta = at(K.show(c.feedUrl));
    return !hosted.has(c.feedUrl) && meta && !meta['newestTitle'] && meta['latestEpisodeId'] ? [String(meta['latestEpisodeId'])] : [];
  });
  const latest = new Map((await getMany(store, 'main', latestIds.map((id) => K.episode(id)))).map((e) => [String(e['id']), e]));
  const rows = live.map((c): StudioShow & { since: string } => {
    const h = hosted.get(c.feedUrl);
    const meta = at(K.show(c.feedUrl));
    const fallback = meta?.['latestEpisodeId'] ? latest.get(String(meta['latestEpisodeId'])) : undefined;
    return {
      key: showKey(c.feedUrl), feedUrl: c.feedUrl, role: c.role, hosted: Boolean(h), since: c.since,
      title: h ? String(h['title']) : str(meta?.['newestTitle']) ?? str(fallback?.['showTitle']) ?? str(fallback?.['title']),
      image: h ? str(h['coverUrl']) ?? str(meta?.['newestImage']) : str(meta?.['newestImage']),
    };
  });
  rows.sort((a, b) => (a.role !== b.role ? (a.role === 'owner' ? -1 : 1) : a.since.localeCompare(b.since)));
  return rows.map(({ since: _s, ...r }) => r);
}

const copyOf = (i: Item): Copy => ({ feedUrl: String(i['feedUrl']), role: i['role'] === 'owner' ? 'owner' : 'operator', since: String(i['since']) });

export async function showsFor(store: Store, _db: Db, listenerId: string): Promise<StudioShow[]> {
  return resolve(store, listenerId, (await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.roles })).map(copyOf));
}

/** The caller's role on the show with this key, or null — one GetItem and one BatchGet per Studio request. */
export async function roleFor(store: Store, _db: Db, listenerId: string, key: string): Promise<StudioShow | null> {
  if (key.length === 0 || key.length > 64) return null;
  const copy = await get(store, 'main', K.roleCopy(listenerId, key));
  if (!copy) return null;
  return (await resolve(store, listenerId, [copyOf(copy)]))[0] ?? null;
}
