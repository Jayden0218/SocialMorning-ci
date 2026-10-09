// The owner's moderation web page: sign in, review reports, act on them.
/**
 * M6 moderation queue (research R3): a signed-in HTML page for the ONE owner.
 *   GET  /mod         the sign-in form, or the queue (open items, then the last 90 days closed)
 *   POST /mod/login   email + password → cookie `mod` (HttpOnly; Secure; SameSite=Strict; Path=/mod)
 *   POST /mod/act     item (kind:id) + action + csrf → apply, redirect
 *   POST /mod/logout
 *   POST /mod/host-unhide  M11 (FR-016): undo a show host's hide from the Studio
 *   POST /mod/takedown     M14 (FR-09): take a show created in the Studio down (feed 410, audio removed)
 * Anyone but the owner (G9) gets a 403 page on every route; no app links here.
 */
import { Hono, type Context } from 'hono';
import { createHash } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { actionsFor, groupReports, RETENTION_DAYS, type Action, type QueueItem, type TargetKind } from '@socialmorning/social-core';
import type { AuthEnv, Listener } from '../auth/session.ts';
import { createSession, listenerForToken, tokenHash } from '../auth/session.ts';
import { verifyPassword } from '../auth/password.ts';
import { clearFailedSignIns, listenerByEmail, recordFailedSignIn } from '../db/repos/account/listeners.ts';
import { clientAddress, HOUR_MS, limit } from '../auth/rate.ts';
import { ApiError } from '../errors.ts';
import { closedReports, openReports, purgeClosedOlderThan, type QueueRow } from '../db/repos/safety/reports.ts';
import { act, recentActions } from '../db/repos/safety/moderation.ts';
import { rollup } from '../db/repos/library/rec-events.ts';
import { similarityAgeHours } from '../db/repos/discover/similarity.ts';
import { SIMILARITY_STALE_HOURS } from '../db/repos/discover/similarity.ts';
import { esc, mmss, page } from './clip.ts';
import { recentHostHides, setHostHidden } from '../db/repos/studio/studio-comments.ts';
import { checkSecondFactor, rememberDevice, secondFactorDone, sendSecondFactor } from '../auth/second-factor.ts';
import { COUNTRY_HEADER, countryOf } from '../db/repos/account/country.ts';
import { listHostedEpisodes } from '../db/repos/studio/hosted.ts';
import { finishTakedown, markHostedShowDeleted, studioCreatedShows } from '../db/repos/safety/mod-shows.ts';
import { deleteSessionByHash } from '../db/repos/account/sessions.ts';

const COOKIE = 'mod';
const ACTIONS: readonly Action[] = ['dismiss', 'remove', 'hide_show', 'suspend', 'unsuspend', 'unhide_show'];
const csrfFor = (token: string) => createHash('sha256').update('csrf|').update(token).digest('base64url').slice(0, 24);

import { feedbackImage, recentFeedback } from '../db/repos/account/feedback.ts';

export const mod = new Hono<AuthEnv>();

/** The owner's session behind the cookie (second factor passed or not), or undefined. Not the owner → undefined too (G9). */
async function modSession(c: Context<AuthEnv>): Promise<{ owner: Listener; token: string; factor: boolean } | undefined> {
  const token = getCookie(c, COOKIE);
  const ownerId = c.get('safety').ownerListenerId;
  if (!token || !ownerId) return undefined;
  const l = await listenerForToken(c.get('db'), token, c.get('pepper'), c.get('pepperNext'));
  if (!l || l.id !== ownerId) return undefined;
  // M25 SB (G-SB2): the page opens only after the emailed code (or on a remembered browser).
  const factor = await secondFactorDone(c, c.get('db'), tokenHash(token, c.get('pepper')), l.id, c.get('pepper'), c.get('pepperNext'));
  return { owner: l, token, factor };
}

/** The owner behind the cookie, past the second factor — or undefined. Every /mod page and action uses this. */
async function ownerFromCookie(c: Context<AuthEnv>): Promise<{ owner: Listener; token: string } | undefined> {
  const s = await modSession(c);
  return s?.factor ? { owner: s.owner, token: s.token } : undefined;
}

/** M25 SB: the same rule for the other /mod pages (routes/mod/*.ts). */
export const isModOwner = async (c: Context<AuthEnv>): Promise<boolean> => (await ownerFromCookie(c)) !== undefined;

const secure = (c: { req: { url: string } }) => c.req.url.startsWith('https:');

/**
 * M8 US6 (FR-029) — the only place the recommendation layer can be judged on evidence.
 *
 * Two things are here and nowhere else: **CTR per retrieval channel**, so a channel that
 * earns nothing can be deleted with a number rather than an opinion; and
 * **`similarityAge`**, because GitHub silently disables a public repo's scheduled
 * workflows after 60 days of inactivity and a dead rebuild would otherwise look exactly
 * like a working one (research R4).
 */
mod.get('/recs', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Recommendations', '<h1>Not configured</h1>'), 503);
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Recommendations — refused', '<h1>Not the owner</h1><p><a href="/mod">Back</a></p>'), 403);
  const db = c.get('db');
  const [rows, age] = await Promise.all([rollup(db, 7), similarityAgeHours(db)]);
  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  const stale = age === null || age > SIMILARITY_STALE_HOURS;
  return c.html(page('Recommendations', `
    <h1>Recommendations — last 7 days</h1>
    <p class="${stale ? 'warn' : 'muted'}">Show similarity: ${
      age === null
        ? '<strong>never rebuilt.</strong> The scheduled job has not run once.'
        : age > SIMILARITY_STALE_HOURS
          ? `<strong>${Math.round(age)} h old — the scheduled rebuild has stopped.</strong> GitHub disables a public repo's schedules after 60 days of inactivity, silently.`
          : `${Math.round(age)} h old.`
    }</p>
    <table>
      <tr><th>Channel</th><th>Shown</th><th>Opened</th><th>CTR</th><th>Played</th><th>Finished</th></tr>
      ${rows.length === 0 ? '<tr><td colspan="6" class="muted">Nothing recorded yet.</td></tr>' : rows.map((r) => `
        <tr><td>${esc(r.channel)}</td><td>${r.shown}</td><td>${r.opened}</td><td>${pct(r.opened, r.shown)}</td><td>${r.played}</td><td>${r.finished}</td></tr>`).join('')}
    </table>
    <p class="muted">Aggregates only — no listener is named here.</p>
    <p><a href="/mod">Back to the queue</a></p>
  `));
});

/**
 * M10b US6 — the listeners' feedback, newest first, with its images (owner only). The images
 * are served one by one below, behind the same owner check; nothing here is public.
 */
mod.get('/feedback', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Feedback', '<h1>Not configured</h1>'), 503);
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Feedback — refused', '<h1>Not the owner</h1><p><a href="/mod">Back</a></p>'), 403);
  const rows = await recentFeedback(c.get('db'));
  return c.html(page('Feedback', `
    <h1>Feedback — newest 50</h1>
    ${rows.length === 0 ? '<p class="muted">Nothing yet.</p>' : rows.map((r) => `
      <div class="card">
        <p class="muted">${esc(r.kind)} · ${esc(new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' '))} · ${esc(r.display_name ?? 'signed out')}${r.app_version ? ` · ${esc(r.app_version)}` : ''}</p>
        <p>${esc(r.body)}</p>
        ${Array.from({ length: r.images }, (_, k) => `<a href="/mod/feedback/${esc(r.id)}/${k + 1}"><img src="/mod/feedback/${esc(r.id)}/${k + 1}" alt="image ${k + 1}" style="max-width:240px;max-height:240px;margin-right:8px"></a>`).join('')}
      </div>`).join('')}
    <p><a href="/mod">Back to the queue</a></p>
  `));
});

mod.get('/feedback/:id/:n', async (c) => {
  const who = await ownerFromCookie(c);
  if (!who) return c.text('Not the owner', 403);
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n) || n < 1 || n > 3) return c.text('Not found', 404);
  const img = await feedbackImage(c.get('db'), c.req.param('id'), n).catch(() => undefined);
  if (!img) return c.text('Not found', 404);
  c.header('content-type', img.mime);
  c.header('cache-control', 'private, no-store');
  return c.body(img.bytes as unknown as ArrayBuffer);
});

mod.get('/', async (c) => {
  if (!c.get('safety').ownerListenerId) return c.html(page('Moderation', '<h1>Moderation is not configured</h1><p class="muted">OWNER_LISTENER_ID is not set.</p>'), 503);
  const pending = await modSession(c);
  if (pending && !pending.factor) return c.html(page('Moderation — code', codeForm(pending.owner.email)));
  const who = pending ? { owner: pending.owner, token: pending.token } : undefined;
  if (!who) return c.html(page('Moderation — sign in', loginForm()));
  const db = c.get('db');
  await purgeClosedOlderThan(db, RETENTION_DAYS);
  const [open, closed, actions, hides, created] = await Promise.all([openReports(db), closedReports(db, RETENTION_DAYS), recentActions(db, 50), recentHostHides(db, 50),
    studioCreatedShows(db)]);
  const items = groupReports(open.map(toRow));
  const csrf = csrfFor(who.token);
  return c.html(page('Moderation', `
<h1>Moderation queue</h1><p class="muted">Signed in as ${esc(who.owner.display_name)} · <form method="post" action="/mod/logout" style="display:inline"><input type="hidden" name="csrf" value="${csrf}"><button>Sign out</button></form></p>
<h2>Open (${items.length})</h2>
${items.length === 0 ? '<p class="muted">Nothing to review.</p>' : items.map((i) => renderItem(i, csrf)).join('')}
<h2>Closed in the last ${RETENTION_DAYS} days (${closed.length})</h2>
${closed.length === 0 ? '<p class="muted">None.</p>' : `<ul>${closed.map(renderClosed).join('')}</ul>`}
<h2>Shows created in the Studio (${created.length})</h2>
${created.length === 0 ? '<p class="muted">None.</p>' : `<ul>${created.map((s) => `<li><b>${esc(s.title)}</b> · by ${esc(s.owner ?? 'a deleted account')} · ${s.eps} episode${s.eps === 1 ? '' : 's'} · created ${esc(new Date(s.created_at).toISOString().slice(0, 10))}, updated ${esc(new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' '))}${s.hidden ? ' · <i>hidden from discovery</i>' : ''} · <a href="${esc(s.feed_url)}">feed</a>
<form method="post" action="/mod/act" style="display:inline"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="item" value="show:${esc(s.feed_url)}"><button name="action" value="${s.hidden ? 'unhide_show' : 'hide_show'}">${s.hidden ? 'Un-hide' : 'Hide from discovery'}</button></form>
<form method="post" action="/mod/takedown" style="display:inline"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(s.id)}"><button>Take down</button></form></li>`).join('')}</ul>`}
<h2>Hidden by show hosts (${hides.length})</h2>
${hides.length === 0 ? '<p class="muted">None.</p>' : `<ul>${hides.map((h) => `<li>${esc(h.at)} · “${esc(h.title)}” · hidden by ${esc(h.by ?? 'a deleted account')}<blockquote>${h.body ? esc(h.body) : '<i>(no text)</i>'}</blockquote><form method="post" action="/mod/host-unhide"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${esc(h.id)}"><input type="hidden" name="feed" value="${esc(h.feedUrl)}"><button>Un-hide</button></form></li>`).join('')}</ul>`}
<h2>Recent actions</h2>
${actions.length === 0 ? '<p class="muted">None.</p>' : `<ul>${actions.map((a) => `<li>${esc(new Date(a.created_at).toISOString())} · <b>${esc(a.action)}</b> ${esc(a.target_kind)} <code>${esc(a.target_id)}</code> by ${esc(a.actor_name)}</li>`).join('')}</ul>`}`));
});

/** M25 S2: password tries at /mod/login per network address an hour. */
export const MOD_LOGINS_PER_ADDRESS_HOUR = 10;

const tooMany = (c: Context<AuthEnv>, seconds: number) => {
  c.header('retry-after', String(seconds));
  return c.html(page('Moderation — wait', `<h1>Too many tries</h1><p class="muted">Try again in ${Math.ceil(seconds / 60)} minute${seconds > 60 ? 's' : ''}.</p><p><a href="/mod">Back</a></p>`), 429);
};

/*
 * M25 S2 (audit #2, guard G-M25-S2): the owner's password form had no lockout and no limit. Now it
 * counts tries per network address (10 an hour), and uses the same per-account lockout as the
 * app's sign-in (`recordFailedSignIn` / `locked_until`): a locked account is refused before the
 * password is even checked, and every wrong password for the owner's email counts.
 */
mod.post('/login', async (c) => {
  const db = c.get('db');
  const addr = clientAddress(c);
  if (addr) {
    try { await limit(db, `mod:ip:${addr}`, HOUR_MS, MOD_LOGINS_PER_ADDRESS_HOUR, 'Too many tries.'); }
    catch (e) { if (e instanceof ApiError) return tooMany(c, Number(e.extra['retryAfterSeconds'] ?? 3600)); throw e; }
  }
  const form = await c.req.parseBody();
  const email = String(form['email'] ?? '').trim().toLowerCase();
  const password = String(form['password'] ?? '');
  const ownerId = c.get('safety').ownerListenerId;
  const row = email ? await listenerByEmail(db, email) : undefined;
  const now = Date.now();
  const lockedUntil = row?.locked_until ? new Date(row.locked_until).getTime() : null;
  if (row && lockedUntil !== null && lockedUntil > now) return tooMany(c, Math.ceil((lockedUntil - now) / 1000));
  const ok = Boolean(row && ownerId && row.id === ownerId && (await verifyPassword(password, row.password_hash)));
  if (!ok || !row) {
    if (row && ownerId && row.id === ownerId) await recordFailedSignIn(db, row.id, now);
    return c.html(page('Moderation — refused', '<h1>Not the owner</h1><p class="muted">This page is for the app\'s owner only.</p><p><a href="/mod">Back</a></p>'), 403);
  }
  await clearFailedSignIns(db, row.id);
  const token = await createSession(db, row.id, c.get('pepper'), 'mod-web', { country: countryOf(c.req.header(COUNTRY_HEADER)) });
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secure(c), sameSite: 'Strict', path: '/mod', maxAge: 60 * 60 * 12 });
  // M25 SB: a code to the owner's inbox, unless this browser is remembered (GET /mod then asks for it).
  const hash = tokenHash(token, c.get('pepper'));
  if (!(await secondFactorDone(c, db, hash, row.id, c.get('pepper'), c.get('pepperNext')))) {
    await sendSecondFactor(db, c.get('mailer'), hash, row.email, c.get('pepper')).catch((e: unknown) => console.error('mod code not sent', e instanceof Error ? e.message : e));
  }
  return c.redirect('/mod', 303);
});

/** M25 SB: the emailed code for this browser's /mod session; `remember` keeps this browser for 30 days. */
mod.post('/code', async (c) => {
  const s = await modSession(c);
  if (!s) return c.html(page('Moderation — refused', '<h1>Not the owner</h1><p><a href="/mod">Back</a></p>'), 403);
  if (s.factor) return c.redirect('/mod', 303);
  const form = await c.req.parseBody();
  const db = c.get('db');
  const hash = tokenHash(s.token, c.get('pepper'));
  if (form['resend'] !== undefined) {
    await sendSecondFactor(db, c.get('mailer'), hash, s.owner.email, c.get('pepper')).catch(() => undefined);
    return c.redirect('/mod', 303);
  }
  const r = await checkSecondFactor(db, hash, String(form['code'] ?? '').trim(), c.get('pepper'), c.get('pepperNext'));
  if (r !== 'ok') return c.html(page('Moderation — code', `<p class="warn">${r === 'expired' ? 'That code has expired or was used up. Send a new one.' : 'That code is not right.'}</p>${codeForm(s.owner.email)}`), 403);
  if (form['remember'] !== undefined) rememberDevice(c, s.owner.id, c.get('pepper'));
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

mod.post('/host-unhide', async (c) => {
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Moderation — refused', '<h1>Not the owner</h1>'), 403);
  const form = await c.req.parseBody();
  if (String(form['csrf'] ?? '') !== csrfFor(who.token)) return c.html(page('Moderation — refused', '<h1>Stale form</h1><p><a href="/mod">Back</a></p>'), 403);
  await setHostHidden(c.get('db'), String(form['feed'] ?? ''), String(form['id'] ?? ''), who.owner.id, false).catch(() => undefined);
  return c.redirect('/mod', 303);
});

mod.post('/takedown', async (c) => {
  const who = await ownerFromCookie(c);
  if (!who) return c.html(page('Moderation — refused', '<h1>Not the owner</h1>'), 403);
  const form = await c.req.parseBody();
  if (String(form['csrf'] ?? '') !== csrfFor(who.token)) return c.html(page('Moderation — refused', '<h1>Stale form</h1><p><a href="/mod">Back</a></p>'), 403);
  const id = String(form['id'] ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.redirect('/mod', 303);
  const db = c.get('db');
  const [s] = await markHostedShowDeleted(db, id);
  if (s) {
    const eps = await listHostedEpisodes(db, id);
    await finishTakedown(db, id, s.feed_url, who.owner.id);
    for (const e of eps) await c.get('storage').remove(e.audioUrl).catch(() => undefined);
  }
  return c.redirect('/mod', 303);
});

mod.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await deleteSessionByHash(c.get('db'), tokenHash(token, c.get('pepper')));
  deleteCookie(c, COOKIE, { path: '/mod' });
  return c.redirect('/mod', 303);
});

/** M25 SB: the second step after the password. The address is shown masked. */
function codeForm(email: string): string {
  const masked = email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => `${a}${'*'.repeat(Math.min(6, mid.length))}${b}`);
  return `<h1>Enter the code</h1><p class="muted">We emailed a six-digit code to ${esc(masked)}. It works for 10 minutes.</p><form method="post" action="/mod/code"><p><label>Code <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label></p><p><label><input type="checkbox" name="remember" value="1"> Remember this browser for 30 days</label></p><button class="btn" type="submit">Continue</button></form><form method="post" action="/mod/code"><input type="hidden" name="resend" value="1"><button type="submit">Send a new code</button></form>`;
}

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
    case 'comment': return `<blockquote>${str('body') || (str('voiceUrl') ? '<i>(voice)</i>' : '<i>(empty)</i>')}</blockquote>${str('voiceUrl') ? `<p><audio controls preload="none" src="${str('voiceUrl')}"></audio></p><p>Text of the voice: ${str('voiceText') || '<i>(no text)</i>'}</p>` : ''}${str('imageUrl') ? `<p><img src="${str('imageUrl')}" alt="The reported comment's image" style="max-width:320px;max-height:320px"></p>` : ''}<p class="muted">by ${str('authorName') || '?'} ${typeof o['offsetMs'] === 'number' ? `at ${mmss(o['offsetMs'] as number)} ` : ''}on “${str('episodeTitle')}”</p>`;
    case 'clip': return `<blockquote>${str('caption') || '<i>(no caption)</i>'}</blockquote><p class="muted">${typeof o['startMs'] === 'number' && typeof o['endMs'] === 'number' ? `${mmss(o['startMs'] as number)}–${mmss(o['endMs'] as number)} ` : ''}by ${str('authorName') || '?'} on “${str('episodeTitle')}”</p>`;
    case 'profile': return `<p>Profile <b>${str('displayName') || '?'}</b></p>`;
    case 'show': return `<p>Show <b>${str('showTitle') || '?'}</b> <code>${str('feedUrl')}</code></p>`;
    // M21 US2: an episode, or one transcript line with the listener's correction.
    case 'episode': return `<p>Episode <b>${str('episodeTitle') || '?'}</b> of ${str('showTitle') || '?'}</p>`;
    case 'transcript': return `<p>Transcript line ${typeof o['offsetMs'] === 'number' ? `at ${mmss(o['offsetMs'] as number)} ` : ''}on “${str('episodeTitle')}”</p><p class="muted">Says:</p><blockquote>${str('original') || '<i>(empty)</i>'}</blockquote><p class="muted">Should say:</p><blockquote>${str('suggested')}</blockquote>`;
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
