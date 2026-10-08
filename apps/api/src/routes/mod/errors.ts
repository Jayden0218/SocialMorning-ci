// The owner's error log page under /mod: newest first, with scope, message, version, platform and count.
import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthEnv } from '../../auth/session.ts';
import { listenerForToken } from '../../auth/session.ts';
import { esc, page } from '../../pages/clip.ts';
import { ERROR_DAYS, recentErrors } from '../../db/repos/account/error-reports.ts';

/**
 * M23 US8 (FR-013). Owner only, by the rule every /mod page uses: the `mod` cookie from
 * /mod/login must belong to OWNER_LISTENER_ID; anyone else gets 403. No listener is named.
 *   GET /mod/errors → an HTML table, newest first
 */
export const modErrorsPage = new Hono<AuthEnv>();

async function isOwnerByCookie(c: Context<AuthEnv>): Promise<boolean> {
  const token = getCookie(c, 'mod');
  const ownerId = c.get('safety').ownerListenerId;
  if (!token || !ownerId) return false;
  const l = await listenerForToken(c.get('db'), token, c.get('pepper'));
  return l?.id === ownerId;
}

const when = (d: string | Date) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');

modErrorsPage.get('/errors', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Errors', '<h1>Not configured</h1>'), 503);
  if (!(await isOwnerByCookie(c))) return c.html(page('Errors — refused', '<h1>Not the owner</h1><p><a href="/mod">Back</a></p>'), 403);
  const rows = await recentErrors(c.get('db'));
  return c.html(page('Errors', `
    <h1>Errors from the app — last ${ERROR_DAYS} days</h1>
    ${rows.length === 0 ? '<p class="muted">Nothing yet.</p>' : `<table>
      <tr><th>Last seen</th><th>Scope</th><th>Message</th><th>Version</th><th>Platform</th><th>Count</th></tr>
      ${rows.map((r) => `<tr><td>${esc(when(r.last_seen))}</td><td>${esc(r.scope)}</td><td>${esc(r.message)}${r.stack ? `<details><summary>Stack</summary><pre>${esc(r.stack)}</pre></details>` : ''}</td><td>${esc(r.app_version || '—')}</td><td>${esc(r.platform || '—')}</td><td>${r.count}</td></tr>`).join('')}
    </table>`}
    <p class="muted">No listener is named here. Rows unseen for ${ERROR_DAYS} days are deleted.</p>
    <p><a href="/mod">Back to the queue</a></p>
  `));
});
