// M31 lane K: wave 7 (the entries no earlier wave reached) and the width captures (T105). See contact/wave-7/README.md and contact/widths/README.md.
// Width captures: the same fixture, every answer rewritten (setAnswerHook in scripts/capture-web.mjs) so names are long CJK / emoji / mixed
// and the counts are 0, 1 or 12 345 678. The routes are the ordinary ones (capture-web ROUTES), only the viewport changes.
export const LONG = {
  show: '晨間ノート：朝の習慣・コーヒー・最初の光についての、とても長い番組名 ☕🌅🎧 The Very Long Morning Notes Show',
  episode: '为什么早晨很重要？关于咖啡、窗外的第一缕光和不看手机的四十八分钟 🌅☕📵 Why mornings matter, really',
  author: '山田太郎・アナ・ルイス & Мария Иванова 👩🏽‍🎤',
  name: '李小龍と仲間たち🎉🎉 Rui the Very Long Name',
  body: '这是每天早上我都会重听的那一段，真的太好听了！！🎧🎧🎧 the part I replay every morning, with the window open and the kettle on 😭✨',
};
const NAME_KEYS = /^(displayName|name|author|initials)$/;
const COUNT_KEYS = /^(listeners|listened|reactions|likes|likeCount|replyCount|subscribers|listeningNow|count|episodeCount|commentCount|comments|followers|following|unread|mutual|plays|saves)$/;
const MAPS = /^(counts|listeners)$/;
const NAMES = new Set(['Rui', 'Ana', 'Jo', 'Aisha', 'Mei', 'Mei Lin', 'Kai', 'Lin Wei', 'Ana Ruiz']);
/** transform(N): N = the count every count-like number becomes (0, 1, 12345678). */
export function widthTransform(N) {
  const str = (s) => s.replaceAll('Why mornings matter', LONG.episode).replaceAll('Morning Notes', LONG.show);
  const walk = (v, key, parentKey) => {
    if (typeof v === 'string') { if (key === 'xml') return str(v); if (NAME_KEYS.test(key ?? '') && NAMES.has(v)) return v === 'Lin Wei' ? LONG.author : LONG.name; if ((key === 'body' || key === 'text') && v.length > 3 && v.length < 120) return LONG.body; return str(v); }
    if (typeof v === 'number') return (COUNT_KEYS.test(key ?? '') || MAPS.test(parentKey ?? '')) && !/Ms$/.test(key ?? '') ? N : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key, parentKey));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k, key)]));
    return v;
  };
  return (_u, fx) => walk(fx, undefined, undefined);
}

const KEY10 = ['moments', 'player', 'episode', 'show', 'comments', 'search-all', 'me', 'updates', 'player-playback', 'empty'];
const ALIAS = { updates: 'library--screen' };
export const SIZES = { '320': { width: 320, height: 568 }, '430': { width: 430, height: 932 } };
/** jobs: the 10 key screens at both widths with long names + 12 345 678; the count 0 and 1 sets at 320 for the screens that print counts. */
export function WIDTH_ROUTES(only) {
  const pick = (only ? only.split(',') : KEY10);
  const jobs = [];
  for (const [w, vp] of Object.entries(SIZES)) for (const n of pick) jobs.push({ file: `${n}-${w}-big-build.png`, name: ALIAS[n] ?? n, viewport: vp, hook: widthTransform(12345678) });
  if (!only) for (const [lab, N] of [['zero', 0], ['one', 1]]) for (const n of ['moments', 'player', 'episode', 'comments', 'me', 'updates']) jobs.push({ file: `${n}-320-${lab}-build.png`, name: ALIAS[n] ?? n, viewport: SIZES['320'], hook: widthTransform(N) });
  return jobs;
}

// ================= Wave 7: the inventory entries no earlier wave reached (T092) =================
// DESIGNS rows: [capture name = the drawing's entry id, drawing page, entry id, phone index]. Routes borrow an older route's fixture (`fixAs`),
// fail or hang chosen calls (`faults7`) and rewrite an answer (`patch`); see fixture() in scripts/capture-web.mjs. Web build only; not a device.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../../specs/033-m31-redesign/design-pulse2/data');
const PAGE = {}; for (const f of ['discover', 'listen', 'settings', 'shell', 'social']) for (const e of JSON.parse(readFileSync(path.join(DATA, `${f}.json`), 'utf8'))) PAGE[e.name] = `${f}.html`;
let H = null;
export function initW7(h) { H = h; }
const B = (n) => H.ROUTES[n].steps;
const E = () => H.card(0).id;
const clip = () => { try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {}, readText: async () => '' }, configurable: true }); } catch {} };  // a headless page refuses the clipboard write that raises "Copied."
const MORE = ['labelNth', [/^More for this comment/, 1]];
const slow = (...p) => p.map((x) => ({ path: x, mode: 'slow' }));
const fail = (...p) => p.map((x) => ({ path: x, mode: 'fail' }));
const noThread = (u, m, base) => (/\/thread$/.test(u.pathname) ? { ...base, replies: [] } : undefined);
const noComments = (u, m, base) => (/\/social$/.test(u.pathname) ? { ...base, comments: [], heat: { ...base.heat, available: false } } : undefined);
const hostExtras = (u, m, base) => (u.pathname === '/v1/shows/extras' ? { ...base, hosts: [{ id: 'demo-1', name: 'Mei Lin', avatarUrl: null }] } : undefined);
const gate = (steps) => [...steps, ['back']];   // a signed-out visitor is sent to the welcome screen; one step back lands on the page the drawing shows (as in waves 2-6)

export const WAVE7_ROUTES = {
  // player
  'player--sleep-timer-sheet': { fixAs: 'player', get steps() { return [...B('player'), ['label', /^Sleep timer/], ['wait', 1200]]; } },
  'player--playback-more-settings': { fixAs: 'player', get steps() { return [...B('player'), ['label', /^Speed .*sleep timer/], ['wait', 1200], ['label', /^More settings/], ['wait', 1200]]; } },
  'player--clip-last-30-seconds': { fixAs: 'player', get steps() { return [...B('player'), ['label', /^Clip the last 30 seconds/], ['wait', 1800]]; } },
  'player--moment-sheet': { fixAs: 'player', get steps() { return [...B('player'), ['label', /^(Comment at |\d+ comments at )/], ['wait', 1500]]; } },
  'moment-sheet--player-marker': { fixAs: 'player', get steps() { return [...B('player'), ['label', /^(Comment at |\d+ comments at )/], ['wait', 1500]]; } },
  'player--nothing-playing': { fixAs: 'home', steps: [['goto', '/player'], ['wait', 2500]] },
  'player--episode-end-offer': { fixAs: 'player', get steps() { return [...B('player'), ['ended'], ['wait', 2200]]; } },
  'toast--share-chooser': { fixAs: 'player', init: [clip], get steps() { return [...B('player'), ['label', /^Share/], ['wait', 1000], ['tap', 'Copy link'], ['wait', 700]]; } },
  // comments
  'comments--empty': { fixAs: 'comments', patch: noComments, get steps() { return B('comments'); } },
  'comments--host': { fixAs: 'comments', patch: hostExtras, get steps() { return B('comments'); } },
  'comments--comment-menu-host': { fixAs: 'comments', patch: hostExtras, get steps() { return [...B('comments'), MORE, ['wait', 1000]]; } },
  'comments--signed-out': { fixAs: 'comments', signedOut: true, get steps() { return gate([['goto', `/comments/${E()}`], ['wait', 3000]]); } },
  'comments--comment-menu-signed-out': { fixAs: 'comments', signedOut: true, get steps() { return [...gate([['goto', `/comments/${E()}`], ['wait', 3000]]), MORE, ['wait', 1000]]; } },
  'comments--reply-composer': { fixAs: 'comments', get steps() { return [...B('comments'), MORE, ['wait', 800], ['textLast', 'Reply'], ['wait', 1200]]; } },
  'comments--toast': { fixAs: 'comments', init: [clip], get steps() { return [...B('comments'), MORE, ['wait', 800], ['tap', 'Copy'], ['wait', 700]]; } },
  'comments--voice-toast': { fixAs: 'comments', get steps() { return [...B('comments'), ['label', /^(Record|Voice)/], ['wait', 900], ['label', /^Stop recording/], ['wait', 900]]; } },
  // comment thread
  'comment-thread--empty': { fixAs: 'comments-replies', patch: noThread, get steps() { return B('comments-replies'); } },
  'comment-thread--comment-menu': { fixAs: 'comments-replies', get steps() { return [...B('comments-replies'), MORE, ['wait', 1000]]; } },
  'comment-thread--toast': { fixAs: 'comments-replies', init: [clip], get steps() { return [...B('comments-replies'), MORE, ['wait', 800], ['tap', 'Copy'], ['wait', 700]]; } },
  'comment-thread--signed-out': { fixAs: 'comments-replies', signedOut: true, get steps() { return gate([['goto', `/comments/thread/w2?episodeId=${E()}`], ['wait', 3000]]); } },
  'comment-thread--load-failed': { fixAs: 'comments-replies', get faults7() { return [{ path: /\/(social|thread)$/, mode: 'fail' }]; }, get steps() { return [['goto', `/comments/thread/w2?episodeId=${E()}`], ['wait', 3000]]; } },
  // home (Discover)
  'home--loading': { fixAs: 'discover', faults7: slow('/v1/discover', '/v1/for-you'), steps: [['goto', '/'], ['wait', 1200], ['label', /^Discover$/], ['wait', 900]] },
  'home--offline': { fixAs: 'discover', faults7: [{ path: '/v1/discover', mode: 'abort' }, { path: '/v1/for-you', mode: 'abort' }], steps: [['goto', '/'], ['wait', 2500], ['label', /^Discover$/], ['wait', 1500]] },
  'home--signed-out': { fixAs: 'discover', signedOut: true, steps: gate([['goto', '/'], ['wait', 3000]]) },
  'home--new-account': { fixAs: 'discover', patch: (u, m, base) => (u.pathname === '/v1/for-you' ? { ...base, items: [] } : undefined), get steps() { return B('discover'); } },
  'home--search-overlay': { fixAs: 'discover', get steps() { return [...B('discover'), ['label', /^Search/], ['wait', 1500]]; } },
  'home--not-interested-sheet': { fixAs: 'discover', get steps() { return [...B('discover'), ['label', /^More for Why mornings matter/], ['wait', 1200]]; } },
  'home--hidden-undo': { fixAs: 'discover', get steps() { return [...B('discover'), ['label', /^More for Why mornings matter/], ['wait', 900], ['tap', 'Not interested in this episode'], ['wait', 1200]]; } },
};
/** Batch 2: another entry's route (its steps, sign-in state and seed) with a fault or a patch. */
const like = (alias, extra = {}) => Object.defineProperties({ fixAs: alias, get steps() { return B(alias); }, get signedOut() { return H.ROUTES[alias].signedOut; }, get seed() { return H.ROUTES[alias].seed; } }, Object.getOwnPropertyDescriptors(extra));  // keeps getters in `extra` (a spread would run them at load)
Object.assign(WAVE7_ROUTES, {
  'lists--screen': { fixAs: 'home', steps: [['goto', '/lists'], ['wait', 2500]] },
  'lists-new--screen': { fixAs: 'home', steps: [['goto', '/lists/new'], ['wait', 2500]] },
  'lists-new--signed-out': { fixAs: 'home', signedOut: true, steps: gate([['goto', '/lists/new'], ['wait', 3000]]) },
  'lists--gone': { fixAs: 'home', steps: [['goto', '/lists/no-such-list'], ['wait', 2500]] },
  'toast--lists-new': { fixAs: 'home', faults7: fail('/v1/me/shared-lists'), steps: [['goto', '/lists/new'], ['wait', 2500], ['textLast', 'Share a link'], ['wait', 900]] },
  'notifications--feed-offline': like('notifications', { faults7: [{ path: '/v1/me/feed', mode: 'abort' }, { path: '/v1/me/notifications', mode: 'abort' }] }),
  'notifications--interactions-error': like('notifications-interactions', { faults7: fail('/v1/me/notifications', '/v1/me/interactions') }),
  'notifications--interactions-signed-out': like('notifications-signed-out'),
  'notifications-hosts--load-failed': like('notifications-hosts', { faults7: fail('/v1/me/notifications', '/v1/me/host-notifications') }),
  'notifications-hosts--signed-out': like('notifications-signed-out'),
  'profile-followers--load-failed': like('profile-followers', { faults7: [{ path: /\/followers$/, mode: 'fail' }] }),
  'profile-followers--other-empty': like('profile-followers-empty'),
  'profile-following--own-empty': like('profile-followers-empty'),
  'profile-likes--load-failed': like('profile-likes', { faults7: [{ path: /\/likes/, mode: 'fail' }] }),
  'profile-edit--load-failed': like('profile-edit', { faults7: fail('/v1/me') }),
  'stickers--signed-out': like('stickers-none', { signedOut: true }),
  'stickers-decorate--signed-out': like('stickers-decorate', { signedOut: true }),
  'stickers-decorate--chosen': like('stickers-decorate'),
  'likes--loading': like('likes', { faults7: slow('/v1/me/likes') }),
  'chat-new--load-failed': like('chat-new', { faults7: fail('/v1/me/chats/friends') }),
  'chat-thread--toast': like('chat-thread', { faults7: [{ path: /\/v1\/me\/chats\/[^/]+$/, mode: 'fail' }] }),
  'toast--like': like('like', { faults7: [{ path: /reactions$/, mode: 'fail' }] }),
  'toast--playlist': like('playlist-delete'),
});
// Also tried 2026-10-28 and NOT kept (routes removed, see the README): toast--picture-viewer (no toast on the web: Save is native), toast--playback-store (a dead audio address gives a spinner, no toast), toast--settings-appearance (the web page has no icon list).
// Tried 2026-10-28 and NOT kept (the picture did not show the drawn state; reasons in contact/wave-7/README.md): removed so the wave list holds only real captures.
for (const k of ['lists--screen', 'toast--lists-new', 'notifications-hosts--load-failed', 'notifications-hosts--signed-out', 'profile-following--own-empty', 'stickers--signed-out', 'stickers-decorate--signed-out', 'stickers-decorate--chosen', 'toast--like', 'toast--playlist', 'chat-thread--toast', 'player--episode-end-offer', 'comments--voice-toast']) delete WAVE7_ROUTES[k];
// ================= Batch 3 (T104, 2026-10-28) =================
// KIT: the 8 inventory entries design-pulse2 draws no entry for. Rule (designer of design-pulse2, 2026-10-28): an undrawn sheet / toast / dialog / error built only
// from drawn kit parts follows the kit. The design column is the drawn kit part that matches ([page, entry id]); the build must look like it, nothing is compared word by word.
export const KIT = {
  'clip--card-menu': ['listen.html', 'episode--card-sheet', 'ActionSheet'],
  'clip--menu': ['listen.html', 'episode--card-sheet', 'ActionSheet'],
  'downloads--item-menu': ['listen.html', 'episode--card-sheet', 'ActionSheet'],
  'comments--moment-like-toast': ['listen.html', 'toast--card-sheet', 'Toast'],
  'toast--episode-sheet-body': ['listen.html', 'toast--card-sheet', 'Toast'],
  'toast--moment-actions': ['listen.html', 'toast--card-sheet', 'Toast'],
  'moments-feed--switch-dialog': ['listen.html', 'player--queue-clear-dialog', 'Dialog'],
  'search--moments-error': ['shell.html', 'states--error-inline', 'error block'],
  'tabs--bar': ['index.html', 'barsdemo', 'Bars'],  // not a kit-rule entry: the bars are drawn in index.html section 2 (the first phone), no inventory name
};
const re = (r) => r;
Object.assign(WAVE7_ROUTES, {
  'clip--menu': like('clip', { steps: [['goto', '/clip/c1'], ['wait', 3000], ['label', /^More for this clip/], ['wait', 2000]] }),
  'clip--card-menu': like('episode', { get steps() { return [...B('episode'), ['hold', /^Clip 12:02/], ['wait', 1000]]; } }),
  'downloads--item-menu': like('downloads', { get steps() { return [['goto', '/downloads'], ['wait', 3000], ['hold', /^Open Why mornings matter, Downloaded/], ['wait', 1000]]; } }),
  'search--moments-error': like('search-moments', { faults7: fail('/v1/discover/moments'), get steps() { return B('search-moments'); } }),
  'toast--episode-sheet-body': like('episode-more-playlist', { signedOut: true, get steps() { return [...gate([['goto', `/episode/${E()}`], ['wait', 3000]]), ['label', /^More: play next/], ['wait', 900], ['label', /^Add to playlist/], ['wait', 900]]; } }),
  'comments--moment-like-toast': { fixAs: 'player', faults7: [{ path: /\/like$/, mode: 'fail' }, { path: /\/reactions$/, mode: 'fail' }], get steps() { return [...B('player'), ['label', /^(Comment at |\d+ comments at )/], ['wait', 1500], ['label', /^Like\./], ['wait', 600]]; } },
  'toast--moment-actions': { fixAs: 'moments', faults7: [{ path: '/v1/social', mode: 'fail' }, { path: /reactions$/, mode: 'fail' }], get steps() { return [...B('moments'), ['label', /^React at/], ['wait', 900]]; } },
  'moments-feed--switch-dialog': { fixAs: 'moments', get steps() { return [...B('player'), ['label', /^Close the player/], ['wait', 1200], ['label', /^Back$/], ['wait', 1500], ['wait', 1500], ['jsLabel', /^Moments$/], ['wait', 2000], ['label', /^Sound off/], ['wait', 1200]]; } },
});
const at3 = (path, wait = 3000) => [['goto', path], ['wait', wait]];
Object.assign(WAVE7_ROUTES, {
  // status (12 entries the first waves skipped)
  'status--report-sheet': like('status-more', { get steps() { return [...B('status-more'), ['tap', 'Report this status'], ['wait', 1200]]; } }),
  'status--reply-composer': like('status', { get steps() { return [...B('status'), ['typeLabel', ['Reply to this status', 'Nice one']], ['wait', 700]]; } }),
  'status-replies--toast': like('status', { get steps() { return [...B('status'), ['typeLabel', ['Reply to this status', 'Nice one']], ['wait', 500], ['label', /^Send reply/], ['wait', 600]]; } }),
  'status--toast': like('status-more', { get steps() { return [...B('status-more'), ['tap', 'Stop suggesting'], ['wait', 600]]; } }),
  'status-text--toast': like('status-text', { get steps() { return [...at3('/status/text'), ['fillText', 'Listening to something good'], ['label', /^Post/], ['wait', 600]]; } }),
  // voice
  'voice-new--add-episode-sheet': like('voice-new', { nomini: true, get steps() { return [...at3('/voice/new'), ['label', /^Add episode/], ['wait', 1200]]; } }),
  'voice-new--toast': like('voice-new', { nomini: true, get steps() { return [...at3('/voice/new'), ['label', /^Start recording/], ['wait', 2600], ['label', /^(Stop recording|Recording)/], ['wait', 900], ['label', /^Post/], ['wait', 600]]; } }),
  // stickers
  'stickers--signed-out': like('stickers-none', { signedOut: true, get steps() { return gate(at3('/stickers')); } }),
  'stickers-decorate--signed-out': like('stickers-decorate', { signedOut: true, get steps() { return gate(at3('/stickers/decorate')); } }),
  'stickers-decorate--chosen': like('stickers-decorate', { get steps() { return [...at3('/stickers/decorate'), ['label', /^Put First hour/], ['wait', 800]]; } }),
  'stickers-decorate--toast': like('stickers-decorate', { get steps() { return [...at3('/stickers/decorate'), ['label', /^Put First hour/], ['wait', 600], ['label', /^Save/], ['wait', 600]]; } }),
  // episode
  'like-sheet--episode': like('episode', { get steps() { return [...B('episode'), ['label', /^Like this episode/], ['wait', 1200]]; } }),
  'player--episode-end-offer': like('player', { shortAudio: true, patch: (u, m, base) => (/\/next-up$/.test(u.pathname) ? { items: [{ episode: H.card(1), reason: 'alsoListened', label: 'Listeners also played' }], computedAt: new Date(H.NOW).toISOString() } : undefined), init: [() => { window.__realClock = true; }], get steps() { return [...B('player'), ['wait', 14000]]; } }),
  // lists, playlists, moments
  'toast--playlist': like('playlist-delete', { get steps() { return [...B('playlist-delete'), ['tap', 'Delete'], ['wait', 500]]; } }),
  'toast--lists-new': { fixAs: 'library--screen', mini: false, faults7: fail('/v1/me/shared-lists'), steps: [['goto', '/lists/new'], ['wait', 2500], ['label', /^Morning Notes$/], ['label', /^Night Shift Radio$/], ['wait', 400], ['jsLabel', /^Share a link/], ['wait', 900]] },
  'toast--moments': like('moments-saved', { get seed() { const b = H.ROUTES['moments-saved'].seed; const l = JSON.parse(b['me.moments']); return { ...b, 'me.moments': JSON.stringify([{ id: 'mx', episodeId: 'deadbeefdeadbeef', atMs: 180000, note: 'gone from the feed', savedAt: H.NOW - 60000 }, ...l]) }; }, get steps() { return [...B('moments-saved'), ['label', /^Play .* from 3:00/], ['wait', 700]]; } }),
  // notifications, profile, home, me
  'notifications--toast': like('notifications-mute', { get steps() { return [...B('notifications-mute'), ['tap', 'Mute this'], ['wait', 600]]; } }),
  'notifications-hosts--signed-out': like('notifications-hosts', { signedOut: true, get steps() { return gate(at3('/notifications/hosts')); } }),
  'notifications-hosts--load-failed': like('notifications-hosts', { faults7: [{ path: '/v1/me/host-notices', mode: 'fail' }] }),
  'profile-edit--toast': like('profile-edit', { get steps() { return [...B('profile-edit'), ['typeLabel', ['Name', 'Jayden K']], ['wait', 400], ['jsLabel', /^Save/], ['wait', 600]]; } }),
  'me--wallet-coming-soon': like('me', { get steps() { return [...B('me'), ['label', /^Wallet/], ['wait', 1000]]; } }),
  'home--hidden-categories': like('discover', { get steps() { return [...B('discover'), ['scroll', 1500], ['label', /^Hide /], ['wait', 900]]; } }),
  'chat-thread--toast': like('chat-thread', { faults7: [{ method: 'POST', path: /\/v1\/me\/chats\/[^/]+$/, mode: 'fail' }], get steps() { return [...B('chat-thread'), ['typeLabel', ['Message', 'Hello']], ['label', /^Send/], ['wait', 600]]; } }),
});
const imgOn = (u, m, base) => (/\/social$/.test(u.pathname) ? { ...base, comments: base.comments.map((c, i) => (i === 0 ? { ...c, image: { url: 'https://img.example.test/art-b.png', w: 600, h: 400 } } : c)) } : undefined);
const held = (u, m, base) => (m === 'POST' && /\/episodes\/[^/]+\/comments$/.test(u.pathname) ? { comment: { id: 'cheld', authorId: 'demo-1', displayName: 'Jayden', body: 'Hello', offsetMs: null, parentId: null, createdAt: new Date(H.NOW).toISOString(), deleted: false, held: true } } : undefined);
Object.assign(WAVE7_ROUTES, {
  // comments
  'comments--picture-full-size': like('comments', { patch: imgOn, get steps() { return [...B('comments'), ['label', /^The picture in this comment/], ['wait', 1200]]; } }),
  'comments--composer-toast': like('comments', { patch: held, get steps() { return [...B('comments'), ['label', /^Write a comment/], ['wait', 1000], ['fillText', 'Hello'], ['label', /^Post/], ['wait', 800]]; } }),
  'comments--voice-toast': like('comments', { get steps() { return [...B('comments'), ['label', /^Record a voice comment/], ['wait', 600], ['label', /^(Stop recording|Stop and post)/], ['wait', 700]]; } }),
  'comments--community-rules-voice': like('comments', { patch: (u, m) => (m === 'POST' && /\/comments\/voice$/.test(u.pathname) ? { __status: 428, error: { code: 'rules_required', message: 'Accept the rules' } } : undefined), get steps() { return [...B('comments'), ['label', /^Record a voice comment/], ['wait', 2200], ['label', /^Stop and post/], ['wait', 1500]]; } }),
  // show, subscriptions, library
  'toast--show-page': like('show--screen', { init: [clip], get steps() { return [...B('show--screen'), ['label', /^Share this show/], ['wait', 900], ['tap', 'Copy link'], ['wait', 600]]; } }),
  'toast--show-info': like('show-info--screen', { init: [clip], get steps() { return [...B('show-info--screen'), ['label', /^Copy the feed address/], ['wait', 600]]; } }),
  'toast--subscriptions': like('subscriptions--screen', { signedOut: true, get steps() { return [...gate(at3('/subscriptions')), ['label', /^Share my list/], ['wait', 600]]; } }),
  'toast--subscriptions-manage': like('subscriptions-manage--screen', { get steps() { return [...B('subscriptions-manage--screen'), ['label', /^Save order/], ['wait', 600]]; } }),
  'toast--library': like('library--screen', { get steps() { return [...B('library--screen'), ['label', /^Add .* to the queue/], ['wait', 600]]; } }),
  'toast--episode-extras': like('library--save-moment', { get steps() { return [...B('library--save-moment'), ['tap', 'Save moment'], ['wait', 700]]; } }),
  'states--inbox-empty': like('library--empty'),
  // profile
  'follow-button--toast': like('profile--screen', { faults7: [{ method: 'POST', path: /\/follow$/, mode: 'fail' }, { method: 'DELETE', path: /\/follow$/, mode: 'fail' }, { method: 'PUT', path: /\/follow$/, mode: 'fail' }], get steps() { return [...B('profile--screen'), ['label', /^Follow$/], ['wait', 700]]; } }),
  'profile--block-dialog-from-blocked-page': like('profile--blocked', { get steps() { return [...B('profile--blocked'), ['tap', 'Unblock Rui Costa'], ['wait', 1500], ['tap', 'More actions for Rui Costa'], ['wait', 900], ['tap', 'Block Rui Costa'], ['wait', 1000]]; } }),
  'profile-subscriptions--empty': like('profile-subscriptions', { patch: (u, m, base) => (/subscriptions/.test(u.pathname) && u.pathname.startsWith('/v1') ? { ...base, items: [], shows: [], subscriptions: [] } : undefined) }),
});
const listAnswer = (u, m, base) => (/^\/v1\/lists\/[^/]+$/.test(u.pathname) ? { id: 'w7', title: 'Slow mornings', owner: { id: 'u-rui', displayName: 'Rui Costa' }, shows: H.SHOWS.map((s) => ({ feedUrl: s.feedUrl, title: s.title, imageUrl: s.imageUrl })) } : undefined);
Object.assign(WAVE7_ROUTES, {
  'lists--screen': { fixAs: 'home', patch: listAnswer, steps: [['goto', '/lists/w7'], ['wait', 2800]] },
  'lists--more-sheet': { fixAs: 'home', patch: listAnswer, steps: [['goto', '/lists/w7'], ['wait', 2800], ['label', /^More for this list/], ['wait', 1200]] },
  'profile-following--own-empty': like('profile-followers-empty', { steps: [['goto', '/profile/demo-1/following'], ['wait', 3000]] }),
});
Object.assign(WAVE7_ROUTES, {
  'toast--like': like('like', { faults7: [{ method: 'PUT', path: /reactions$/, mode: 'fail' }, { method: 'POST', path: /reactions$/, mode: 'fail' }, { method: 'DELETE', path: /reactions/, mode: 'fail' }], get steps() { return [...B('like'), ['label', /^React with 👍/], ['wait', 700]]; } }),
  'tabs--bar': like('library--screen'),
});
export const DESIGNS_W7 = Object.keys(WAVE7_ROUTES).map((n) => (KIT[n] ? [n, KIT[n][0], KIT[n][1], 0] : [n, PAGE[n] ?? 'social.html', n, 0]));
export const ROUTES_W7 = WAVE7_ROUTES;
