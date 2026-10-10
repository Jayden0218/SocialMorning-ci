// Playlists on DynamoDB: one item per playlist holding its ordered episodes, changed with a version check.
/**
 * M26 lane SG, SG-T08 (patterns SG-44…SG-59), data-model.md §3 (`L#<owner>/PLAYLIST#<id>`) and "Lane SG changes".
 *
 * - The playlist is ONE item: { id, ownerId, title, isPublic, items: [{ e, at }] (≤ 300, in order), createdAt,
 *   updatedAt, deletedAt?, v }. Replace-all (reorder/remove), add and rename are each one conditional write with
 *   `v = :seen` (retried on a race) — the old 300-row delete-and-insert transaction is gone (SG hard case).
 * - `U#PLAYLIST#<id>` → owner, written with the playlist, so `GET /v1/playlists/:id` (which knows only the id) is two
 *   GetItems. A deleted playlist stays as a tombstone (`deletedAt`), as before.
 * - The 50-playlist cap counts the owner's live items (one Query); the 300-episode cap is checked on the item.
 * - Episodes (lane LB) are read at read time — a card changes on every feed refresh, so it is never copied; hidden
 *   shows (lane SF) are left out of the episode list as before; the count and the cover keep them.
 */
import { randomUUID } from 'node:crypto';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item } from '../../../ddb/store.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { ApiError } from '../../../../errors.ts';
import { aput, partitionItems, txa } from '../../account/ddb/common.ts';
import { PLAYLISTS_MAX, PLAYLIST_ITEMS_MAX, type Playlist } from '../playlists.ts';
import { episodesById, hiddenFeeds, iso, listenersById, nowMs, type Hybrid } from './common.ts';

type Entry = { e: string; at: string };
const entries = (p: Item): Entry[] => ((p['items'] as Entry[] | undefined) ?? []).map((x) => ({ e: String(x.e), at: String(x.at) }));

async function ownerOf(h: Hybrid, id: string): Promise<string | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  return (await get(h.store, 'main', K.playlistOwner(id)))?.['owner'] as string | undefined;
}

async function liveItem(h: Hybrid, id: string): Promise<Item | undefined> {
  const owner = await ownerOf(h, id);
  if (!owner) return undefined;
  const p = await get(h.store, 'main', K.playlist(owner, id));
  return p && !p['deletedAt'] ? p : undefined;
}

/** SG-46: mine and not deleted, or 404. */
async function own(h: Hybrid, id: string, ownerId: string): Promise<Item> {
  const p = await liveItem(h, id);
  if (!p || p['ownerId'] !== ownerId) throw new ApiError('not_found', 'No such playlist.');
  return p;
}

/** The list cards: count and cover (the first episode's image) from the item; newest change first. */
async function cards(h: Hybrid, ps: Item[]): Promise<Playlist[]> {
  const firsts = await episodesById(h.store, ps.map((p) => entries(p)[0]?.e).filter((x): x is string => x !== undefined));
  return ps
    .sort((a, b) => String(b['updatedAt']).localeCompare(String(a['updatedAt'])))
    .map((p) => card(p, firsts));
}

function card(p: Item, eps: Map<string, Item>): Playlist {
  const first = entries(p)[0];
  const image = first ? (eps.get(first.e)?.['imageUrl'] as string | undefined) : undefined;
  return {
    id: String(p['id']), title: String(p['title']), isPublic: p['isPublic'] === true, count: entries(p).length, updatedAt: new Date(String(p['updatedAt'])).toISOString(),
    ...(image ? { imageUrl: image } : {}),
  };
}

async function liveOf(h: Hybrid, ownerId: string): Promise<Item[]> {
  return (await partitionItems(h, K.L(ownerId), K.SG_SK.playlists)).filter((p) => !p['deletedAt']);
}

export async function myPlaylists(h: Hybrid, ownerId: string): Promise<Playlist[]> {
  return cards(h, await liveOf(h, ownerId));
}

/** Public playlists of an account; all of them when the viewer is the owner. */
export async function playlistsOf(h: Hybrid, ownerId: string, viewerId: string | undefined): Promise<Playlist[]> {
  return cards(h, (await liveOf(h, ownerId)).filter((p) => p['isPublic'] === true || ownerId === viewerId));
}

export async function createPlaylist(h: Hybrid, ownerId: string, title: string, isPublic: boolean): Promise<Playlist> {
  if ((await liveOf(h, ownerId)).length >= PLAYLISTS_MAX) throw new ApiError('conflict', `You can keep at most ${PLAYLISTS_MAX} playlists.`);
  const id = randomUUID();
  const now = iso(nowMs(h));
  await txa(h.store)
    .put('main', encode('playlist', K.playlist(ownerId, id), { id, ownerId, title, isPublic, items: [], createdAt: now, updatedAt: now, v: 0 }), { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('unique', K.playlistOwner(id), { owner: ownerId }), { condition: 'attribute_not_exists(PK)' })
    .commit();
  return (await getPlaylist(h, id, ownerId))!;
}

/** One version-checked write of the playlist item (a racing change re-reads and applies again). */
async function change(h: Hybrid, id: string, ownerId: string, fn: (p: Item) => Record<string, unknown>): Promise<void> {
  await withVersionRetry(async () => {
    const p = await own(h, id, ownerId);
    const v = Number(p['v'] ?? 0);
    const attrs: Record<string, unknown> = { ...p, ...fn(p), updatedAt: iso(nowMs(h)), v: v + 1 };
    for (const k of ['PK', 'SK', 't']) delete attrs[k];
    await aput(h.store, 'main', encode('playlist', K.playlist(ownerId, id), attrs), { condition: 'v = :v', values: { ':v': v } });
  }, { tries: 5 });
}

export async function updatePlaylist(h: Hybrid, id: string, ownerId: string, p: { title?: string; isPublic?: boolean }): Promise<Playlist> {
  await change(h, id, ownerId, () => ({ ...(p.title !== undefined ? { title: p.title } : {}), ...(p.isPublic !== undefined ? { isPublic: p.isPublic } : {}) }));
  return (await getPlaylist(h, id, ownerId))!;
}

export async function deletePlaylist(h: Hybrid, id: string, ownerId: string): Promise<void> {
  await change(h, id, ownerId, () => ({ items: [], deletedAt: iso(nowMs(h)) }));
}

/** Replaces the whole ordered list (reorder and remove in one call). Unknown episodes are refused. */
export async function setItems(h: Hybrid, id: string, ownerId: string, episodeIds: string[]): Promise<Playlist> {
  await own(h, id, ownerId);
  const ids = [...new Set(episodeIds)];
  if (ids.length > PLAYLIST_ITEMS_MAX) throw new ApiError('conflict', `A playlist holds at most ${PLAYLIST_ITEMS_MAX} episodes.`);
  if (ids.length > 0 && (await episodesById(h.store, ids)).size !== ids.length) throw new ApiError('not_found', 'One of those episodes is unknown.');
  const now = iso(nowMs(h));
  await change(h, id, ownerId, (p) => {
    const kept = new Map(entries(p).map((x) => [x.e, x.at]));
    return { items: ids.map((e) => ({ e, at: kept.get(e) ?? now })) };
  });
  return (await getPlaylist(h, id, ownerId))!;
}

export async function addItem(h: Hybrid, id: string, ownerId: string, episodeId: string): Promise<Playlist> {
  await own(h, id, ownerId);
  if (!(await get(h.store, 'main', K.episode(episodeId)))) throw new ApiError('not_found', 'No such episode.');
  await change(h, id, ownerId, (p) => {
    const cur = entries(p);
    if (cur.length >= PLAYLIST_ITEMS_MAX) throw new ApiError('conflict', `A playlist holds at most ${PLAYLIST_ITEMS_MAX} episodes.`);
    return cur.some((x) => x.e === episodeId) ? {} : { items: [...cur, { e: episodeId, at: iso(nowMs(h)) }] };
  });
  return (await getPlaylist(h, id, ownerId))!;
}

/** One playlist with its episodes in order — undefined (404) when private and not the viewer's. */
export async function getPlaylist(h: Hybrid, id: string, viewerId: string | undefined): Promise<Playlist | undefined> {
  const p = await liveItem(h, id);
  if (!p) return undefined;
  const ownerId = String(p['ownerId']);
  if (p['isPublic'] !== true && ownerId !== viewerId) return undefined;
  const owner = (await listenersById(h.store, [ownerId])).get(ownerId);
  if (!owner) return undefined;
  const list = entries(p);
  const eps = await episodesById(h.store, list.map((x) => x.e));
  const hidden = await hiddenFeeds(h, [...new Set([...eps.values()].map((e) => String(e['feedUrl'])))]);
  const avatar = owner['avatarUrl'] as string | undefined;
  return {
    ...card(p, eps),
    owner: { id: ownerId, displayName: String(owner['displayName']), ...(avatar ? { avatarUrl: avatar } : {}) },
    items: list.flatMap((x) => {
      const e = eps.get(x.e);
      if (!e || hidden.has(String(e['feedUrl']))) return [];
      const image = e['imageUrl'] as string | null | undefined;
      const dur = e['durationMs'] as number | null | undefined;
      const pub = e['publishedAt'] as string | null | undefined;
      return [{
        id: x.e, feedUrl: String(e['feedUrl']), guid: String(e['guid']), title: String(e['title']), showTitle: (e['showTitle'] as string | undefined) ?? '', enclosureUrl: String(e['enclosureUrl']),
        ...(image ? { imageUrl: image } : {}), ...(dur !== null && dur !== undefined ? { durationMs: Number(dur) } : {}),
        ...(pub ? { publishedAt: new Date(pub).toISOString() } : {}),
      }];
    }),
  };
}

/** "Download my data" (lane AC's export): the old `playlists` and `playlist_items` rows, from the items. */
export async function exportPlaylists(h: Hybrid, ownerId: string): Promise<{ playlists: Record<string, unknown>[]; items: Record<string, unknown>[] }> {
  const all = await partitionItems(h, K.L(ownerId), K.SG_SK.playlists);
  return {
    playlists: all.map((p) => ({
      id: p['id'], owner_id: p['ownerId'], title: p['title'], is_public: p['isPublic'] === true, created_at: p['createdAt'], updated_at: p['updatedAt'], deleted_at: p['deletedAt'] ?? null,
    })),
    items: all.flatMap((p) => entries(p).map((x, position) => ({ playlist_id: p['id'], episode_id: x.e, position, added_at: x.at }))),
  };
}
