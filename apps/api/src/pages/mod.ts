/**
 * M6 moderation queue (research R3): a signed-in HTML page for the ONE owner.
 *   GET  /mod         the sign-in form, or the queue (open items, then the last 90 days closed)
 *   POST /mod/login   email + password → cookie `mod` (HttpOnly; Secure; SameSite=Strict; Path=/mod)
 *   POST /mod/act     item (kind:id) + action + csrf → apply, redirect
 *   POST /mod/logout
 * Anyone but the owner (G9) gets a 403 page on every route; no app links here.
 */
import { Hono, type Context } from 'hono';
import { createHash } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { actionsFor, groupReports, RETENTION_DAYS, type Action, type QueueItem, type TargetKind } from '@socialmorning/social-core';
import type { AuthEnv, Listener } from '../auth/session.ts';
import { createSession, listenerForToken, tokenHash } from '../auth/session.ts';
import { verifyPassword } from '../auth/password.ts';
import { listenerByEmail } from '../db/repos/listeners.ts';
import { closedReports, openReports, purgeClosedOlderThan, type QueueRow } from '../db/repos/reports.ts';
import { act, recentActions } from '../db/repos/moderation.ts';
import { esc, mmss, page } from './clip.ts';

const COOKIE = 'mod';
const ACTIONS: readonly Action[] = ['dismiss', 'remove', 'hide_show', 'suspend', 'unsuspend', 'unhide_show'];
const csrfFor = (token: string) => createHash('sha256').update('csrf|').update(token).digest('base64url').slice(0, 24);

export const mod = new Hono<AuthEnv>();

/** The owner behind the cookie, or undefined. Not the owner → undefined too (G9). */
async function ownerFromCookie(c: Context<AuthEnv>): Promise<{ owner: Listener; token: string } | undefined> {
  const token = getCookie(c, COOKIE);
  const ownerId = c.get('safety').ownerListenerId;
  if (!token || !ownerId) return undefined;
  const l = await listenerForToken(c.get('db'), token, c.get('pepper'));
  if (!l || l.id !== ownerId) return undefined;
  return { owner: l, token };
}

const secure = (c: { req: { url: string } }) => c.req.url.startsWith('https:');

mod.get('/', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Moderation', '<h1>Moderation is not configured</h1><p class="muted">OWNER_LISTENER_ID is not set.</p>'), 503);
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Moderation — sign in', loginForm()));
  const db = c.get('db');
  await purgeClosedOlderThan(db, RETENTION_DAYS);
  const [open, closed, actions] = await Promise.all([openReports(db), closedReports(db, RETENTION_DAYS), recentActions(db, 50)]);
  const items = groupReports(open.map(toRow));
  const csrf = csrfFor(who.token);
  return c.html(page('Moderation', `
<h1>Moderation queue</h1><p class="muted">Signed in as ${esc(who.owner.display_name)} · <form method="post" action="/mod/logout" style="display:inline"><input type="hidden" name="csrf" value="${csrf}"><button>Sign out</button></form></p>
<h2>Open (${items.length})</h2>
${items.length === 0 ? '<p class="muted">Nothing to review.</p>' : items.map((i) => renderItem(i, csrf)).join('')}
<h2>Closed in the last ${RETENTION_DAYS} days (${closed.length})</h2>
${closed.length === 0 ? '<p class="muted">None.</p>' : `<ul>${closed.map(renderClosed).join('')}</ul>`}
<h2>Recent actions</h2>
${actions.length === 0 ? '<p class="muted">None.</p>' : `<ul>${actions.map((a) => `<li>${esc(new Date(a.created_at).toISOString())} · <b>${esc(a.action)}</b> ${esc(a.target_kind)} <code>${esc(a.target_id)}</code> by ${esc(a.actor_name)}</li>`).join('')}</ul>`}`));
});

mod.post('/login', async (c) => {
  const form = await c.req.parseBody();
  const email = String(form['email'] ?? '').trim();
  const password = String(form['password'] ?? '');
  const ownerId = c.get('safety').ownerListenerId;
  const row = email ? await listenerByEmail(c.get('db'), email) : undefined;
  if (!row || !ownerId || row.id !== ownerId || !(await verifyPassword(password, row.password_hash))) {
    return c.html(page('Moderation — refused', '<h1>Not the owner</h1><p class="muted">This page is for the app\'s owner only.</p><p><a href="/mod">Back</a></p>'), 403);
  }
  const token = await createSession(c.get('db'), row.id, c.get('pepper'), 'mod-web');
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: 'Strict', path: '/mod', maxAge: 60 * 60 * 12 });
  return c.redirect('/mod', 303);
});

mod.post('/act', async (c) => {
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Moderation — refused', '<h1>Not the owner</h1>'), 403);
  const form = await c.req.parseBody();
  if (String(form['csrf'] ?? '') !== csrfFor(who.token)) return c.html(page('Moderation — refused', '<h1>Stale form</h1><p><a href="/mod">Back</a></p>'), 403);
  const item = String(form['item'] ?? '');
  const action = String(form['action'] ?? '') as Action;
  const sep = item.indexOf(':');
  const kind = item.slice(0, sep) as TargetKind;
  const id = item.slice(sep + 1);
  if (sep < 1 || !id || !ACTIONS.includes(action) || !(actionsFor(kind).includes(action) || action === 'unsuspend' || action === 'unhide_show')) {
    return c.html(page('Moderation — refused', '<h1>Bad action</h1><p><a href="/mod">Back</a></p>'), 400);
  }
  if (action === 'suspend' && kind === 'profile' && id === who.owner.id) return c.html(page('Moderation — refused', '<h1>You cannot suspend yourself</h1><p><a href="/mod">Back</a></p>'), 400);
  await act(c.get('db'), who.owner.id, { kind, id }, action);
  return c.redirect('/mod', 303);
});

mod.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await c.get('db').query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token, c.get('pepper'))]);
  deleteCookie(c, COOKIE, { path: '/mod' });
  return c.redirect('/mod', 303);
});

function loginForm(): string {
  return `<h1>Moderation</h1><form method="post" action="/mod/login"><p><label>Email <input name="email" type="email" autocomplete="username" required></label></p><p><label>Password <input name="password" type="password" autocomplete="current-password" required></label></p><button class="btn" type="submit">Sign in</button></form>`;
}

function toRow(r: QueueRow) {
  return { targetKind: r.target_kind, targetId: r.target_id, reporterId: r.reporter_id, reporterName: r.display_name, reason: r.reason, note: r.note, snapshot: r.snapshot, createdAt: new Date(r.created_at).getTime() };
}

function renderSnapshot(s: unknown): string {
  const o = (s ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === 'string' ? esc(o[k] as string) : '');
  switch (o['kind']) {
    case 'comment': return `<blockquote>${str('body') || '<i>(empty)</i>'}</blockquote><p class="muted">by ${str('authorName') || '?'} ${typeof o['offsetMs'] === 'number' ? `at ${mmss(o['offsetMs'] as number)} ` : ''}on “${str('episodeTitle')}”</p>`;
    case 'clip': return `<blockquote>${str('caption') || '<i>(no caption)</i>'}</blockquote><p class="muted">${typeof o['startMs'] === 'number' && typeof o['endMs'] === 'number' ? `${mmss(o['startMs'] as number)}–${mmss(o['endMs'] as number)} ` : ''}by ${str('authorName') || '?'} on “${str('episodeTitle')}”</p>`;
    case 'profile': return `<p>Profile <b>${str('displayName') || '?'}</b></p>`;
    case 'show': return `<p>Show <b>${str('showTitle') || '?'}</b> <code>${str('feedUrl')}</code></p>`;
    default: return '<p class="muted">(no copy)</p>';
  }
}

const LABEL: Record<Action, string> = { dismiss: 'Dismiss', remove: 'Remove the content', hide_show: 'Hide the show from discovery', suspend: 'Suspend the account', unsuspend: 'Un-suspend', unhide_show: 'Un-hide the show' };

function renderItem(i: QueueItem, csrf: string): string {
  const buttons = actionsFor(i.targetKind).map((a) => `<button name="action" value="${a}">${LABEL[a]}</button>`).join(' ');
  return `<section style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0">
<p><b>${esc(i.targetKind)}</b> <code>${esc(i.targetId)}</code> · ${i.count} report${i.count === 1 ? '' : 's'} · first ${esc(new Date(i.firstAt).toISOString())}</p>
${renderSnapshot(i.snapshot)}
<p class="muted">Reasons: ${i.reasons.map(esc).join(', ')} · Reported by: ${i.reporters.map(esc).join(', ')}</p>
${i.notes.length ? `<ul>${i.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
<form method="post" action="/mod/act"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="item" value="${esc(i.targetKind)}:${esc(i.targetId)}">${buttons}</form>
</section>`;
}

function renderClosed(r: QueueRow): string {
  return `<li>${esc(new Date(r.closed_at!).toISOString())} · ${esc(r.target_kind)} <code>${esc(r.target_id)}</code> · <b>${esc(r.close_reason ?? '')}</b> · reported by ${esc(r.display_name ?? 'a deleted account')} (${esc(r.reason)})${r.note ? ` — ${esc(r.note)}` : ''}<details><summary>copy</summary>${renderSnapshot(r.snapshot)}</details></li>`;
}
