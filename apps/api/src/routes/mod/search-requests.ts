// The owner's list of searches listeners asked the editors to add (HTML under /mod, JSON under /v1/mod).
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthEnv } from '../../auth/session.ts';
import { listenerForToken, requireAuth } from '../../auth/session.ts';
import { ApiError } from '../../errors.ts';
import { esc, page } from '../../pages/clip.ts';
import { recentSearchRequests } from '../discover/search-requests.ts';

/**
 * M22 US17 item 3. Owner only, by the same rule as every /mod page: the `mod` cookie from
 * /mod/login (src/pages/mod.ts) must belong to OWNER_LISTENER_ID. Anyone else gets 403.
 *   GET /mod/search-requests     → an HTML table
 *   GET /v1/mod/search-requests  → { items: { q, n, last }[] } (Bearer token of the owner)
 */
export const modSearchRequestsPage = new Hono<AuthEnv>();

async function isOwnerByCookie(c: Context<AuthEnv>): Promise<boolean> {
  const token = getCookie(c, 'mod');
  const ownerId = c.get('safety').ownerListenerId;
  if (!token || !ownerId) return false;
  const l = await listenerForToken(c.get('db'), token, c.get('pepper'));
  return l?.id === ownerId;
}

modSearchRequestsPage.get('/search-requests', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Search requests', '<h1>Not configured</h1>'), 503);
  if (!(await isOwnerByCookie(c))) return c.html(page('Search requests — refused', '<h1>Not the owner</h1><p><a href="/mod">Back</a></p>'), 403);
  const rows = await recentSearchRequests(c.get('db'));
  return c.html(page('Search requests', `
    <h1>"Can't find it? Tell us" — last 90 days</h1>
    ${rows.length === 0 ? '<p class="muted">Nothing yet.</p>' : `<table>
      <tr><th>Search words</th><th>Times</th><th>Last asked</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.q)}</td><td>${r.n}</td><td>${esc(r.last.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}
    </table>`}
    <p class="muted">Words only — no listener is named here.</p>
    <p><a href="/mod">Back to the queue</a></p>
  `));
});

export const modSearchRequestsApi = new Hono<AuthEnv>();

modSearchRequestsApi.get('/', requireAuth, async (c) => {
  const ownerId = c.get('safety').ownerListenerId;
  if (!ownerId || c.get('listener')!.id !== ownerId) throw new ApiError('forbidden', 'Only the owner can read this.');
  c.header('cache-control', 'private, no-store');
  return c.json({ items: await recentSearchRequests(c.get('db')) });
});
