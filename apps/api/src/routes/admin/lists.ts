// Admin routes for every list's pins and hides, the category page's default chip, and hiding a show or episode everywhere.
/**
 * M25 lane AL (specs/026-m25-control-security-release) — owner only, behind `adminOnly`.
 *
 * A1/A2/A4 — one pin/hide table for every list (db/repos/discover/lists.ts):
 *   GET    /lists                       → { lists: ListInfo[], categories: { genreId, name, listId }[] }
 *   GET    /lists/:listId               → { list, overrides, live: LiveRow[], liveError?, defaultTab? }
 *   POST   /lists/:listId               { kind, feedUrl?, guid?, commentId?, position?, startsAt?, endsAt?, note? } → { override }
 *   DELETE /lists/:listId/:id           → { ok }
 *   PUT    /lists/:listId/default-tab   { tab: 'forYou'|'all'|'newest'|null } (category lists only) → { defaultTab }
 * `live` is the list as a listener is served it now (the same functions the public routes call).
 *
 * A3 — hide any show or episode from listeners everywhere, no report needed, with a reason:
 *   GET    /hidden                      → { shows: HiddenShow[], episodes: HiddenEpisode[] }
 *   POST   /hidden/show                 { feedUrl, reason } — through `/mod`'s own `act('hide_show')` (G-U1), so every read path honours it
 *   DELETE /hidden/show?feedUrl=        — `act('unhide_show')`
 *   POST   /hidden/episode              { feedUrl, guid, reason } — a row in `hidden_episodes` (read by every list since M24 US11)
 *   DELETE /hidden/episode?feedUrl=&guid=
 * Every write is recorded in `admin_audit` (area `discover` for lists, `safety` for hides). All of
 * it is applied at serve time, after every cache, so nothing cached needs dropping.
 */
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { adminWrite, auditCtx, insertAudit, type AdminEnv } from '../../auth/admin.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { GENRE_LIST } from '../../catalog/genres.ts';
import { act } from '../../db/repos/safety/moderation.ts';
import { discoverBody } from '../../db/repos/discover/discover.ts';
import { chart, hunt, plaza } from '../../db/repos/discover/explore.ts';
import {
  active, activeFor, categoryListId, DEFAULT_TABS, defaultTab, deleteOverride, LISTS, listInfo, listOverrides, names, putOverride, setDefaultTab,
  type Active, type ItemRef, type Override,
} from '../../db/repos/discover/lists.ts';
import { discoverLists, DISCOVER_LIST_IDS, servedArrivals, servedCategory, servedSaid, servedVideo } from '../../db/repos/discover/served.ts';
import { feedUrl } from './common.ts';
import { hiddenEpisodeReason, hiddenEpisodeRows, hiddenFeedRow, hiddenShowRows, hideEpisodeWithReason, setHiddenFeedReason, unhideEpisode } from '../../db/repos/admin/admin-lists.ts';

export type LiveRow = ItemRef & { title: string; sub: string; pinned: boolean };
const LIVE_MAX = 30;

const iso = z.string().trim().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'not a date');
const reason = z.string().trim().min(1).max(500);

export function registerLists(admin: Hono<AdminEnv>): void {
  const listParam = (raw: string): string => {
    if (!listInfo(raw)) throw new ApiError('not_found', 'No such list.');
    return raw;
  };

  admin.get('/lists', (c) => c.json({
    lists: LISTS,
    categories: GENRE_LIST.map((g) => ({ ...g, listId: categoryListId(g.genreId) })),
  }));

  admin.get('/lists/:listId', async (c) => {
    const listId = listParam(c.req.param('listId'));
    const db = c.get('db');
    const [overrides, tab] = await Promise.all([listOverrides(db, listId), listId.startsWith('category:') ? defaultTab(db, listId) : Promise.resolve(undefined)]);
    let live: LiveRow[] = [];
    let liveError: string | undefined;
    try { live = await liveRows(c, listId); } catch (e) { liveError = e instanceof Error ? e.message : String(e); }
    return c.json({ list: listInfo(listId), overrides, live, ...(liveError ? { liveError } : {}), ...(listId.startsWith('category:') ? { defaultTab: tab ?? null } : {}) });
  });

  admin.post('/lists/:listId', json(z.object({
    kind: z.enum(['pin', 'hide']),
    feedUrl: feedUrl.optional(),
    guid: z.string().trim().min(1).max(1024).optional(),
    commentId: z.string().uuid().optional(),
    position: z.number().int().min(1).max(200).nullable().optional(),
    startsAt: iso.nullable().optional(),
    endsAt: iso.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })), async (c) => {
    const listId = listParam(c.req.param('listId'));
    const b = c.req.valid('json');
    const db = c.get('db');
    const me = c.get('listener')!.id;
    const override = await adminWrite(db, auditCtx(c), { area: 'discover', action: `list ${b.kind}`, target: listId },
      async (tx) => ({ overrides: await listOverrides(tx, listId) }),
      async (tx) => putOverride(tx, listId, {
        kind: b.kind, ...(b.feedUrl ? { feedUrl: b.feedUrl } : {}), ...(b.guid ? { guid: b.guid } : {}), ...(b.commentId ? { commentId: b.commentId } : {}),
        position: b.position ?? null, startsAt: b.startsAt ? new Date(b.startsAt).toISOString() : null, endsAt: b.endsAt ? new Date(b.endsAt).toISOString() : null, note: b.note || null,
      }, me));
    return c.json({ override });
  });

  admin.delete('/lists/:listId/:id', async (c) => {
    const listId = listParam(c.req.param('listId'));
    const id = c.req.param('id');
    const db = c.get('db');
    const ok = await adminWrite(db, auditCtx(c), { area: 'discover', action: 'list remove', target: `${listId}#${id}` },
      async (tx) => ({ overrides: await listOverrides(tx, listId) }), (tx) => deleteOverride(tx, listId, id));
    if (!ok) throw new ApiError('not_found', 'No such row on this list.');
    return c.json({ ok: true });
  });

  admin.put('/lists/:listId/default-tab', json(z.object({ tab: z.enum(DEFAULT_TABS).nullable() })), async (c) => {
    const listId = listParam(c.req.param('listId'));
    if (!listId.startsWith('category:')) throw new ApiError('validation', 'Only a category page has a default chip.', { fields: ['tab'] });
    const tab = c.req.valid('json').tab;
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'discover', action: 'default chip', target: listId },
      async (tx) => ({ defaultTab: (await defaultTab(tx, listId)) ?? null }), (tx) => setDefaultTab(tx, listId, tab));
    return c.json({ defaultTab: tab });
  });

  // ---- A3: hide a show or an episode everywhere ----

  async function hiddenNow(db: AdminEnv['Variables']['db']) {
    const shows = await hiddenShowRows(db);
    const episodes = await hiddenEpisodeRows(db);
    return {
      shows: shows.map((s) => ({ feedUrl: s.feed_url, title: s.title, reason: s.reason, hiddenAt: new Date(s.hidden_at).toISOString(), byReport: Boolean(s.by_report) })),
      episodes: episodes.map((e) => ({ feedUrl: e.feed_url, guid: e.guid, title: e.title, showTitle: e.show_title, reason: e.reason, hiddenAt: new Date(e.hidden_at).toISOString() })),
    };
  }

  admin.get('/hidden', async (c) => c.json(await hiddenNow(c.get('db'))));

  /** `act()` runs its own transaction (as users.ts), so the record is written right after it. */
  async function showAct(c: Context<AdminEnv, any, any>, url: string, action: 'hide_show' | 'unhide_show', why: string | null) {
    const db = c.get('db');
    const read = async () => {
      const [r] = await hiddenFeedRow(db, url);
      return { hidden: Boolean(r), reason: r?.reason ?? null };
    };
    const before = await read();
    const a = await act(db, c.get('listener')!.id, { kind: 'show', id: url }, action);
    if (action === 'hide_show' && why !== null) await setHiddenFeedReason(db, url, why);
    await insertAudit(db, auditCtx(c), { area: 'safety', action: action === 'hide_show' ? 'hide show' : 'show again', target: `show:${url}` }, before, { ...(await read()), moderationActionId: a.id });
  }

  admin.post('/hidden/show', json(z.object({ feedUrl, reason })), async (c) => {
    const b = c.req.valid('json');
    await showAct(c, b.feedUrl, 'hide_show', b.reason);
    return c.json(await hiddenNow(c.get('db')));
  });

  admin.delete('/hidden/show', async (c) => {
    const url = feedUrl.safeParse(c.req.query('feedUrl'));
    if (!url.success) throw new ApiError('validation', 'feedUrl must be a feed address.', { fields: ['feedUrl'] });
    await showAct(c, url.data, 'unhide_show', null);
    return c.json(await hiddenNow(c.get('db')));
  });

  // Reads through the transaction it is given: a read on the outer handle inside adminWrite would
  // wait for the transaction itself (PGlite has one connection) — a hang, seen in gate 37728987239.
  const epRead = (url: string, g: string) => async (tx: AdminEnv['Variables']['db']) => {
    const [r] = await hiddenEpisodeReason(tx, url, g);
    return { hidden: Boolean(r), reason: r?.reason ?? null };
  };

  admin.post('/hidden/episode', json(z.object({ feedUrl, guid: z.string().trim().min(1).max(1024), reason })), async (c) => {
    const b = c.req.valid('json');
    const db = c.get('db');
    const me = c.get('listener')!.id;
    await adminWrite(db, auditCtx(c), { area: 'safety', action: 'hide episode', target: `episode:${b.feedUrl}#${b.guid}` }, epRead(b.feedUrl, b.guid), (tx) => hideEpisodeWithReason(tx, b.feedUrl, b.guid, me, b.reason));
    return c.json(await hiddenNow(db));
  });

  admin.delete('/hidden/episode', async (c) => {
    const url = feedUrl.safeParse(c.req.query('feedUrl'));
    const g = (c.req.query('guid') ?? '').trim();
    if (!url.success || g.length === 0 || g.length > 1024) throw new ApiError('validation', 'feedUrl and guid are needed.', { fields: ['feedUrl', 'guid'] });
    const db = c.get('db');
    await adminWrite(db, auditCtx(c), { area: 'safety', action: 'show episode again', target: `episode:${url.data}#${g}` }, epRead(url.data, g),
      (tx) => unhideEpisode(tx, url.data, g));
    return c.json(await hiddenNow(db));
  });
}

/** The list as a listener is served it now, top LIVE_MAX rows, pinned rows marked. */
async function liveRows(c: Context<AdminEnv, any, any>, listId: string): Promise<LiveRow[]> {
  const db = c.get('db');
  const cat = c.get('catalog');
  const ov: Active = await active(db, listId);
  const pinned = (r: ItemRef) => ov.pins.some((p: Override) => names(p, r));
  const ep = (e: { feedUrl: string; guid: string; title: string; showTitle: string }): LiveRow => ({ feedUrl: e.feedUrl, guid: e.guid, title: e.title, sub: e.showTitle, pinned: pinned({ feedUrl: e.feedUrl, guid: e.guid }) });
  const show = (s: { feedUrl: string; title: string; author?: string }): LiveRow => ({ feedUrl: s.feedUrl, title: s.title, sub: s.author ?? '', pinned: pinned({ feedUrl: s.feedUrl }) });
  let rows: LiveRow[] = [];
  if (listId === 'trending' || listId === 'talked' || listId === 'new' || listId === 'popular' || listId === 'premium') {
    const { body } = await discoverBody(db, cat.fetch, cat.picks, cat.today());
    const l = await discoverLists(db, body, await activeFor(db, DISCOVER_LIST_IDS));
    rows = listId === 'trending' ? l.trending.map((i) => ep(i.episode))
      : listId === 'talked' ? l.talkedAbout.map((i) => ep(i.episode))
      : listId === 'new' ? (l.newShows ?? []).map((n) => ({ ...show(n.show), sub: n.episode.title }))
      : listId === 'popular' ? (l.shows ?? []).map(show)
      : (l.premium ?? []).map(show);
  } else if (listId === 'rising') {
    rows = (await chart(db, 'rising', LIVE_MAX, Date.now, ov)).items.map((i) => ep(i.episode));
  } else if (listId === 'video') {
    rows = (await servedVideo(db, ov)).map((i) => ep(i.episode));
  } else if (listId === 'arrivals') {
    rows = (await servedArrivals(db, ov)).map((n) => ({ ...show(n.show), sub: n.episode.title }));
  } else if (listId === 'said') {
    rows = (await servedSaid(db, ov)).map((s) => ({ commentId: s.commentId, title: s.body.slice(0, 140), sub: `${s.episode.showTitle} · ${s.episode.title}`, pinned: pinned({ commentId: s.commentId }) }));
  } else if (listId === 'hunt') {
    rows = (await hunt(db, undefined, cat.today(), 0, ov)).map((e) => ep(e));
  } else if (listId === 'plaza') {
    rows = (await plaza(db, `admin|${cat.today()}`, 0, ov)).items.map((s) => show({ feedUrl: s.feedUrl, title: s.title }));
  } else if (listId.startsWith('category:')) {
    rows = (await servedCategory(db, cat.fetch, Number(listId.slice('category:'.length)), 0)).shows.map(show);
  }
  return rows.slice(0, LIVE_MAX);
}
