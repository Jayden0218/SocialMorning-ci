// Shared show lists: a listener picks some of their shows, gives them a title, and shares one link.
import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import type { Db } from '../db/db.ts';
import { esc, page } from '../pages/clip.ts';
import { insertSharedList, sharedListRows, sharedListShowRows } from '../db/repos/social/shared-lists.ts';

/**
 * M22 US17 item 5 (contracts/api.md "Small items").
 *   POST /v1/me/shared-lists { title ≤ 60, feedUrls 2–100 } → { id, url }
 *   GET  /v1/lists/:id → { id, title, owner: { id, displayName }, shows: { feedUrl, title, imageUrl }[], createdAt }
 *   GET  /l/:id        → a public HTML page listing the shows, each with "Open in SocialNet"
 * A list holds feed URLs and a title — no media. A show hidden by moderation is left out when read.
 */
export const LIST_TITLE_MAX = 60;
export const LIST_MIN = 2;
export const LIST_MAX = 100;

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Ten characters from a 56-letter alphabet without look-alikes (≈ 58 bits). */
export function newListId(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const httpUrl = (v: string | null): string | null => (v !== null && /^https?:\/\/[^\s"'<>]+$/i.test(v) ? v : null);

export type SharedShow = { feedUrl: string; title: string; imageUrl: string | null };
export type SharedList = { id: string; title: string; owner: { id: string; displayName: string }; shows: SharedShow[]; createdAt: string };

export async function readList(db: Db, id: string): Promise<SharedList | undefined> {
  if (!/^[A-Za-z0-9]{10}$/.test(id)) return undefined;
  const [l] = await sharedListRows(db, id);
  if (!l || l.suspended_at) return undefined;
  const urls = Array.isArray(l.feed_urls) ? l.feed_urls : l.feed_urls.replace(/^\{|\}$/g, '').split(',').map((u) => u.replace(/^"|"$/g, ''));
  const rows = await sharedListShowRows(db, urls);
  const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
  return {
    id: l.id.trim(), title: l.title, owner: { id: l.owner_id, displayName: l.display_name },
    shows: rows.map((r) => ({ feedUrl: r.feed_url, title: r.title ?? hostOf(r.feed_url), imageUrl: httpUrl(r.image_url) })),
    createdAt: new Date(l.created_at).toISOString(),
  };
}

export const mySharedLists = new Hono<AuthEnv>();

const body = z.object({
  title: z.string().trim().min(1).max(LIST_TITLE_MAX),
  feedUrls: z.array(z.string().url().max(2000)).min(LIST_MIN).max(LIST_MAX),
});

mySharedLists.post('/', requireAuth, json(body), async (c) => {
  const b = c.req.valid('json');
  const feedUrls = [...new Set(b.feedUrls.filter((u) => /^https?:\/\//i.test(u)))];
  if (feedUrls.length < LIST_MIN) throw new ApiError('validation', `Pick at least ${LIST_MIN} shows.`, { fields: ['feedUrls'] });
  const db = c.get('db');
  let id = newListId();
  // A clash in ~58 bits is not expected; one retry keeps it from ever being a 500.
  for (let tries = 0; tries < 2; tries++) {
    const rows = await insertSharedList(db, id, c.get('listener')!.id, b.title, feedUrls);
    if (rows.length > 0) break;
    id = newListId();
  }
  return c.json({ id, url: `${c.get('publicBase')}/l/${id}` });
});

export const sharedLists = new Hono<AuthEnv>();

sharedLists.get('/:id', async (c) => {
  const list = await readList(c.get('db'), c.req.param('id'));
  if (!list) throw new ApiError('not_found', 'No such list.');
  return c.json(list);
});

/** GET /l/:id — built like the episode and clip pages: no player, no media, links into the app. */
export const listPages = new Hono<AuthEnv>();

listPages.get('/l/:id', async (c) => {
  const list = await readList(c.get('db'), c.req.param('id'));
  if (!list) return c.html(page('List not found', '<h1>No such list</h1><p class="muted">The link may be wrong, or the list was removed.</p>'), 404);
  const getApp = /iPhone|iPad|iPod/.test(c.req.header('user-agent') ?? '')
    ? 'The iPhone app is not on the App Store yet'
    : '<a href="/get">Get SocialNet for Android</a>';
  const rows = list.shows.map((s) => `
    <li style="display:flex;align-items:center;gap:12px;margin:12px 0">
      ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="" width="56" height="56" style="border-radius:8px;object-fit:cover">` : '<span style="display:inline-block;width:56px;height:56px;border-radius:8px;background:#eee"></span>'}
      <span style="flex:1">${esc(s.title)}</span>
      <a href="${esc(`socialmorning://show/${encodeURIComponent(s.feedUrl)}`)}">Open</a>
    </li>`).join('');
  const body = [
    `<h1>${esc(list.title)}</h1>`,
    `<p class="muted">${list.shows.length} show${list.shows.length === 1 ? '' : 's'} · shared by ${esc(list.owner.displayName)}</p>`,
    // M24 US1: the list opens in the app too (app/lists/[id].tsx), where it can be reported.
    `<p><a href="${esc(`socialmorning://lists/${encodeURIComponent(list.id)}`)}">Open this list in SocialNet</a></p>`,
    `<ul style="list-style:none;padding:0">${rows}</ul>`,
    `<p class="muted">No app yet? ${getApp} — shows play from the publisher's own audio; nothing is hosted here.</p>`,
  ].join('');
  return c.html(page(list.title, body).replace('</head>', `<meta property="og:title" content="${esc(list.title)}"></head>`));
});
