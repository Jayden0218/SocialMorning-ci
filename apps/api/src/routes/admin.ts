/**
 * M15 — `/v1/admin/*` (specs/015-m15-admin/contracts/admin-api.md). Owner-only.
 *
 * The first line below puts EVERY route behind `adminOnly` (Studio session + `admins` + session
 * created < 12 h ago; guard G-A1 enumerates the registered routes to prove it). Every write goes
 * through `adminWrite` — read before, write, read after, one `admin_audit` row, one transaction
 * (G-A2) — except moderation, which goes through `/mod`'s own `act()` (G-U1) and records after it.
 */
import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import { actionsFor, groupReports, RETENTION_DAYS, type Action, type TargetKind } from '@socialmorning/social-core';
import { ACT_AS_COOKIE, adminOnly, adminWrite, auditCtx, insertAudit, startActing, stopActing, type AdminEnv } from '../auth/admin.ts';
import { STUDIO_IDLE_MS } from '../auth/studio-session.ts';
import { hashPassword } from '../auth/password.ts';
import { ApiError } from '../errors.ts';
import { json } from '../validate.ts';
import { isArea, listAudit } from '../db/repos/admin-audit.ts';
import { adminPickDays, checkPickItems, getPickDay, pickWarning, putPickDay, type PickItemRow } from '../db/repos/admin-picks.ts';
import {
  checkCollection, checkIssue, getIssueRow, listCollectionRows, listIssueRows, putCollection, putIssue, retireCollection, retireIssue,
} from '../db/repos/admin-curated.ts';
import { dropCatalogMemo } from '../catalog/live.ts';
import { discoverBody, dropDiscoverCache } from '../db/repos/discover.ts';
import { episodeFor } from './issues.ts';
import { getDiscoverSettings, getFeatures, MAX_FEATURES, MAX_PINS, putDiscoverSettings, putFeatures, SECTION_IDS } from '../db/repos/discover-settings.ts';
import { genreName } from '../catalog/genres.ts';
import { createPromotion, getPromotion, launchBytes, listPromotions, updatePromotion, type PromotionInput } from '../db/repos/promotions.ts';
import { LAUNCH_CEILING_BYTES, LAUNCH_IMAGE_TYPES, MAX_LAUNCH_IMAGE_BYTES, launchPathname, launchUploadToken, type EpisodeStorage } from '../storage/episodes-blob.ts';
import { accountsByIds, createAccounts, emailTaken, MAX_BULK, madeAccounts, updateAccount } from '../db/repos/admin-accounts.ts';
import { listCurators, setCurator } from '../db/repos/curators.ts';
import { act, recentActions } from '../db/repos/moderation.ts';
import { closedReports, openReports, type QueueRow } from '../db/repos/reports.ts';
import { cached } from '../db/repos/cache.ts';
import { computeMetrics, METRIC_RANGES, type MetricRange } from '../db/repos/metrics.ts';
import type { Db } from '../db/db.ts';

export const admin = new Hono<AdminEnv>();

// G-A1: every route registered on this router is behind this line. Nothing may be registered above it.
admin.use('*', adminOnly);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d: string | undefined): d is string => d !== undefined && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const dayParam = (d: string | undefined): string => {
  if (!validDay(d)) throw new ApiError('validation', 'The day must be YYYY-MM-DD.', { fields: ['day'] });
  return d;
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const feedUrl = z.string().trim().url().max(2048).regex(/^https?:\/\//);
const guid = z.string().trim().min(1).max(1024).optional();
const version = z.number().int().min(0);
const uuidParam = (v: string): string => {
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new ApiError('not_found', 'No such account.');
  return v;
};

/** After any picks/issues/collections save: the next Discover rebuilds from the tables (G-P1). */
async function catalogChanged(db: Db): Promise<void> {
  dropCatalogMemo(db);
  await dropDiscoverCache(db);
}

// ---- US1: the record (FR-005) ----

admin.get('/audit', async (c) => {
  const area = c.req.query('area') || undefined;
  const before = c.req.query('before') || undefined;
  if (area !== undefined && !isArea(area)) throw new ApiError('validation', 'Unknown area.', { fields: ['area'] });
  if (before !== undefined && !/^\d{1,18}$/.test(before)) throw new ApiError('validation', 'before must be a record id.', { fields: ['before'] });
  return c.json(await listAudit(c.get('db'), { ...(area ? { area } : {}), ...(before ? { before } : {}) }));
});

// ---- US2: picks (FR-006–FR-009, FR-011, FR-012) ----

admin.get('/picks', async (c) => {
  const today = c.get('catalog').today();
  const from = c.req.query('from') ?? `${today.slice(0, 7)}-01`;
  const to = c.req.query('to') ?? addDays(from, 41);
  if (!validDay(from) || !validDay(to) || to < from || addDays(from, 62) < to) throw new ApiError('validation', 'from/to must be YYYY-MM-DD, at most 62 days apart.', { fields: ['from', 'to'] });
  const adminDays = await adminPickDays(c.get('db'), from, to);
  const taken = new Set(adminDays.map((d) => d.day));
  const fileCounts = new Map<string, number>();
  for (const p of c.get('catalog').picks) {
    if (p.date < from || p.date > to || taken.has(p.date)) continue;
    fileCounts.set(p.date, Math.min(5, (fileCounts.get(p.date) ?? 0) + 1));
  }
  const days = [
    ...adminDays.map((d) => ({ day: d.day, count: d.count, source: 'admin' as const })),
    ...[...fileCounts].map(([day, count]) => ({ day, count, source: 'file' as const })),
  ].sort((a, b) => a.day.localeCompare(b.day));
  return c.json({ today, days });
});

admin.get('/picks/:day', async (c) => {
  const day = dayParam(c.req.param('day'));
  const db = c.get('db');
  const row = await getPickDay(db, day);
  // A day the tables do not have shows the file's picks for that date, to start from (version 0).
  const items: PickItemRow[] = row?.items ?? c.get('catalog').picks.filter((p) => p.date === day)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, 5).map((p) => ({ feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}), why: p.why }));
  const withEpisodes = [];
  for (const it of items) withEpisodes.push({ ...it, episode: await episodeFor(db, it.feedUrl, it.guid) });
  return c.json({ day, version: row?.version ?? 0, source: row ? 'admin' : items.length > 0 ? 'file' : 'none', items: withEpisodes });
});

const picksBody = z.object({
  version,
  items: z.array(z.object({ feedUrl, guid, why: z.string().trim().min(1).max(140) })).max(5),
});

admin.put('/picks/:day', json(picksBody), async (c) => {
  const day = dayParam(c.req.param('day'));
  const db = c.get('db');
  const b = c.req.valid('json');
  const clean = checkPickItems(day, b.items);
  const f = c.get('catalog').fetch;
  const items: PickItemRow[] = [];
  for (const it of clean) {
    const warning = await pickWarning(db, f, it.feedUrl, it.guid);
    items.push(warning ? { ...it, warning } : it);
  }
  const next = await adminWrite(db, auditCtx(c), { area: 'picks', action: items.length === 0 ? 'clear' : 'save', target: day },
    async (tx) => (await getPickDay(tx, day)) ?? null,
    (tx) => putPickDay(tx, day, b.version, items, c.get('listener')!.id));
  await catalogChanged(db);
  return c.json({ day, version: next, warnings: items.flatMap((i) => (i.warning ? [`${i.feedUrl}${i.guid ? ` ${i.guid}` : ''}: ${i.warning}`] : [])) });
});

admin.get('/preview/discover', async (c) => {
  const cat = c.get('catalog');
  const day = c.req.query('day') ?? cat.today();
  dayParam(day);
  const { body, stale } = await discoverBody(c.get('db'), cat.fetch, cat.picks, day);
  return c.json({ ...body, stale });
});

// ---- US2: issues (FR-010) ----

const issueBody = z.object({
  version,
  day: z.string().regex(DATE),
  title: z.string().trim().min(1).max(80),
  intro: z.string().trim().min(1).max(600),
  items: z.array(z.object({ feedUrl, guid, note: z.string().trim().min(1).max(280) })).max(30),
});

admin.get('/issues', async (c) => {
  const rows = await listIssueRows(c.get('db'));
  const ids = new Set(rows.map((r) => r.id));
  // The merged catalogue holds the file's issues that the tables do not override.
  const file = c.get('catalog').issues.filter((i) => !ids.has(i.id)).map((i) => ({
    id: i.id, day: i.date, title: i.title, intro: i.intro, items: i.items.map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note })),
    version: 0, retired: false, source: 'file' as const,
  }));
  return c.json({ items: [...rows.map((r) => ({ ...r, source: 'admin' as const })), ...file].sort((a, b) => b.day.localeCompare(a.day) || a.id.localeCompare(b.id)) });
});

admin.get('/issues/:id', async (c) => {
  const id = c.req.param('id');
  const row = await getIssueRow(c.get('db'), id);
  if (row) return c.json({ ...row, source: 'admin' });
  const f = c.get('catalog').issues.find((i) => i.id === id);
  if (!f) throw new ApiError('not_found', 'No such issue.');
  return c.json({ id, day: f.date, title: f.title, intro: f.intro, items: f.items.map((x) => ({ feedUrl: x.feedUrl, ...(x.guid ? { guid: x.guid } : {}), note: x.note })), version: 0, retired: false, source: 'file' });
});

admin.put('/issues/:id', json(issueBody), async (c) => {
  const id = c.req.param('id');
  const b = c.req.valid('json');
  const issue = checkIssue(id, b);
  const db = c.get('db');
  const next = await adminWrite(db, auditCtx(c), { area: 'issues', action: 'save', target: id },
    async (tx) => (await getIssueRow(tx, id)) ?? null, (tx) => putIssue(tx, id, b.version, issue));
  await catalogChanged(db);
  return c.json({ id, version: next });
});

admin.delete('/issues/:id', async (c) => {
  const id = c.req.param('id');
  const v = Number(c.req.query('version') ?? 'NaN');
  if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
  const db = c.get('db');
  const file = c.get('catalog').issues.find((i) => i.id === id);
  const next = await adminWrite(db, auditCtx(c), { area: 'issues', action: 'retire', target: id },
    async (tx) => (await getIssueRow(tx, id)) ?? null, (tx) => retireIssue(tx, id, v, file));
  await catalogChanged(db);
  return c.json({ id, version: next, retired: true });
});

// ---- US2: collections (FR-010) ----

const collectionBody = z.object({
  version,
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().min(1).max(120).optional(),
  position: z.number().int().min(0).max(100).default(0),
  items: z.array(z.object({ feedUrl, guid, why: z.string().trim().min(1).max(140).optional() })).min(1).max(10),
});

admin.get('/collections', async (c) => {
  const rows = await listCollectionRows(c.get('db'));
  const ids = new Set(rows.map((r) => r.id));
  const file = c.get('catalog').collections.filter((x) => !ids.has(x.id)).map((x, i) => ({ ...x, position: 100 + i, version: 0, retired: false, source: 'file' as const }));
  return c.json({ items: [...rows.map((r) => ({ ...r, source: 'admin' as const })), ...file] });
});

admin.put('/collections/:id', json(collectionBody), async (c) => {
  const id = c.req.param('id');
  const b = c.req.valid('json');
  const col = checkCollection(id, { title: b.title, ...(b.subtitle ? { subtitle: b.subtitle } : {}), position: b.position, items: b.items });
  const db = c.get('db');
  const read = async (tx: Db) => (await listCollectionRows(tx)).find((r) => r.id === id) ?? null;
  const next = await adminWrite(db, auditCtx(c), { area: 'collections', action: 'save', target: id }, read, (tx) => putCollection(tx, id, b.version, col, b.position));
  await catalogChanged(db);
  return c.json({ id, version: next });
});

admin.delete('/collections/:id', async (c) => {
  const id = c.req.param('id');
  const v = Number(c.req.query('version') ?? 'NaN');
  if (!Number.isInteger(v) || v < 0) throw new ApiError('validation', 'version is required.', { fields: ['version'] });
  const db = c.get('db');
  const file = c.get('catalog').collections.find((x) => x.id === id);
  const read = async (tx: Db) => (await listCollectionRows(tx)).find((r) => r.id === id) ?? null;
  const next = await adminWrite(db, auditCtx(c), { area: 'collections', action: 'retire', target: id }, read, (tx) => retireCollection(tx, id, v, file));
  await catalogChanged(db);
  return c.json({ id, version: next, retired: true });
});

// ---- US5: Discover control (FR-026–FR-029) ----

const ref = z.object({ feedUrl, guid });
const discoverBody_ = z.object({
  version,
  order: z.array(z.string().max(40)).max(20),
  hidden: z.array(z.string().max(40)).max(20),
  pins: z.array(ref).max(MAX_PINS),
  hides: z.array(z.object({ feedUrl, guid: z.string().trim().min(1).max(1024) })).max(200),
});

admin.get('/discover', async (c) => c.json({ sections: SECTION_IDS, ...(await getDiscoverSettings(c.get('db'))) }));

admin.put('/discover', json(discoverBody_), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  const pins = b.pins.map((p) => ({ feedUrl: p.feedUrl, ...(p.guid ? { guid: p.guid } : {}) }));
  const next = await adminWrite(db, auditCtx(c), { area: 'discover', action: 'save', target: 'discover' },
    (tx) => getDiscoverSettings(tx), (tx) => putDiscoverSettings(tx, { version: b.version, order: b.order, hidden: b.hidden, pins, hides: b.hides }));
  return c.json({ version: next });
});

const genreParam = (raw: string): number => {
  const g = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(g) || genreName(g) === undefined) throw new ApiError('not_found', 'No such category.');
  return g;
};

admin.get('/categories/:genreId/features', async (c) => {
  const g = genreParam(c.req.param('genreId'));
  return c.json({ genreId: g, shows: (await getFeatures(c.get('db'), g)).map((f) => ({ feedUrl: f })) });
});

admin.put('/categories/:genreId/features', json(z.object({ shows: z.array(z.object({ feedUrl })).max(MAX_FEATURES) })), async (c) => {
  const g = genreParam(c.req.param('genreId'));
  const shows = c.req.valid('json').shows.map((s) => s.feedUrl);
  await adminWrite(c.get('db'), auditCtx(c), { area: 'discover', action: 'features', target: `genre:${g}` },
    async (tx) => ({ shows: await getFeatures(tx, g) }), (tx) => putFeatures(tx, g, shows));
  return c.json({ genreId: g, shows: shows.map((f) => ({ feedUrl: f })) });
});

// ---- US3: the launch screen (FR-013–FR-017) ----

const mbs = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** G-L3: one image ≤ 1 MB, and every counted image together ≤ 50 MB. */
async function checkLaunchRoom(db: Db, size: number, exceptId?: string): Promise<void> {
  if (size > MAX_LAUNCH_IMAGE_BYTES) throw new ApiError('validation', 'The image is over 1 MB. Make it smaller and try again.', { fields: ['size'] });
  const used = await launchBytes(db, exceptId);
  if (used + size > LAUNCH_CEILING_BYTES) {
    throw new ApiError('storage_full', `Launch images are full: ${mbs(used)} of ${mbs(LAUNCH_CEILING_BYTES)} used. Retire a promotion first.`, { usedBytes: used, ceilingBytes: LAUNCH_CEILING_BYTES });
  }
}

admin.post('/launch/uploads', json(z.object({ contentType: z.string().max(100), size: z.number().int().positive() })), async (c) => {
  const b = c.req.valid('json');
  const storage = c.get('storage');
  if (!LAUNCH_IMAGE_TYPES.includes(b.contentType)) throw new ApiError('validation', 'Upload a JPEG, PNG or WebP image.', { fields: ['contentType'] });
  await checkLaunchRoom(c.get('db'), b.size);
  if (!storage.ready) throw new ApiError('unavailable', 'The image store is not connected yet.');
  const pathname = launchPathname(b.contentType, randomUUID())!;
  return c.json({ pathname, token: await launchUploadToken(storage, pathname, b.size, b.contentType) });
});

admin.get('/launch', async (c) => c.json({ items: await listPromotions(c.get('db')), usedBytes: await launchBytes(c.get('db')), ceilingBytes: LAUNCH_CEILING_BYTES, maxImageBytes: MAX_LAUNCH_IMAGE_BYTES }));

const target = z.string().trim().min(1).max(2048);
const launchFields = {
  targetKind: z.enum(['route', 'url']),
  target,
  label: z.string().trim().min(1).max(20).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  weight: z.number().int().min(1).max(100).optional(),
  dailyCap: z.number().int().min(1).max(5).optional(),
};

/** A `url` target must be https; a `route` is an in-app path (the phone opens Discover if it no longer exists). */
function checkTarget(kind: 'route' | 'url', t: string): void {
  if (kind === 'url' && !/^https:\/\/[^\s]+$/.test(t)) throw new ApiError('validation', 'A web address must start with https://.', { fields: ['target'] });
  if (kind === 'route' && !/^\/[A-Za-z0-9/_\-[\]().?=&%]*$/.test(t)) throw new ApiError('validation', 'An in-app page starts with /.', { fields: ['target'] });
}

/** The image must really be in our store under launch/, an allowed type, within the limits. */
async function storedImage(storage: EpisodeStorage, db: Db, url: string, exceptId?: string) {
  const f = await storage.head(url);
  if (!f || !f.pathname.startsWith('launch/') || !LAUNCH_IMAGE_TYPES.includes(f.contentType)) throw new ApiError('validation', 'Upload the image first.', { fields: ['imageUrl'] });
  await checkLaunchRoom(db, f.size, exceptId);
  return f;
}

admin.post('/launch', json(z.object({ imageUrl: z.string().url().max(2048), ...launchFields })), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  checkTarget(b.targetKind, b.target);
  if (Date.parse(b.endsAt) <= Date.parse(b.startsAt)) throw new ApiError('validation', 'The end must be after the start.', { fields: ['endsAt'] });
  const f = await storedImage(c.get('storage'), db, b.imageUrl);
  const input: PromotionInput = {
    imageUrl: f.url, imagePath: f.pathname, imageBytes: f.size, targetKind: b.targetKind, target: b.target, label: b.label ?? 'Promotion',
    startsAt: b.startsAt, endsAt: b.endsAt, weight: b.weight ?? 1, dailyCap: b.dailyCap ?? 1,
  };
  let id = '';
  const promotion = await adminWrite(db, auditCtx(c), { area: 'launch', action: 'create', target: 'new' },
    async (tx) => (id ? ((await getPromotion(tx, id)) ?? null) : null),
    async (tx) => { const p = await createPromotion(tx, input); id = p.id; return p; });
  return c.json({ promotion }, 201);
});

admin.patch('/launch/:id', json(z.object({ imageUrl: z.string().url().max(2048).optional(), ...launchFields, retired: z.boolean().optional() }).partial()), async (c) => {
  const id = c.req.param('id');
  const b = c.req.valid('json');
  const db = c.get('db');
  const cur = await getPromotion(db, id);
  if (!cur) throw new ApiError('not_found', 'No such promotion.');
  const kind = b.targetKind ?? cur.targetKind;
  checkTarget(kind, b.target ?? cur.target);
  if (Date.parse(b.endsAt ?? cur.endsAt) <= Date.parse(b.startsAt ?? cur.startsAt)) throw new ApiError('validation', 'The end must be after the start.', { fields: ['endsAt'] });
  const f = b.imageUrl && b.imageUrl !== cur.imageUrl ? await storedImage(c.get('storage'), db, b.imageUrl, id) : undefined;
  if (b.retired === false && cur.state === 'retired') await checkLaunchRoom(db, cur.imageBytes, id);
  const promotion = await adminWrite(db, auditCtx(c), { area: 'launch', action: b.retired === true ? 'retire' : 'edit', target: id },
    async (tx) => (await getPromotion(tx, id)) ?? null,
    (tx) => updatePromotion(tx, id, {
      ...(f ? { imageUrl: f.url, imagePath: f.pathname, imageBytes: f.size } : {}),
      ...(b.targetKind ? { targetKind: b.targetKind } : {}), ...(b.target ? { target: b.target } : {}), ...(b.label ? { label: b.label } : {}),
      ...(b.startsAt ? { startsAt: b.startsAt } : {}), ...(b.endsAt ? { endsAt: b.endsAt } : {}),
      ...(b.weight !== undefined ? { weight: b.weight } : {}), ...(b.dailyCap !== undefined ? { dailyCap: b.dailyCap } : {}),
      ...(b.retired !== undefined ? { retired: b.retired } : {}),
    }));
  return c.json({ promotion });
});

// ---- US4: accounts, act as, curators (FR-019–FR-025) ----

const accountRow = z.object({
  displayName: z.string().trim().min(1).max(40),
  bio: z.string().trim().max(160).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('').transform(() => undefined)),
});

admin.get('/accounts', async (c) => c.json({ items: await madeAccounts(c.get('db')), curators: await listCurators(c.get('db')) }));

admin.post('/accounts', json(z.object({ accounts: z.array(accountRow).min(1).max(MAX_BULK) })), async (c) => {
  const rows = c.req.valid('json').accounts;
  const db = c.get('db');
  const me = c.get('listener')!.id;
  // One hash of random bytes nobody knows, for the batch (scrypt is ~32 MiB a call; 50 calls would not fit a request).
  const hash = await hashPassword(randomBytes(32).toString('hex'));
  let ids: string[] = [];
  const results = await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'create', target: `${rows.length} account${rows.length === 1 ? '' : 's'}` },
    async (tx) => ({ accounts: await accountsByIds(tx, ids) }),
    async (tx) => { const r = await createAccounts(tx, me, rows, hash); ids = r.flatMap((x) => (x.ok ? [x.id] : [])); return r; });
  return c.json({ results });
});

admin.patch('/accounts/:id', json(z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
})), async (c) => {
  const id = uuidParam(c.req.param('id'));
  const b = c.req.valid('json');
  const db = c.get('db');
  const [cur] = await accountsByIds(db, [id]);
  if (!cur || cur.madeBy === null) throw new ApiError('not_found', 'No such account made in Admin.');
  if (b.email && (await emailTaken(db, b.email, id))) throw new ApiError('conflict', 'Another account uses this email.', { fields: ['email'] });
  const account = await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'edit', target: id },
    async (tx) => (await accountsByIds(tx, [id]))[0] ?? null, (tx) => updateAccount(tx, id, b));
  return c.json({ account });
});

const secure = (url: string) => new URL(url).protocol === 'https:';

// Registered before `/act-as/:id` so "stop" is never read as an id.
admin.post('/act-as/stop', async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  await adminWrite(db, auditCtx(c), { area: 'accounts', action: 'act_as_stop', target: me },
    async (tx) => ({ acting: (await tx.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [me])).map((r) => r.listener_id) }),
    (tx) => stopActing(tx, me));
  deleteCookie(c, ACT_AS_COOKIE, { path: '/', secure: secure(c.req.url) });
  return c.json({ actingAs: null });
});

admin.post('/act-as/:id', async (c) => {
  const id = uuidParam(c.req.param('id'));
  const db = c.get('db');
  const me = c.get('listener')!.id;
  const [target] = await accountsByIds(db, [id]);
  if (!target || target.madeBy === null) throw new ApiError('not_found', 'You can act only as an account made in Admin.');
  let token = '';
  await adminWrite(db, { ...auditCtx(c), actingAs: id }, { area: 'accounts', action: 'act_as', target: id },
    async (tx) => ({ acting: (await tx.query<{ listener_id: string }>('SELECT listener_id FROM sessions WHERE acting_admin_id = $1', [me])).map((r) => r.listener_id) }),
    async (tx) => { token = await startActing(tx, c.get('pepper'), me, id); });
  setCookie(c, ACT_AS_COOKIE, token, { httpOnly: true, secure: secure(c.req.url), sameSite: 'Strict', path: '/', maxAge: STUDIO_IDLE_MS / 1000 });
  return c.json({ actingAs: { id: target.id, displayName: target.displayName } });
});

admin.get('/curators', async (c) => c.json({ items: await listCurators(c.get('db')) }));

admin.put('/curators', json(z.object({ feedUrl, listenerId: z.string().uuid().nullable() })), async (c) => {
  const b = c.req.valid('json');
  const db = c.get('db');
  if (b.listenerId) {
    const [who] = await accountsByIds(db, [b.listenerId]);
    if (!who) throw new ApiError('not_found', 'No such account.');
  }
  const read = async (tx: Db) => (await listCurators(tx)).find((x) => x.feedUrl === b.feedUrl) ?? null;
  await adminWrite(db, auditCtx(c), { area: 'accounts', action: b.listenerId ? 'set_curator' : 'remove_curator', target: b.feedUrl }, read,
    (tx) => setCurator(tx, b.feedUrl, b.listenerId, c.get('listener')!.id));
  const now = await read(db);
  return c.json({ curator: now ? now.curator : null });
});

// ---- US6: users and safety (FR-030, FR-031) ----

type UserRow = { id: string; display_name: string; email: string; created_at: Date | string; suspended_at: Date | string | null; made_by: string | null };
const toUser = (r: UserRow) => ({ id: r.id, displayName: r.display_name, email: r.email, createdAt: new Date(r.created_at).toISOString(), suspended: r.suspended_at !== null, madeByAdmin: r.made_by !== null });
const userById = async (db: Db, id: string) => {
  const [r] = await db.query<UserRow>('SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners WHERE id = $1', [id]);
  return r ? toUser(r) : null;
};

admin.get('/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1 || q.length > 80) throw new ApiError('validation', 'q must be 1–80 characters.', { fields: ['q'] });
  const like = q.replace(/[\\%_]/g, (m) => '\\' + m);
  const rows = await c.get('db').query<UserRow>(
    `SELECT id, display_name, email, created_at, suspended_at, made_by FROM listeners
      WHERE display_name ILIKE '%' || $1 || '%' OR email::text ILIKE '%' || $1 || '%'
      ORDER BY (display_name ILIKE $1 || '%') DESC, lower(display_name), id LIMIT 50`, [like]);
  return c.json({ items: rows.map(toUser) });
});

admin.patch('/users/:id', json(z.object({ displayName: z.string().trim().min(1).max(40) })), async (c) => {
  const id = uuidParam(c.req.param('id'));
  const db = c.get('db');
  if (!(await userById(db, id))) throw new ApiError('not_found', 'No such account.');
  const user = await adminWrite(db, auditCtx(c), { area: 'users', action: 'rename', target: id }, (tx) => userById(tx, id), async (tx) => {
    await tx.query('UPDATE listeners SET display_name = $2 WHERE id = $1', [id, c.req.valid('json').displayName]);
    return userById(tx, id);
  });
  return c.json({ user });
});

/**
 * G-U1: suspension and report actions go through `/mod`'s own `act()` — one place for the rule.
 * `act()` runs its own transaction (a nested one is not portable across the two drivers), so the
 * record is written right after it, with the before and after it read.
 */
async function adminAct(c: Context<AdminEnv, any, any>, area: 'users' | 'reports', item: { kind: TargetKind; id: string }, action: Action) {
  const db = c.get('db');
  const me = c.get('listener')!.id;
  if (action === 'suspend' && item.kind === 'profile' && item.id === me) throw new ApiError('validation', 'You cannot suspend yourself.', { fields: ['id'] });
  const read = async () => ({
    ...(item.kind === 'profile' ? { user: await userById(db, item.id) } : {}),
    openReports: Number((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM reports WHERE target_kind = $1 AND target_id = $2 AND closed_at IS NULL', [item.kind, item.id]))[0]?.n ?? 0),
  });
  const before = await read();
  const a = await act(db, me, item, action);
  await insertAudit(db, auditCtx(c), { area, action, target: `${item.kind}:${item.id}` }, before, { ...(await read()), moderationActionId: a.id });
  return a;
}

admin.post('/users/:id/suspend', async (c) => {
  const id = uuidParam(c.req.param('id'));
  if (!(await userById(c.get('db'), id))) throw new ApiError('not_found', 'No such account.');
  await adminAct(c, 'users', { kind: 'profile', id }, 'suspend');
  return c.json({ user: await userById(c.get('db'), id) });
});

admin.post('/users/:id/restore', async (c) => {
  const id = uuidParam(c.req.param('id'));
  if (!(await userById(c.get('db'), id))) throw new ApiError('not_found', 'No such account.');
  await adminAct(c, 'users', { kind: 'profile', id }, 'unsuspend');
  return c.json({ user: await userById(c.get('db'), id) });
});

const reportRow = (r: QueueRow) => ({ targetKind: r.target_kind, targetId: r.target_id, reporterId: r.reporter_id, reporterName: r.display_name, reason: r.reason, note: r.note, snapshot: r.snapshot, createdAt: new Date(r.created_at).getTime() });

admin.get('/reports', async (c) => {
  const db = c.get('db');
  const state = c.req.query('state') === 'closed' ? 'closed' : 'open';
  const actions = (await recentActions(db, 50)).map((a) => ({ id: a.id, action: a.action, targetKind: a.target_kind, targetId: a.target_id, actorName: a.actor_name, at: new Date(a.created_at).toISOString() }));
  if (state === 'open') {
    const items = groupReports((await openReports(db)).map(reportRow)).map((i) => ({ ...i, actions: actionsFor(i.targetKind) }));
    return c.json({ state, items, actions });
  }
  const closed = (await closedReports(db, RETENTION_DAYS)).map((r) => ({
    id: r.id, targetKind: r.target_kind, targetId: r.target_id, reason: r.reason, reporterName: r.display_name,
    createdAt: new Date(r.created_at).toISOString(), closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null, closeReason: r.close_reason,
  }));
  return c.json({ state, items: closed, actions });
});

const ACTIONS: readonly Action[] = ['dismiss', 'remove', 'hide_show', 'suspend', 'unsuspend', 'unhide_show'];

admin.post('/reports/act', json(z.object({
  kind: z.enum(['comment', 'clip', 'profile', 'show']),
  id: z.string().min(1).max(2048),
  action: z.enum(ACTIONS as [Action, ...Action[]]),
})), async (c) => {
  const b = c.req.valid('json');
  // The same rule `/mod` applies (pages/mod.ts `POST /mod/act`).
  if (!(actionsFor(b.kind).includes(b.action) || b.action === 'unsuspend' || b.action === 'unhide_show')) throw new ApiError('validation', 'That action does not fit this item.', { fields: ['action'] });
  const a = await adminAct(c, 'reports', { kind: b.kind, id: b.id }, b.action);
  return c.json({ action: { id: a.id, action: a.action, targetKind: a.target_kind, targetId: a.target_id } });
});

// ---- M18: the dashboard (specs/019-m18-admin-dashboard, contracts/metrics-api.md) ----

/** Numbers at most 5 minutes old (D2). A result with a failed section is served once, never kept (R5). */
export const METRICS_TTL_MS = 5 * 60_000;

admin.get('/metrics', async (c) => {
  const raw = c.req.query('days') ?? '30';
  const days = Number(raw) as MetricRange;
  if (!METRIC_RANGES.includes(days)) throw new ApiError('validation', 'The range must be 7, 30 or 90 days.', { fields: ['days'] });
  const db = c.get('db');
  const key = `admin-metrics:${days}`;
  const { body } = await cached(db, key, METRICS_TTL_MS, () => computeMetrics(db, days));
  if (body.partial) await db.query('DELETE FROM cache WHERE key = $1', [key]);
  return c.json(body);
});
