// Shows made in the Studio on DynamoDB: the show, its episodes, the scheduled timer, the byte ceiling and paid episodes.
/**
 * M26 lane ST, ST-T02 (patterns ST-57…ST-73, ST-151, ST-152, ST-154), data-model.md §3, §7 B and "Lane ST changes".
 *
 * - `HS#<showId>/S` the show (G4 `Q#hosted` by `updatedAt` while live — the /mod list); `SH#<feedKey>/HOSTED` → its id
 *   (a feed address need not carry the id); `L#<owner>/HOSTED#<showId>` (the owner's count of 5, account deletion).
 *   Creating one is ONE transaction: the show, both pointers, the owner's PROVEN claim (claims.ts) and their role copy.
 * - `HS#<showId>/E#<id>` its episodes; `HEP#<id>/R` → the show (the paid-episode routes know only the episode id).
 * - Stored audio bytes: `CFG#bytes.hostedAudioBytes`, moved in the same transaction as each publish / delete (§7 B;
 *   was `sum(audio_bytes)`).
 * - Going live (ST-64, guard G-M26-ST1): an episode joins the app's episode table only once it is published, due and
 *   free. While it waits it carries G4 `Q#scheduled` / `<publishedAt>#<id>`. `promoteHostedEpisode` is ONE transaction:
 *   the hosted episode's `promotedAt` (condition: not promoted yet, still published, free, due, not deleted) + the app
 *   episode in lane LB's item shape (`EP#<id>/META` with its G2 key, `U#GUID`) + the `heat.place` entry when its length
 *   is known — so however many timers or readers fire at once, the episode goes live exactly once. Readers still
 *   promote on read (the old behaviour: the feed, the overview); the timer is the `scheduled` sweep step (src/jobs/
 *   studio-nightly.ts `promoteScheduled`), which a 1-minute schedule can call in production.
 */
import { randomUUID } from 'node:crypto';
import { autoCoverUrl, fnv1a64, isAutoCover } from '@socialmorning/social-core';
import { ApiError } from '../../../../errors.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled, type Tx } from '../../../ddb/tx.ts';
import { claimUnique } from '../../../ddb/unique.ts';
import { isConditionFailed } from '../../../ddb/retry.ts';
import { enqueue } from '../../../../jobs/outbox.ts';
import { HEAT_PLACE } from '../../../../heat/ddb.ts';
import { touchShow, episodeRow } from '../../library/ddb/episodes.ts';
import { getEpisode, upsertEpisode } from '../../library/episodes.ts';
import { PREVIEW_MAX_MS, type HostedEpisode, type HostedShow, type ShowIn } from '../hosted.ts';
import { claimItem, proveInTx } from './claims.ts';
import { getMany, isUuid, keyOf, nowIso, nowMs, partition, queue, showEpisodes, str, type Db } from './common.ts';

const BYTES = 'hostedAudioBytes';

const toShow = (i: Item): HostedShow => ({
  id: String(i['id']), ownerId: String(i['ownerId']), feedUrl: String(i['feedUrl']), title: String(i['title']), description: String(i['description'] ?? ''),
  author: String(i['author'] ?? ''), language: String(i['language'] ?? 'zh'), category: String(i['category'] ?? 'Society & Culture'), explicit: i['explicit'] === true,
  coverUrl: str(i['coverUrl']), createdAt: new Date(String(i['createdAt'])).toISOString(), updatedAt: new Date(String(i['updatedAt'])).toISOString(),
  priceTier: i['priceTier'] === null || i['priceTier'] === undefined ? null : Number(i['priceTier']),
});

export const toEp = (i: Item, now: number): HostedEpisode => ({
  id: String(i['id']), guid: String(i['guid']), episodeId: String(i['episodeId']), title: String(i['title']), description: String(i['description'] ?? ''),
  audioUrl: String(i['audioUrl']), audioBytes: Number(i['audioBytes']), audioType: String(i['audioType']), durationMs: i['durationMs'] === null || i['durationMs'] === undefined ? null : Number(i['durationMs']),
  publishedAt: new Date(String(i['publishedAt'])).toISOString(), status: i['status'] === 'draft' ? 'draft' : 'published', coverUrl: str(i['coverUrl']),
  scheduled: i['status'] === 'published' && Date.parse(String(i['publishedAt'])) > now,
  paid: i['paid'] === true, paidAllowed: i['createdAt'] !== null && i['createdAt'] !== undefined,
  ...(i['previewStartMs'] !== null && i['previewStartMs'] !== undefined && i['previewEndMs'] !== null && i['previewEndMs'] !== undefined
    ? { preview: { startMs: Number(i['previewStartMs']), endMs: Number(i['previewEndMs']) } } : {}),
});

const apiBase = (feedUrl: string) => feedUrl.replace(/\/feeds\/[^/]+$/, '');
const drawnCover = (base: string, title: string) => (base.startsWith('https://') ? autoCoverUrl(base, title) : null);

/** The scheduled-queue key while an episode waits to go live (published, free, not deleted, not promoted). */
const waiting = (e: Item): boolean => e['status'] === 'published' && e['paid'] !== true && !e['deletedAt'] && !e['promotedAt'];
const gsiOf = (e: Item): Record<string, string> => (waiting(e) ? K.G4('scheduled', String(e['publishedAt']), `${String(e['showId'])}#${String(e['id'])}`) : {});

export function showItem(s: HostedShow & { deletedAt?: string | null }): Item {
  const { id, ownerId, feedUrl, title, description, author, language, category, explicit, coverUrl, priceTier, createdAt, updatedAt } = s;
  return encode('hostedShow', K.hostedShow(id), { id, ownerId, feedUrl, title, description, author, language, category, explicit, coverUrl, priceTier, createdAt, updatedAt, deletedAt: s.deletedAt ?? undefined },
    s.deletedAt ? {} : { gsi: K.G4('hosted', updatedAt, id) });
}

export function epItem(e: Record<string, unknown>): Item {
  const base: Record<string, unknown> = {};
  for (const k of ['id', 'showId', 'guid', 'episodeId', 'title', 'description', 'audioUrl', 'audioBytes', 'audioType', 'durationMs', 'publishedAt', 'status', 'coverUrl', 'paid', 'createdAt', 'createdBy', 'previewStartMs', 'previewEndMs', 'deletedAt', 'promotedAt']) {
    if (e[k] !== undefined && !(k === 'deletedAt' && e[k] === null)) base[k] = e[k];
  }
  return encode('hostedEpisode', K.hostedEpisode(String(e['showId']), String(e['id'])), base, { gsi: gsiOf(e as Item) });
}

const bytesStep = (t: Tx, delta: number): void => {
  if (delta === 0) return;
  t.update('main', K.config('bytes'), { update: 'SET #t = if_not_exists(#t, :t) ADD #b :d', names: { '#t': 't', '#b': BYTES }, values: { ':t': 'config', ':d': delta } });
};

// ---- the show ----

export async function createHostedShow(store: Store, _db: Db, ownerId: string, publicBase: string, s: ShowIn): Promise<HostedShow> {
  const id = randomUUID();
  const feedUrl = `${publicBase.replace(/\/$/, '')}/feeds/${id}.xml`;
  const now = nowIso(store);
  const show: HostedShow = {
    id, ownerId, feedUrl, title: s.title, description: s.description ?? '', author: s.author ?? '', language: s.language ?? 'zh', category: s.category ?? 'Society & Culture',
    explicit: s.explicit ?? false, coverUrl: s.coverUrl ?? drawnCover(publicBase, s.title), createdAt: now, updatedAt: now, priceTier: null,
  };
  const code = `hosted:${id}`;
  const t = tx(store)
    .put('main', showItem(show), { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('hostedFeed', K.hostedFeed(feedUrl), { showId: id, feedUrl }), { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('ownedHosted', K.ownedHosted(ownerId, id), { showId: id, feedUrl, createdAt: now }))
    .put('main', claimItem({ id, listenerId: ownerId, feedUrl, code, status: 'proven', provenAt: now, createdAt: now }), { condition: 'attribute_not_exists(PK)' });
  claimUnique(t, K.U.claimCode(code), id);
  proveInTx(t, { id, listenerId: ownerId, feedUrl }, now, false);
  await t.commit();
  return show;
}

/** The show's item (live or not) behind a feed address. */
async function showItemByFeed(store: Store, feedUrl: string): Promise<Item | undefined> {
  const ptr = await get(store, 'main', K.hostedFeed(feedUrl));
  return ptr ? get(store, 'main', K.hostedShow(String(ptr['showId']))) : undefined;
}

export async function hostedByFeed(store: Store, _db: Db, feedUrl: string): Promise<HostedShow | undefined> {
  const it = await showItemByFeed(store, feedUrl);
  return it && !it['deletedAt'] ? toShow(it) : undefined;
}

export async function hostedById(store: Store, _db: Db, id: string): Promise<HostedShow | undefined> {
  if (!isUuid(id)) return undefined;
  const it = await get(store, 'main', K.hostedShow(id));
  return it && !it['deletedAt'] ? toShow(it) : undefined;
}

export async function updateHostedShow(store: Store, db: Db, id: string, s: Partial<ShowIn>): Promise<HostedShow> {
  const cur = await hostedById(store, db, id);
  if (!cur) throw new ApiError('not_found', 'No such show.');
  const n = { ...cur, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) } as HostedShow;
  if (!n.coverUrl || isAutoCover(n.coverUrl)) n.coverUrl = drawnCover(apiBase(cur.feedUrl), n.title);
  const next: HostedShow = { ...n, updatedAt: nowIso(store) };
  await tx(store).put('main', showItem(next), { condition: 'attribute_exists(PK) AND attribute_not_exists(#d)', names: { '#d': 'deletedAt' } }).commit()
    .catch((e: unknown) => { if (isConditionFailed(e)) throw new ApiError('not_found', 'No such show.'); throw e; });
  // Keep the app's episode rows' show title (and cover, when there is one) in step — lane LB's repo writes each.
  for (const ep of await showEpisodes(store, cur.feedUrl)) {
    const r = episodeRow(ep);
    await upsertEpisode(db, { id: r.id, feedUrl: r.feed_url, guid: r.guid, title: r.title, enclosureUrl: r.enclosure_url, showTitle: next.title, ...(next.coverUrl ? { imageUrl: next.coverUrl } : {}) });
  }
  return next;
}

export async function setPriceTier(store: Store, _db: Db, showId: string, tier: number | null): Promise<void> {
  const it = await get(store, 'main', K.hostedShow(showId));
  if (!it) return;
  const next = { ...toShow(it), priceTier: tier, updatedAt: nowIso(store) };
  await tx(store).put('main', showItem({ ...next, deletedAt: str(it['deletedAt']) })).commit();
}

export async function markHostedShowDeleted(store: Store, _db: Db, showId: string): Promise<void> {
  const it = await get(store, 'main', K.hostedShow(showId));
  if (!it || it['deletedAt']) return;
  const at = nowIso(store);
  const s = toShow(it);
  await tx(store).put('main', showItem({ ...s, deletedAt: at })).commit();
}

/** /mod take-down: marks a live Studio-made show deleted; its feed address, or no row when it was already gone. */
export async function markHostedShowDeletedRows(store: Store, db: Db, showId: string): Promise<{ feed_url: string }[]> {
  if (!isUuid(showId)) return [];
  const it = await get(store, 'main', K.hostedShow(showId));
  if (!it || it['deletedAt']) return [];
  await markHostedShowDeleted(store, db, showId);
  return [{ feed_url: String(it['feedUrl']) }];
}

export async function hostedShowDeletedRows(store: Store, _db: Db, showId: string): Promise<{ deleted: boolean }[]> {
  if (!isUuid(showId)) return [];
  const it = await get(store, 'main', K.hostedShow(showId));
  return it ? [{ deleted: Boolean(it['deletedAt']) }] : [];
}

export async function ownedShowCountRows(store: Store, _db: Db, ownerId: string): Promise<{ n: number }[]> {
  const ptrs = await partition(store, 'main', K.L(ownerId), { prefix: K.ST_SK.hosted });
  const shows = await getMany(store, 'main', ptrs.map((p) => K.hostedShow(String(p['showId']))));
  return [{ n: shows.filter((s) => !s['deletedAt']).length }];
}

/** Live Studio-made shows, newest change first (G4 `Q#hosted`; the /mod list and the dashboard). */
export async function liveHostedShows(store: Store, limit?: number): Promise<HostedShow[]> {
  const items = await queue(store, 'hosted', { newestFirst: true, ...(limit !== undefined ? { max: limit } : {}) });
  return (await getMany(store, 'main', items.map(keyOf))).filter((s) => !s['deletedAt']).map(toShow);
}

/** A listener's live Studio-made shows, newest first. */
export async function hostedShowsOf(store: Store, ownerId: string): Promise<HostedShow[]> {
  const ptrs = await partition(store, 'main', K.L(ownerId), { prefix: K.ST_SK.hosted });
  return (await getMany(store, 'main', ptrs.map((p) => K.hostedShow(String(p['showId'])))))
    .filter((s) => !s['deletedAt']).map(toShow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- episodes ----

async function episodeItems(store: Store, showId: string): Promise<Item[]> {
  return partition(store, 'main', `HS#${showId}`, { prefix: 'E#' });
}

export async function listHostedEpisodes(store: Store, _db: Db, showId: string, opts: { liveOnly?: boolean; freeOnly?: boolean; paidOnly?: boolean } = {}): Promise<HostedEpisode[]> {
  if (!isUuid(showId)) return [];
  const now = nowMs(store);
  return (await episodeItems(store, showId))
    .filter((e) => !e['deletedAt'])
    .filter((e) => !opts.liveOnly || (e['status'] === 'published' && Date.parse(String(e['publishedAt'])) <= now))
    .filter((e) => !opts.freeOnly || e['paid'] !== true)
    .filter((e) => !opts.paidOnly || e['paid'] === true)
    .sort((a, b) => String(b['publishedAt']).localeCompare(String(a['publishedAt'])))
    .map((e) => toEp(e, now));
}

/**
 * The hosted episode goes live: ONE transaction marks it promoted and creates the app's episode (lane LB's item shape)
 * — the conditions make a second promotion of the same episode a no-op (guard G-M26-ST1). Returns true when THIS call
 * promoted it. An app episode that already exists (a listener's phone registered it first) is left as it is.
 */
export async function promoteHostedEpisode(store: Store, db: Db, show: { id: string; feedUrl: string; title: string; coverUrl: string | null }, e: Item): Promise<boolean> {
  const now = nowMs(store);
  if (!waiting(e) || Date.parse(String(e['publishedAt'])) > now) return false;
  const at = new Date(now).toISOString();
  const episodeId = String(e['episodeId']);
  const exists = await get(store, 'main', K.episode(episodeId));
  const t = tx(store).update('main', keyOf(e), {
    update: 'SET #p = :at REMOVE G4PK, G4SK',
    condition: 'attribute_exists(PK) AND attribute_not_exists(#p) AND attribute_not_exists(#d) AND #s = :pub AND #paid = :no AND #pa <= :now',
    names: { '#p': 'promotedAt', '#d': 'deletedAt', '#s': 'status', '#paid': 'paid', '#pa': 'publishedAt' },
    values: { ':at': at, ':pub': 'published', ':no': false, ':now': at }, label: 'promote',
  });
  const image = str(e['coverUrl']) ?? show.coverUrl;
  const duration = e['durationMs'] === null || e['durationMs'] === undefined ? null : Number(e['durationMs']);
  const publishedAt = new Date(String(e['publishedAt'])).toISOString();
  if (!exists) {
    const attrs: Record<string, unknown> = {
      id: episodeId, feedUrl: show.feedUrl, feedKey: K.feedKey(show.feedUrl), guid: String(e['guid']), title: String(e['title']), showTitle: show.title,
      enclosureUrl: String(e['audioUrl']), mediaKind: 'audio', publishedAt, firstSeenAt: at, updatedAt: at, v: 1,
      ...(image ? { imageUrl: image } : {}), ...(duration !== null ? { durationMs: duration } : {}),
    };
    t.put('main', encode('episode', K.episode(episodeId), attrs, { gsi: K.G2eps(show.feedUrl, publishedAt, episodeId) }), { condition: 'attribute_not_exists(PK)', label: 'episode' });
    claimUnique(t, K.U.guid(show.feedUrl, String(e['guid'])), episodeId);
    if (duration !== null) enqueue(t, store, { kind: HEAT_PLACE, payload: { episodeId } });
  }
  try {
    await t.commit();
  } catch (err) {
    if (err instanceof TxCancelled && (err.failed('promote') || err.failed('episode') || err.failed('unique:GUID'))) return false;
    throw err;
  }
  const row = (await getEpisode(db, episodeId))!;
  if (!exists) {
    await touchShow(store, row);
  }
  return true;
}

/** M14 US4: every episode of the show that is due goes live (read paths call this; the timer calls `promoteScheduled`). */
export async function promoteDue(store: Store, db: Db, show: HostedShow): Promise<void> {
  const now = nowMs(store);
  for (const e of await episodeItems(store, show.id)) {
    if (waiting(e) && Date.parse(String(e['publishedAt'])) <= now) await promoteHostedEpisode(store, db, show, e);
  }
}

/** The timer: every waiting episode whose time has come (G4 `Q#scheduled`), whichever show. Returns how many went live. */
export async function promoteScheduled(store: Store, db: Db): Promise<number> {
  const due = await queue(store, 'scheduled', { to: `${new Date(nowMs(store)).toISOString()}~` });
  let n = 0;
  for (const q of due) {
    const e = await get(store, 'main', keyOf(q));
    if (!e) continue;
    const s = await get(store, 'main', K.hostedShow(String(e['showId'])));
    if (!s || s['deletedAt']) continue;
    if (await promoteHostedEpisode(store, db, toShow(s), e)) n++;
  }
  return n;
}

export async function storedBytes(store: Store, _db: Db): Promise<number> {
  return Number((await get(store, 'main', K.config('bytes')))?.[BYTES] ?? 0);
}

export async function publishEpisode(store: Store, db: Db, show: HostedShow, by: string, e: {
  title: string; description: string; audioUrl: string; audioBytes: number; audioType: string; durationMs: number | null;
  status?: 'draft' | 'published'; publishAt?: string | null; coverUrl?: string | null;
}): Promise<HostedEpisode> {
  const id = randomUUID();
  const guid = randomUUID();
  const now = nowIso(store);
  const item = epItem({
    id, showId: show.id, guid, episodeId: fnv1a64(show.feedUrl + '\u0001' + guid), title: e.title, description: e.description, audioUrl: e.audioUrl,
    audioBytes: e.audioBytes, audioType: e.audioType, durationMs: e.durationMs, createdBy: by, status: e.status ?? 'published',
    publishedAt: e.publishAt ? new Date(e.publishAt).toISOString() : now, coverUrl: e.coverUrl ?? null, paid: false, createdAt: now,
  });
  const t = tx(store)
    .put('main', item, { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('hostedEpisodeRef', K.hostedEpisodeRef(id), { id, showId: show.id }), { condition: 'attribute_not_exists(PK)' });
  bytesStep(t, e.audioBytes);
  await t.commit();
  await promoteDue(store, db, show);
  const after = await get(store, 'main', keyOf(item));
  return toEp(after ?? item, nowMs(store));
}

async function liveEp(store: Store, showId: string, id: string): Promise<Item | undefined> {
  if (!isUuid(id) || !isUuid(showId)) return undefined;
  const e = await get(store, 'main', K.hostedEpisode(showId, id));
  return e && !e['deletedAt'] ? e : undefined;
}

/** Writes the whole episode item again (its queue key follows its state), unless it was deleted meanwhile. */
async function rewrite(store: Store, e: Record<string, unknown>): Promise<Item> {
  const item = epItem(e);
  await tx(store).put('main', item, { condition: 'attribute_exists(PK) AND attribute_not_exists(#d)', names: { '#d': 'deletedAt' }, label: 'episode' }).commit()
    .catch((err: unknown) => { if (isConditionFailed(err)) throw new ApiError('not_found', 'No such episode.'); throw err; });
  return item;
}

export async function updateEpisode(store: Store, db: Db, show: HostedShow, id: string, e: { title?: string; description?: string; status?: 'draft' | 'published'; publishAt?: string | null; coverUrl?: string | null }): Promise<HostedEpisode> {
  const cur = await liveEp(store, show.id, id);
  if (!cur) throw new ApiError('not_found', 'No such episode.');
  const next: Record<string, unknown> = { ...cur };
  if (e.title !== undefined && e.title !== null) next['title'] = e.title;
  if (e.description !== undefined && e.description !== null) next['description'] = e.description;
  if (e.status !== undefined && e.status !== null) next['status'] = e.status;
  if ('publishAt' in e || e.status === 'published') next['publishedAt'] = e.publishAt ? new Date(e.publishAt).toISOString() : nowIso(store);
  if ('coverUrl' in e) next['coverUrl'] = e.coverUrl ?? null;
  const r = await rewrite(store, next);
  // A live episode's title (and its own cover) follow into the app's row — lane LB's repo.
  const app = await getEpisode(db, String(r['episodeId']));
  if (app) await upsertEpisode(db, { id: app.id, feedUrl: app.feed_url, guid: app.guid, title: String(r['title']), enclosureUrl: app.enclosure_url, ...(r['coverUrl'] ? { imageUrl: String(r['coverUrl']) } : {}) });
  await promoteDue(store, db, show);
  return toEp((await get(store, 'main', keyOf(r))) ?? r, nowMs(store));
}

export async function removeEpisode(store: Store, _db: Db, showId: string, id: string): Promise<HostedEpisode | undefined> {
  const cur = await liveEp(store, showId, id);
  if (!cur) return undefined;
  const at = nowIso(store);
  const t = tx(store).update('main', keyOf(cur), {
    update: 'SET #d = :at REMOVE G4PK, G4SK', condition: 'attribute_exists(PK) AND attribute_not_exists(#d)', names: { '#d': 'deletedAt' }, values: { ':at': at }, label: 'episode',
  });
  bytesStep(t, -Number(cur['audioBytes'] ?? 0));
  try { await t.commit(); } catch (e) { if (e instanceof TxCancelled && e.failed('episode')) return undefined; throw e; }
  return toEp({ ...cur, deletedAt: at }, nowMs(store));
}

export async function markHostedEpisodesDeleted(store: Store, db: Db, showId: string): Promise<void> {
  for (const e of await episodeItems(store, showId)) if (!e['deletedAt']) await removeEpisode(store, db, showId, String(e['id']));
}

export async function paidEpisodeRows(store: Store, _db: Db, showId: string): Promise<Record<string, unknown>[]> {
  return (await episodeItems(store, showId)).filter((e) => e['paid'] === true && !e['deletedAt']).map(() => ({ '?column?': 1 }));
}

export async function setEpisodePaid(store: Store, db: Db, show: HostedShow, id: string, paid: boolean): Promise<HostedEpisode> {
  const cur = await liveEp(store, show.id, id);
  if (!cur) throw new ApiError('not_found', 'No such episode.');
  if (paid && (cur['createdAt'] === null || cur['createdAt'] === undefined)) throw new ApiError('validation', 'Episodes that were free before paid episodes existed stay free.', { fields: ['paid'], reason: 'was_free' });
  const live = cur['status'] === 'published' && Date.parse(String(cur['publishedAt'])) <= nowMs(store);
  if (paid && cur['paid'] !== true && live) throw new ApiError('validation', 'A published episode stays free. Make an episode paid while it is a draft or scheduled.', { fields: ['paid'], reason: 'live' });
  if (paid && show.priceTier === null) throw new ApiError('validation', 'Set the show\'s price first.', { fields: ['paid'], reason: 'no_price' });
  const r = await rewrite(store, { ...cur, paid, ...(paid ? {} : { previewStartMs: null, previewEndMs: null }) });
  if (!paid) await promoteDue(store, db, show);
  return toEp((await get(store, 'main', keyOf(r))) ?? r, nowMs(store));
}

export async function setPreview(store: Store, _db: Db, show: HostedShow, id: string, range: { startMs: number; endMs: number } | null): Promise<HostedEpisode> {
  const cur = await liveEp(store, show.id, id);
  if (!cur) throw new ApiError('not_found', 'No such episode.');
  if (range && cur['paid'] !== true) throw new ApiError('validation', 'Only a paid episode has a free preview.', { fields: ['startMs'], reason: 'not_paid' });
  if (range && (range.endMs <= range.startMs || range.endMs - range.startMs > PREVIEW_MAX_MS)) throw new ApiError('validation', 'A preview is up to 10 minutes long, and ends after it starts.', { fields: ['endMs'] });
  if (range && cur['durationMs'] !== null && cur['durationMs'] !== undefined && range.endMs > Number(cur['durationMs'])) throw new ApiError('validation', 'The preview ends after the episode does.', { fields: ['endMs'] });
  const r = await rewrite(store, { ...cur, previewStartMs: range?.startMs ?? null, previewEndMs: range?.endMs ?? null });
  return toEp(r, nowMs(store));
}

// ---- paid episodes (routes/creators/paid.ts) ----

async function epById(store: Store, id: string): Promise<{ e: Item; s: Item } | undefined> {
  if (!isUuid(id)) return undefined;
  const ref = await get(store, 'main', K.hostedEpisodeRef(id));
  if (!ref) return undefined;
  const [e, s] = await Promise.all([get(store, 'main', K.hostedEpisode(String(ref['showId']), id)), get(store, 'main', K.hostedShow(String(ref['showId'])))]);
  return e && s ? { e, s } : undefined;
}
const paidLive = (x: { e: Item; s: Item } | undefined, now: number): x is { e: Item; s: Item } =>
  x !== undefined && x.e['paid'] === true && !x.e['deletedAt'] && !x.s['deletedAt'] && x.e['status'] === 'published' && Date.parse(String(x.e['publishedAt'])) <= now;

/** One row when the listener owns the show (lane PD's show entitlement). */
export async function showEntitlementRows(store: Store, _db: Db, listenerId: string, feedUrl: string): Promise<Record<string, unknown>[]> {
  return (await get(store, 'main', K.entitlement(listenerId, 'show', feedUrl))) ? [{ '?column?': 1 }] : [];
}

export async function paidEpisodeFeedRows(store: Store, _db: Db, id: string): Promise<{ feed_url: string }[]> {
  const x = await epById(store, id);
  return paidLive(x, nowMs(store)) ? [{ feed_url: String(x.s['feedUrl']) }] : [];
}

export async function paidEpisodePreviewRows(store: Store, _db: Db, id: string): Promise<{ preview_start_ms: number | null; preview_end_ms: number | null }[]> {
  const x = await epById(store, id);
  if (!paidLive(x, nowMs(store))) return [];
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return [{ preview_start_ms: n(x.e['previewStartMs']), preview_end_ms: n(x.e['previewEndMs']) }];
}

export async function paidEpisodeAudioRows(store: Store, _db: Db, id: string): Promise<{ audio_url: string }[]> {
  const x = await epById(store, id);
  return x && x.e['paid'] === true && !x.e['deletedAt'] ? [{ audio_url: String(x.e['audioUrl']) }] : [];
}

export async function paidEpisodePreviewAudioRows(store: Store, _db: Db, id: string): Promise<{ audio_url: string; audio_bytes: number; audio_type: string; duration_ms: number | null; preview_start_ms: number | null; preview_end_ms: number | null }[]> {
  const x = await epById(store, id);
  if (!paidLive(x, nowMs(store))) return [];
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return [{ audio_url: String(x.e['audioUrl']), audio_bytes: Number(x.e['audioBytes']), audio_type: String(x.e['audioType']), duration_ms: n(x.e['durationMs']), preview_start_ms: n(x.e['previewStartMs']), preview_end_ms: n(x.e['previewEndMs']) }];
}

/** Admin's redeem codes: one row when a live Studio-made show at this feed sells something. */
export async function paidHostedShowRows(store: Store, db: Db, feedUrl: string): Promise<Record<string, unknown>[]> {
  const s = await hostedByFeed(store, db, feedUrl);
  return s && s.priceTier !== null ? [{ '?column?': 1 }] : [];
}

/** Lane PD's redeem codes: a show's title — its override's, else its Studio-made show's (deleted or not, as the SQL's JOIN). */
export async function codeShowTitle(store: Store, _db: Db, feedUrl: string): Promise<string | null> {
  const [o, h] = await Promise.all([get(store, 'main', K.showSingleton(feedUrl, 'OVERRIDE')), showItemByFeed(store, feedUrl)]);
  return str(o?.['title']) ?? str(h?.['title']);
}

/** Lane PD's admin page: the paid shows a code can give (a live Studio-made show with a price), by title, ≤ 200. */
export async function paidShows(store: Store, _db: Db): Promise<{ feedUrl: string; title: string }[]> {
  const shows = (await liveHostedShows(store)).filter((s) => s.priceTier !== null);
  const overrides = new Map((await getMany(store, 'main', shows.map((s) => K.showSingleton(s.feedUrl, 'OVERRIDE')))).map((o) => [String(o['feedUrl']), o]));
  return shows.map((s) => ({ feedUrl: s.feedUrl, title: str(overrides.get(s.feedUrl)?.['title']) ?? s.title }))
    .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0)).slice(0, 200);
}

export { toShow };
