// Comment control and the Studio's comments on DynamoDB: the policy, held comments, the show's comment list, host hides.
/**
 * M26 lane ST, ST-T03 (patterns ST-10…ST-27, ST-110…ST-113, ST-150), data-model.md "Lane ST changes".
 *
 * - Policy: `SH#<feedKey>/POLICY#<episodeId>` ('' = the whole show); the comment POST reads two keys in one BatchGet.
 * - Team: the proven owner (`U#PROVEN`), invited hosts (`HOST#`) and helpers (`TEAM#`) — one BatchGet.
 * - Held comments (review mode) are lane ST's items: `EP#<episodeId>/HELD#<id>` (beside the episode's comments, so the
 *   author's own held ones are one Query of the episode), `HELDREF#<id>` (by id), `SH#<feedKey>/HELDQ#<createdAt>#<id>`
 *   (the show's pending queue, oldest first) and `L#<author>/HELD#<createdAt>#<id>` (the 5-second floor, account
 *   deletion). Their pictures count in `CFG#bytes.heldImageBytes` (lane SC's ceiling adds it).
 *   Approve: the held items go (one transaction, conditioned on the held comment still being there — so two approvals
 *   cannot both post it), then the comment is created by lane SC's `createComment` (activity, notices, heat) and the
 *   picture moves through `setCommentImage`.
 * - The show's comments are lane SC's items, read per episode of the show (G2) in parallel; one load serves the calls of
 *   one request that run together (common.ts `shared`). Host hide/unhide is lane SC's `setCommentHostHidden` (heat,
 *   counts, stamp); the moderation record is lane SF's `MA#` item (+ its bridge row); the feed item is lane SG's
 *   (`removeActivityByRef` / `recordActivity`); /mod's "latest host hides" is `CFG#host-hides/<at>#<commentId>`.
 */
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { countryOf } from '../../account/country.ts';
import { createComment, setCommentHostHidden, type PublicComment } from '../../social/comments.ts';
import { setCommentImage } from '../../social/comment-writes.ts';
import { commentItemById } from '../../social/ddb/sc-common.ts';
import { recordActivity, removeActivityByRef } from '../../social/graph-ddb/activity.ts';
import { dashAdd } from '../../safety/ddb/dash.ts';
import type { ImageStorage } from '../../../../storage/image-store.ts';
import { heldToPublic, type CommentMode, type PendingComment } from '../comment-policy.ts';
import type { StudioComment } from '../studio-comments.ts';
import { provenOf } from './claims.ts';
import { bridgeOf, episodesById, getMany, isUuid, keyOf, listenersById, mapLimit, nowIso, nowMs, partition, shared, showEpisodes, str, type Db } from './common.ts';

// ---- the policy ----

export async function modeFor(store: Store, _db: Db, feedUrl: string, episodeId: string): Promise<CommentMode> {
  const items = await getMany(store, 'main', [K.commentPolicy(feedUrl, episodeId), K.commentPolicy(feedUrl, '')]);
  const ep = items.find((i) => i['episodeId'] === episodeId && episodeId !== '');
  const show = items.find((i) => i['episodeId'] === '');
  return ((ep ?? show)?.['mode'] as CommentMode | undefined) ?? 'open';
}

export async function policyOf(store: Store, _db: Db, feedUrl: string): Promise<{ show: CommentMode; episodes: { episodeId: string; mode: CommentMode }[] }> {
  const rows = (await partition(store, 'main', K.SH(feedUrl), { prefix: 'POLICY#' })).sort((a, b) => String(b['updatedAt']).localeCompare(String(a['updatedAt'])));
  return {
    show: (rows.find((r) => r['episodeId'] === '')?.['mode'] as CommentMode | undefined) ?? 'open',
    episodes: rows.filter((r) => r['episodeId'] !== '').map((r) => ({ episodeId: String(r['episodeId']), mode: r['mode'] as CommentMode })),
  };
}

export async function setPolicy(store: Store, _db: Db, feedUrl: string, episodeId: string, mode: CommentMode | null, by: string): Promise<void> {
  if (episodeId !== '') {
    const e = await get(store, 'main', K.episode(episodeId));
    if (!e || e['feedUrl'] !== feedUrl) throw new ApiError('not_found', 'That episode is not on this show.');
  }
  const t = tx(store);
  if (mode === null) t.delete('main', K.commentPolicy(feedUrl, episodeId));
  else t.put('main', encode('commentPolicy', K.commentPolicy(feedUrl, episodeId), { feedUrl, episodeId, mode, updatedBy: by, updatedAt: nowIso(store) }));
  await t.commit();
}

/** The owner, invited hosts and operators of the show (hosts and operators count only while it is claimed). */
async function isTeam(store: Store, feedUrl: string, listenerId: string): Promise<boolean> {
  const items = await getMany(store, 'main', [K.U.proven(feedUrl), K.showHost(feedUrl, listenerId), K.teamMember(feedUrl, listenerId)]);
  const proven = items.find((i) => String(i['PK']).startsWith('U#'));
  if (!proven) return false;
  return proven['listenerId'] === listenerId || items.length > 1;
}

// ---- held comments ----

type HeldRow = Parameters<typeof heldToPublic>[0];

async function heldRows(store: Store, items: Item[]): Promise<HeldRow[]> {
  const people = await listenersById(store, items.map((h) => String(h['authorId'])));
  return items.map((h) => {
    const l = people.get(String(h['authorId']));
    return {
      id: String(h['id']), episode_id: String(h['episodeId']), author_id: String(h['authorId']), parent_id: str(h['parentId']), body: String(h['body']),
      offset_ms: h['offsetMs'] === null || h['offsetMs'] === undefined ? null : Number(h['offsetMs']), country: str(h['country']), created_at: String(h['createdAt']),
      display_name: l ? String(l['displayName']) : null, avatar_url: str(l?.['avatarUrl']),
      image_url: str(h['imageUrl']), image_path: str(h['imagePath']),
      image_w: h['imageW'] === undefined || h['imageW'] === null ? null : Number(h['imageW']), image_h: h['imageH'] === undefined || h['imageH'] === null ? null : Number(h['imageH']),
      image_bytes: h['imageBytes'] === undefined || h['imageBytes'] === null ? null : Number(h['imageBytes']),
    };
  });
}

async function heldItem(store: Store, id: string): Promise<Item | undefined> {
  if (!isUuid(id)) return undefined;
  const ref = await get(store, 'main', K.heldRef(id));
  return ref ? get(store, 'main', K.heldComment(String(ref['episodeId']), id)) : undefined;
}

export async function heldForImage(store: Store, _db: Db, id: string): Promise<HeldRow | undefined> {
  const h = await heldItem(store, id);
  return h ? (await heldRows(store, [h]))[0] : undefined;
}

const HELD_BYTES = 'heldImageBytes';
const heldBytesStep = (t: Tx, delta: number): void => {
  if (delta === 0) return;
  t.update('main', K.config('bytes'), { update: 'SET #t = if_not_exists(#t, :t) ADD #b :d', names: { '#t': 't', '#b': HELD_BYTES }, values: { ':t': 'config', ':d': delta } });
};

/** The bytes the pictures of held comments take (part of lane SC's image-store ceiling). */
export async function heldImageBytes(store: Store): Promise<number> {
  return Number((await get(store, 'main', K.config('bytes')))?.[HELD_BYTES] ?? 0);
}

export async function setHeldImage(store: Store, db: Db, id: string, authorId: string, im: { url: string; path: string; w: number; h: number; bytes: number }): Promise<HeldRow | undefined> {
  const h = await heldItem(store, id);
  if (!h) return undefined;
  const t = tx(store).update('main', keyOf(h), {
    update: 'SET #u = :u, #p = :p, #w = :w, #h = :h, #b = :b',
    condition: 'attribute_exists(PK) AND #a = :a AND (attribute_not_exists(#p) OR attribute_type(#p, :nul))',
    names: { '#u': 'imageUrl', '#p': 'imagePath', '#w': 'imageW', '#h': 'imageH', '#b': 'imageBytes', '#a': 'authorId' },
    values: { ':u': im.url, ':p': im.path, ':w': im.w, ':h': im.h, ':b': im.bytes, ':a': authorId, ':nul': 'NULL' }, label: 'held',
  });
  heldBytesStep(t, im.bytes);
  try { await t.commit(); } catch (e) { if (e instanceof TxCancelled && e.failed('held')) return undefined; throw e; }
  return heldForImage(store, db, id);
}

/**
 * The one call in the comment POST (US8): `closed` throws 403 `comments_closed`; `review` holds the comment and returns
 * what its author sees; `open` (or the team) returns null — post as usual.
 */
export async function commentControl(
  store: Store, db: Db, episode: { id: string; feed_url: string }, authorId: string,
  c: { body: string; offsetMs?: number | undefined; parentId?: string | undefined; countryHeader?: string | undefined },
): Promise<(PublicComment & { held: true }) | null> {
  const mode = await modeFor(store, db, episode.feed_url, episode.id);
  if (mode === 'open' || (await isTeam(store, episode.feed_url, authorId))) return null;
  if (mode === 'closed') throw new ApiError('comments_closed', 'The host has closed comments here.');
  if (c.parentId) {
    const p = await commentItemById(store, c.parentId);
    if (!p || p['episodeId'] !== episode.id) throw new ApiError('not_found', 'That comment is not on this episode.');
    if (p['parentId']) throw new ApiError('reply_depth', 'You can reply to a comment, not to a reply.');
  }
  // The same 5 s floor as a posted comment (the route's floor reads the comments only).
  const since = new Date(nowMs(store) - 5_000).toISOString();
  const recent = (await partition(store, 'main', K.L(authorId), { from: `HELD#${since}`, to: 'HELD#~' })).filter((i) => String(i['createdAt']) > since);
  if (recent.length > 0) throw new ApiError('locked', 'One comment every few seconds, please.', { retryAfterSeconds: 5 });
  const id = randomUUID();
  const createdAt = nowIso(store);
  const country = countryOf(c.countryHeader) ?? null;
  const item = encode('heldComment', K.heldComment(episode.id, id), {
    id, episodeId: episode.id, feedUrl: episode.feed_url, authorId, parentId: c.parentId ?? null, body: c.body, offsetMs: c.offsetMs ?? null, country, createdAt,
  });
  await tx(store)
    .put('main', item, { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('heldRef', K.heldRef(id), { id, episodeId: episode.id, feedUrl: episode.feed_url, authorId, createdAt }))
    .put('main', encode('heldPtr', K.heldInShow(episode.feed_url, createdAt, id), { id, episodeId: episode.id, createdAt }))
    .put('main', encode('heldPtr', K.heldBy(authorId, createdAt, id), { id, episodeId: episode.id, createdAt }))
    .commit();
  return heldToPublic((await heldRows(store, [item]))[0]!);
}

export async function requireOpenForVoice(store: Store, db: Db, episode: { id: string; feed_url: string }, authorId: string): Promise<void> {
  const mode = await modeFor(store, db, episode.feed_url, episode.id);
  if (mode === 'open' || (await isTeam(store, episode.feed_url, authorId))) return;
  throw new ApiError('comments_closed', mode === 'closed' ? 'The host has closed comments here.' : 'The host checks comments here first. Write your comment instead.');
}

async function heldOfAuthor(store: Store, episodeId: string, authorId: string): Promise<Item[]> {
  return (await partition(store, 'main', K.EP(episodeId), { prefix: 'HELD#' }))
    .filter((h) => h['authorId'] === authorId)
    .sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt'])));
}

export async function heldForAuthor(store: Store, _db: Db, episodeId: string, authorId: string): Promise<(PublicComment & { held: true })[]> {
  return (await heldRows(store, await heldOfAuthor(store, episodeId, authorId))).map(heldToPublic);
}

/** Changes when the viewer's held comments on the episode change (the poll's ETag). */
export async function heldStamp(store: Store, _db: Db, episodeId: string, viewerId: string | undefined): Promise<string> {
  if (!viewerId) return '-';
  const mine = await heldOfAuthor(store, episodeId, viewerId);
  const newest = mine.length ? String(mine[mine.length - 1]!['createdAt']) : '-';
  return `${mine.length}/${mine.filter((h) => h['imagePath']).length}/${newest}`;
}

export async function listPending(store: Store, _db: Db, feedUrl: string, episodeId?: string): Promise<PendingComment[]> {
  const ptrs = await partition(store, 'main', K.SH(feedUrl), { prefix: 'HELDQ#' });
  const items = await getMany(store, 'main', ptrs.filter((p) => !episodeId || p['episodeId'] === episodeId).map((p) => K.heldComment(String(p['episodeId']), String(p['id']))));
  const rows = await heldRows(store, items.slice(0, 200));
  const eps = await episodesById(store, rows.map((r) => r.episode_id));
  return rows.filter((r) => eps.has(r.episode_id)).map((r) => ({
    id: r.id, episodeId: r.episode_id, episodeTitle: String(eps.get(r.episode_id)!['title']), author: { id: r.author_id, displayName: r.display_name ?? '' },
    body: r.body, offsetMs: r.offset_ms, parentId: r.parent_id, createdAt: new Date(r.created_at).toISOString(),
  }));
}

async function heldOnShow(store: Store, feedUrl: string, id: string): Promise<Item | undefined> {
  const h = await heldItem(store, id);
  return h && h['feedUrl'] === feedUrl ? h : undefined;
}

/** Deletes a held comment's items in one transaction (conditioned on it still being there). False when it was already gone. */
async function dropHeld(store: Store, h: Item): Promise<boolean> {
  const id = String(h['id']);
  const createdAt = String(h['createdAt']);
  const t = tx(store)
    .delete('main', keyOf(h), { label: 'held' })
    .delete('main', K.heldRef(id))
    .delete('main', K.heldInShow(String(h['feedUrl']), createdAt, id))
    .delete('main', K.heldBy(String(h['authorId']), createdAt, id));
  heldBytesStep(t, -Number(h['imageBytes'] ?? 0));
  try { await t.commit(); return true; } catch (e) { if (e instanceof TxCancelled && e.failed('held')) return false; throw e; }
}

/** Approve: the comment joins the episode as if posted now — the app's own create (activity, notices, heat). */
export async function approveHeld(store: Store, db: Db, feedUrl: string, id: string): Promise<{ commentId: string }> {
  const h = await heldOnShow(store, feedUrl, id);
  if (!h || !(await dropHeld(store, h))) throw new ApiError('not_found', 'No such comment waiting on this show.');
  const parentId = str(h['parentId']);
  const parentLive = parentId ? Boolean(await commentItemById(store, parentId)) : true;
  try {
    const created = await createComment(db, {
      episodeId: String(h['episodeId']), authorId: String(h['authorId']), body: String(h['body']),
      ...(h['offsetMs'] !== null && h['offsetMs'] !== undefined ? { offsetMs: Number(h['offsetMs']) } : {}),
      ...(parentId && parentLive ? { parentId } : {}),
      ...(h['country'] ? { country: String(h['country']).trim() } : {}),
    });
    // Fix F-S: the picture added while it waited moves with it (lane SC's repo; the file stays where it is).
    if (h['imagePath']) await setCommentImage(db, created.id, String(h['imageUrl']), String(h['imagePath']), Number(h['imageW']), Number(h['imageH']), Number(h['imageBytes']));
    return { commentId: created.id };
  } catch (e) {
    // The comment could not be made: the held one comes back, as the old single transaction would have left it.
    const restore = tx(store)
      .put('main', h, { condition: 'attribute_not_exists(PK)' })
      .put('main', encode('heldRef', K.heldRef(id), { id, episodeId: String(h['episodeId']), feedUrl, authorId: String(h['authorId']), createdAt: String(h['createdAt']) }))
      .put('main', encode('heldPtr', K.heldInShow(feedUrl, String(h['createdAt']), id), { id, episodeId: String(h['episodeId']), createdAt: String(h['createdAt']) }))
      .put('main', encode('heldPtr', K.heldBy(String(h['authorId']), String(h['createdAt']), id), { id, episodeId: String(h['episodeId']), createdAt: String(h['createdAt']) }));
    heldBytesStep(restore, Number(h['imageBytes'] ?? 0));
    await restore.commit().catch(() => undefined);
    throw e;
  }
}

/** Reject: the held comment is deleted; its picture is deleted from the image store too (a failed delete is logged). */
export async function rejectHeld(store: Store, _db: Db, feedUrl: string, id: string, images?: ImageStorage): Promise<void> {
  const h = await heldOnShow(store, feedUrl, id);
  if (!h || !(await dropHeld(store, h))) throw new ApiError('not_found', 'No such comment waiting on this show.');
  if (h['imagePath'] && images?.ready) {
    try { await images.remove(String(h['imagePath'])); } catch (e) { console.error('held comment image remove', e instanceof Error ? e.message : String(e)); }
  }
}

/** Lane SC (image cleanup on account deletion): the pictures on comments a listener still has waiting for review. */
export async function heldWithImagesOf(store: Store, listenerId: string): Promise<{ id: string; image_path: string }[]> {
  const ptrs = await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.held });
  const items = await getMany(store, 'main', ptrs.map((p) => K.heldComment(String(p['episodeId']), String(p['id']))));
  return items.filter((h) => h['imagePath']).map((h) => ({ id: String(h['id']), image_path: String(h['imagePath']) }));
}

/** Lane AC's data export: the listener's held comments as the old `held_comments` rows (snake_case), oldest first. */
export async function heldExportRows(store: Store, listenerId: string): Promise<Record<string, unknown>[]> {
  const ptrs = await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.held });
  const items = await getMany(store, 'main', ptrs.map((p) => K.heldComment(String(p['episodeId']), String(p['id']))));
  return items.sort((a, b) => String(a['createdAt']).localeCompare(String(b['createdAt']))).map((h) => ({
    id: h['id'], episode_id: h['episodeId'], author_id: h['authorId'], parent_id: h['parentId'] ?? null, body: h['body'], offset_ms: h['offsetMs'] ?? null,
    country: h['country'] ?? null, created_at: h['createdAt'], image_url: h['imageUrl'] ?? null, image_path: h['imagePath'] ?? null,
    image_w: h['imageW'] ?? null, image_h: h['imageH'] ?? null, image_bytes: h['imageBytes'] ?? null,
  }));
}

/** Lane SC: a held comment's picture is forgotten once its file is gone. */
export async function forgetHeldImage(store: Store, id: string): Promise<void> {
  const h = await heldItem(store, id);
  if (!h || !h['imagePath']) return;
  const t = tx(store).update('main', keyOf(h), { update: 'REMOVE #u, #p, #w, #h, #b', condition: 'attribute_exists(PK)', names: { '#u': 'imageUrl', '#p': 'imagePath', '#w': 'imageW', '#h': 'imageH', '#b': 'imageBytes' } });
  heldBytesStep(t, -Number(h['imageBytes'] ?? 0));
  await t.commit().catch((e: unknown) => { if (!isConditionFailed(e)) throw e; });
}

/** Account deletion: every held comment of the listener goes (the old cascade on held_comments.author_id). True when none is left. */
export async function deleteHeldStep(store: Store, listenerId: string): Promise<boolean> {
  const ptrs = await partition(store, 'main', K.L(listenerId), { prefix: K.ST_SK.held, max: 25 });
  if (ptrs.length === 0) return true;
  for (const p of ptrs) {
    const h = await get(store, 'main', K.heldComment(String(p['episodeId']), String(p['id'])));
    if (h) await dropHeld(store, h);
    else await tx(store).delete('main', keyOf(p)).commit();
  }
  return false;
}

// ---- the show's comments (lane SC's items) ----

const PAGE = 30;

/** Every comment of the show (lane SC's items, one Query per episode, in parallel) — one load per request at a time. */
export function showComments(store: Store, feedUrl: string): Promise<{ comments: Item[]; episodes: Map<string, Item> }> {
  return shared(`comments|${store.tables.main}|${feedUrl}`, async () => {
    const eps = await showEpisodes(store, feedUrl);
    const lists = await mapLimit(eps, 16, (e) => partition(store, 'main', K.EP(String(e['id'])), { prefix: 'C#' }));
    return { comments: lists.flat().filter((c) => c['t'] === 'comment'), episodes: new Map(eps.map((e) => [String(e['id']), e])) };
  });
}

export const visibleComment = (c: Item): boolean => !c['deletedAt'] && !c['removedAt'] && !c['hostHiddenAt'];

export async function listShowComments(store: Store, _db: Db, feedUrl: string, opts: { q?: string; episodeId?: string; before?: string } = {}): Promise<{ items: StudioComment[]; next?: string }> {
  const { comments, episodes } = await showComments(store, feedUrl);
  const q = opts.q?.trim().toLowerCase() || null;
  const before = opts.before && !Number.isNaN(Date.parse(opts.before)) ? Date.parse(opts.before) : null;
  const replies = new Map<string, number>();
  for (const c of comments) if (c['parentId']) replies.set(String(c['parentId']), (replies.get(String(c['parentId'])) ?? 0) + 1);
  const rows = comments
    .filter((c) => (!q || String(c['body'] ?? '').toLowerCase().includes(q)) && (!opts.episodeId || c['episodeId'] === opts.episodeId) && (before === null || Date.parse(String(c['createdAt'])) < before))
    .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])) || String(b['id']).localeCompare(String(a['id'])))
    .slice(0, PAGE + 1);
  const page = rows.slice(0, PAGE);
  const [people, proven, team] = await Promise.all([
    listenersById(store, page.map((c) => str(c['authorId']))),
    provenOf(store, feedUrl),
    partition(store, 'main', K.SH(feedUrl), { prefix: 'TEAM#' }),
  ]);
  const teamIds = new Set([...(proven ? [proven.listenerId] : []), ...team.map((m) => String(m['listenerId']))]);
  const items = page.map((c): StudioComment => {
    const state: StudioComment['state'] = c['removedAt'] ? 'removed' : c['deletedAt'] ? 'deleted' : c['hostHiddenAt'] ? 'host_hidden' : 'visible';
    const shown = state === 'visible' || state === 'host_hidden';
    const authorId = str(c['authorId']);
    return {
      id: String(c['id']), episodeId: String(c['episodeId']), episodeTitle: String(episodes.get(String(c['episodeId']))?.['title'] ?? ''),
      author: shown && authorId ? { id: authorId, displayName: str(people.get(authorId)?.['displayName']) ?? '' } : null,
      body: shown ? str(c['body']) : null, state, offsetMs: shown && c['offsetMs'] !== undefined && c['offsetMs'] !== null ? Number(c['offsetMs']) : null,
      createdAt: new Date(String(c['createdAt'])).toISOString(), parentId: str(c['parentId']), replies: replies.get(String(c['id'])) ?? 0,
      byTeam: authorId !== null && teamIds.has(authorId),
      pinned: shown && Boolean(c['pinnedAt']), pinnedBottom: shown && Boolean(c['pinnedBottomAt']),
      ...(shown && c['voiceUrl'] && c['voiceMs'] ? { voice: { url: String(c['voiceUrl']), ms: Number(c['voiceMs']) } } : {}),
    };
  });
  const last = page[page.length - 1];
  return { items, ...(rows.length > PAGE && last ? { next: new Date(String(last['createdAt'])).toISOString() } : {}) };
}

/** The comment, only if it belongs to this feed — every Studio write on a comment starts here. */
export async function commentOnFeed(store: Store, _db: Db, feedUrl: string, id: string): Promise<{ id: string; episode_id: string; parent_id: string | null; author_id: string | null; offset_ms: number | null } | undefined> {
  if (!isUuid(id)) return undefined;
  const c = await commentItemById(store, id);
  if (!c) return undefined;
  const ep = await get(store, 'main', K.episode(String(c['episodeId'])));
  if (!ep || ep['feedUrl'] !== feedUrl) return undefined;
  return { id, episode_id: String(c['episodeId']), parent_id: str(c['parentId']), author_id: str(c['authorId']), offset_ms: c['offsetMs'] === undefined || c['offsetMs'] === null ? null : Number(c['offsetMs']) };
}

/** Hide (or un-hide) a comment on this show; logged for /mod; the heat curve, the counts and the feed item follow. */
export async function setHostHidden(store: Store, db: Db, feedUrl: string, id: string, actorId: string, hidden: boolean): Promise<void> {
  const c = await commentOnFeed(store, db, feedUrl, id);
  if (!c) throw new ApiError('not_found', 'No such comment on this show.');
  const before = await commentItemById(store, id);
  // Lane SC's setter: the comment's flag, its heat mark, the top-level count and the poll stamp (+ its bridge row).
  if (!(await setCommentHostHidden(db, id, hidden ? actorId : null))) return; // already in that state: nothing to log
  const at = nowIso(store);
  const actionId = randomUUID();
  const action = hidden ? 'host_hide' : 'host_unhide';
  const t = tx(store).put('main', encode('moderationAction', K.moderationAction(actionId), {
    id: actionId, actorId, action, targetKind: 'comment', targetId: id, subjectListenerId: null, reportAuthorId: null, snapshot: {}, createdAt: at,
  }, { gsi: K.G4('actions', at, actionId) }), { condition: 'attribute_not_exists(PK)' });
  dashAdd(t, 'actions', at);
  if (hidden) t.put('main', encode('hostHide', K.hostHide(at, id), { commentId: id, episodeId: c.episode_id, feedUrl, by: actorId, at }));
  else if (before?.['hostHiddenAt']) t.delete('main', K.hostHide(String(before['hostHiddenAt']), id));
  await t.commit();
  const raw = bridgeOf(db);
  if (raw) await raw.query("INSERT INTO moderation_actions (id, actor_id, action, target_kind, target_id, created_at) VALUES ($1, $2, $3, 'comment', $4, $5)", [actionId, actorId, action, id, at]);
  // A top-level comment is a feed item (M4): it leaves the feeds while hidden and comes back after (lane SG).
  if (c.parent_id === null && c.author_id) {
    if (hidden) await removeActivityByRef(store, db, 'commented', id);
    else await recordActivity(store, db, { actorId: c.author_id, kind: 'commented', episodeId: c.episode_id, momentMs: c.offset_ms, refId: id });
  }
}

/** For /mod: the latest host hides still in force, with enough to judge them. */
export async function recentHostHides(store: Store, _db: Db, limit = 50): Promise<{ id: string; body: string | null; title: string; feedUrl: string; by: string | null; at: string }[]> {
  const marks = await partition(store, 'main', 'CFG#host-hides', { newestFirst: true, max: limit * 2 });
  const out: { id: string; body: string | null; title: string; feedUrl: string; by: string | null; at: string }[] = [];
  const comments = await mapLimit(marks, 8, (m) => commentItemById(store, String(m['commentId'])));
  const eps = await episodesById(store, marks.map((m) => String(m['episodeId'])));
  const people = await listenersById(store, comments.map((x) => str(x?.['hostHiddenBy'])));
  for (const [i, m] of marks.entries()) {
    const cm = comments[i];
    if (!cm || !cm['hostHiddenAt'] || String(cm['hostHiddenAt']) !== String(m['at'])) continue; // shown again, or hidden again later
    const e = eps.get(String(m['episodeId']));
    if (!e) continue;
    const by = str(cm['hostHiddenBy']);
    out.push({ id: String(cm['id']), body: str(cm['body']), title: String(e['title']), feedUrl: String(e['feedUrl']), by: by ? str(people.get(by)?.['displayName']) : null, at: new Date(String(cm['hostHiddenAt'])).toISOString() });
    if (out.length >= limit) break;
  }
  return out;
}

/** Comments the listener wrote in the last 5 seconds (the Studio reply's rate floor) — lane SC's author index. */
export async function recentCommentCountRows(store: Store, _db: Db, authorId: string): Promise<{ n: number }[]> {
  const since = new Date(nowMs(store) - 5_000).toISOString();
  const recent = (await partition(store, 'main', K.L(authorId), { from: `CMT#${since}`, to: 'CMT#~' })).filter((i) => Date.parse(String(i['createdAt'])) > Date.parse(since));
  return [{ n: recent.length }];
}
