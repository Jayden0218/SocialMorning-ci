// M31 wave 6 + wave 5b (lane CAP6): the rest of the shell group (data/shell.json: appeal, maintenance, creator, wallet, tips, gift, redeem,
// favourites, scan, transcript, the shared states ...) and the screens wave 5 deferred (Updates tab, Subscriptions, Show, Profile, Category,
// the Their-likes deck) beside their drawings. Same shape as capture-w5.mjs: capture-web.mjs imports DESIGNS_W6 / DESIGNS_W5B / ROUTES_W6 /
// answerW6 / seedW6. Web build only; not a device. The drawings' sample data is seeded here (the words each drawing prints), never invented for the app.
// DESIGNS rows: [capture name = the drawing's entry id, drawing page, entry id, phone index inside the entry].
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseStores, EPS, CAT, feedUrlOf, DAY, HOUR, answerW34 } from './capture-w34.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../../specs/033-m31-redesign/design-pulse2/data');
const entries = (f) => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
const ENTRY0 = new Map([...entries('settings.json'), ...entries('discover.json'), ...entries('shell.json'), ...entries('listen.json'), ...entries('social.json')].map((e) => [e.name, e]));

/** A capture name -> its drawing entry (the same, except `show--hot-moments` = the second phone of show--screen). */
const ENTRY = { get: (n) => ENTRY0.get(n === 'show--hot-moments' ? 'show--screen' : n) };

/** Entries with no web equivalent (system alert, hand-off to another app, clipboard) or without steps: listed as "not captured". */
export const NATIVE_W6 = {
  'creator--system-share': 'iOS share sheet over the Creator centre (system UI)',
  'permission--notifications': 'iOS notification permission alert (system UI)',
  'permission--speech-recognition': 'iOS speech-recognition permission alert (system UI)',
  'permission--microphone': 'iOS microphone permission alert (system UI)',
  'permission--microphone-denied': 'needs the iOS microphone alert answered Don’t Allow (system UI)',
  'scan--camera-prompt': 'iOS camera permission alert (system UI); the web build asks through the browser, which the capture answers by itself',
  'toast--transcript': 'the clipboard write that raises "Copied." is blocked in a headless page (the entry says NOT_CAPTURABLE)',
  'data-prompt--sheet': 'Play on mobile data? needs a cellular connection state; the web build has none (the entry has no steps)',
  'inbox--redirect': 'a route map (/inbox to /library), no screen of its own (the entry has no steps)',
  'states--inbox-empty': 'the entry has no steps (an Updates tab with nothing new)',
  'system--opens-another-app': 'hand-off to another app (no steps, system UI)',
  'show--share-system-sheet': 'iOS share sheet (system UI)',
  'show--share-whatsapp-handoff': 'hand-off to WhatsApp / the browser',
  'subscriptions--share-system-sheet': 'iOS share sheet (system UI)',
  'show--paid-episodes-and-tips': 'NOT_CAPTURABLE in the drawing data (needs a paid show and store products)',
  'toast--appeal-failed': 'n/a',
};
delete NATIVE_W6['toast--appeal-failed'];

const S = (name, file) => [name, file, name, 0];
const SHELL6 = ['appeal--screen', 'appeal--nothing-to-appeal', 'appeal--signed-out', 'toast--appeal', 'maintenance--screen',
  'creator--screen', 'creator--signed-out', 'creator--host-proven', 'creator--code-pending', 'creator--code-not-found', 'creator--share-code-panel',
  'wallet--screen', 'wallet--plus', 'wallet--signed-out', 'tips--screen', 'gift--screen', 'gift--signed-out', 'gift--not-found', 'toast--gift',
  'redeem--screen', 'redeem--bad-code', 'favourites--screen', 'favourites--empty', 'favourites--comments-empty', 'me-listening--all-time',
  'scan--screen', 'scan--camera-denied', 'scan--camera-preview', 'transcript--screen', 'error-boundary--screen',
  'states--library-empty', 'states--queue-empty', 'states--downloads-empty', 'states--followers-empty', 'states--following-empty', 'states--clips-empty',
  'states--comments-empty', 'states--heat-empty', 'states--nextup-empty', 'states--stats-empty', 'states--search-empty', 'states--library-manage-empty',
  'states--feed-offline', 'states--loading-page', 'states--loading-inline', 'states--error-page', 'states--error-inline'];
export const DESIGNS_W6 = SHELL6.map((n) => S(n, 'shell.html'));

const UPD5B = ['library--screen', 'library--signed-out', 'library--empty', 'library--more-sheet', 'library--add-to-playlist', 'library--save-moment', 'library--starred-row'];
const SUBS5B = ['subscriptions--screen', 'subscriptions--grid', 'subscriptions--empty', 'subscriptions--show-menu', 'subscriptions-manage--screen', 'subscriptions-manage--empty'];
const SHOW5B = ['show--search', 'show--menu-sheet', 'show--episode-row-sheet', 'show-info--screen', 'show-info--loading', 'show-info--error'];
const PROF5B = ['profile--screen', 'profile--own', 'profile--signed-out', 'profile--host', 'profile--stats-empty', 'profile--suspended', 'profile--load-failed',
  'profile--more-sheet', 'profile--block-dialog', 'profile--blocked', 'profile--report-sheet', 'profile--toast'];
export const DESIGNS_W5B = [
  ...UPD5B.map((n) => S(n, 'discover.html')),
  ...SUBS5B.map((n) => S(n, 'listen.html')),
  S('show--screen', 'listen.html'), ['show--hot-moments', 'listen.html', 'show--screen', 1], ...SHOW5B.map((n) => S(n, 'listen.html')),
  ...PROF5B.map((n) => S(n, 'social.html')),
  S('category--screen', 'discover.html'), S('category--all-sheet', 'discover.html'),
  ['discover-fold-likes-deck', 'discover.html', 'home--fold-a', 0],   // the Their likes deck (wave 2 had it as build-only evidence at the fold-a scroll)
];

/** Set by capture-web.mjs (initW6). */
let H = null;
export function initW6(helpers) { H = helpers; }
const NAME6 = new Set([...DESIGNS_W6, ...DESIGNS_W5B].map((d) => d[0]));
NAME6.delete('discover-fold-likes-deck');   // that route belongs to wave 2 (its fixture answers it)
export const isW6 = (n) => NAME6.has(n);

// ---- steps ----
const enc = encodeURIComponent;
const idOf = (t) => EPS()[t].id;
const OPEN_FILL = () => ({ '{show}': enc(H.FEED), '{episode}': idOf('Why mornings matter'), '{episode2}': idOf('Rain on tin'), '{user}': 'u-rui', '{me}': 'demo-1', '{host}': 'u-lena',
  '{suspended_user}': 'u-sus', '{user_private}': 'u-priv', '{user_nosubs}': 'u-nosubs', '{owner}': 'u-owner', '{category}': '1321', '{gift}': 'gift1', '{issue}': 'i12' });
const TAP_FILL = { '{episode}': 'Why mornings matter', '{show}': 'Field Recordings', '{show-title}': 'Morning Notes', '{user_name}': 'Rui Costa', '{owner_name}': 'the app owner', '{category}': 'Business' };
const subWith = (s, map) => Object.entries(map).reduce((a, [k, v]) => a.replaceAll(k, v), s);
function stepsOf(name) {
  const e = ENTRY.get(name);
  const open = OPEN_FILL();
  return e.steps.flatMap((s) => {
    if (s.open) return [['goto', subWith(s.open, open)], ['wait', 2800]];
    if (s.tap) return [['tap', subWith(s.tap, TAP_FILL)], ['wait', 900]];
    if (s.type) return [['typeLabel', [s.type, s.text]], ['wait', 300]];
    if (s.key) return [['press', s.key]];
    return [];
  });
}
const faultsOf = (name) => ENTRY.get(name).steps.filter((s) => s.fault && s.fault.mode !== 'off').map((s) => s.fault);
const asOf = (name) => ENTRY.get(name)?.as;
const AS = { email: 'ruitanai@example.com', name: 'Rui Tanaka' };

const OVR = {};
const ROUTES = {};
export const ROUTES_W6 = ROUTES;
function route(name) {
  const a = asOf(name);
  const r = { get steps() { return stepsOf(name); }, faults: faultsOf(name), authName: AS.name, authEmail: AS.email };
  if (a === 'visitor' || a === 'suspended') r.signedOut = true;
  if (a === 'new') r.fresh = true;
  if (a === 'plus') r.plus = true;
  if (a === 'host') r.host = true;
  if (OVR[name]) Object.defineProperties(r, Object.getOwnPropertyDescriptors(OVR[name]));
  return r;
}

const at = (p, wait = 2800) => [['goto', p], ['wait', wait]];
const jsonList = (a) => JSON.stringify(a);
const nSubs = (n) => () => baseStores().subs.slice(0, n);
const epPath = (t) => `/episode/${idOf(t)}`;

// ---- seeds that several screens share ----
const FAVS6 = () => { const E = EPS(); const NOW = H.NOW; return { 'me.favourites': jsonList(['Why mornings matter', 'Cities that sleep late', 'Rain on tin', 'The slow commute', 'Bread at 5 a.m.', 'Bread, slowly'].map((t, i) => ({ episodeId: E[t].id, at: NOW - (i + 1) * DAY }))), 'me.favComments': jsonList([{ commentId: 'f1', episodeId: E['Why mornings matter'].id, body: 'This is the part I replay every morning.', author: 'Rui', offsetMs: 872000, at: NOW - 5 * HOUR }, { commentId: 'f2', episodeId: E['The long walk home'].id, body: 'The rain sound at the end. Perfect.', author: 'Aisha', offsetMs: 1870000, at: NOW - 2 * DAY }, { commentId: 'f3', episodeId: E['Bread, slowly'].id, body: 'Start here.', author: 'Tom', offsetMs: 400000, at: NOW - 3 * DAY }]) }; };
const SUBS_CREATOR = () => ['morning-notes', 'night-shift-radio', 'field-recordings', 'slow-places'].map((s) => ({ feedUrl: s === 'morning-notes' ? H.FEED : feedUrlOf(s) }));

Object.assign(OVR, {
  'appeal--screen': { noBack: true, seed: { 'safety.appealToken': 'tok' }, steps: [...at('/appeal'), ['back'], ['fillText', 'Please look again. I was quoting the host at 14:32, not insulting anyone.'], ['wait', 400]] },
  'appeal--nothing-to-appeal': { signedOut: false },
  'appeal--signed-out': { signedOut: true },
  'toast--appeal': { noBack: true, signedOut: true, seed: { 'safety.appealToken': 'tok' }, steps: [...at('/appeal'), ['back'], ['fillText', 'Please look again.'], ['tap', 'Send appeal'], ['wait', 900]] },
  'maintenance--screen': { signedOut: false, steps: [['goto', '/'], ['wait', 3500]] },
  'creator--screen': { get stores() { return { subs: SUBS_CREATOR() }; } },
  'tips--screen': { steps: at('/tips', 4500) },
  'creator--signed-out': { signedOut: true },
  'creator--host-proven': { get stores() { return { subs: SUBS_CREATOR() }; } },
  'creator--code-pending': { get stores() { return { subs: SUBS_CREATOR() }; } },
  'creator--code-not-found': { get stores() { return { subs: SUBS_CREATOR() }; } },
  'creator--share-code-panel': { get stores() { return { subs: SUBS_CREATOR() }; } },
  'wallet--signed-out': { signedOut: true },
  'gift--signed-out': { signedOut: true },
  'redeem--bad-code': { steps: [...at('/redeem'), ['typeLabel', ['Code', 'AAAA-AAAA-AAAA']], ['tap', 'Redeem'], ['wait', 900]] },
  'favourites--screen': { get seed() { return FAVS6(); } },
  'favourites--comments-empty': { steps: [...at('/favourites'), ['tap', 'Comments'], ['wait', 900]] },
  'scan--camera-denied': { denyCamera: true, steps: [...at('/scan'), ['tap', 'Allow camera'], ['wait', 1200]] },
  'scan--camera-preview': { camera: true, steps: [...at('/scan', 3500)] },
  'transcript--screen': { mini: true, get steps() { return [...at(epPath('Why mornings matter')), ['tap', 'Play this episode'], ['wait', 2500], ['tap', 'More'], ['wait', 900], ['label', /^Transcript/], ['wait', 1500], ['label', /^Open the transcript full screen/], ['wait', 2200]]; } },
  'error-boundary--screen': { steps: at('/show/%E0%A4%A') },
  'states--followers-empty': { steps: at('/profile/demo-1/followers') },
  'states--following-empty': { steps: at('/profile/demo-1/following') },
  'states--stats-empty': { steps: at('/profile/demo-1') },
  'states--clips-empty': { get steps() { return [...at(epPath('Rain on tin')), ['scroll', 1037]]; } },
  'states--nextup-empty': { get steps() { return [...at(epPath('Rain on tin')), ['scroll', 1239]]; } },
  'states--heat-empty': { get steps() { return [...at(epPath('Rain on tin')), ['tap', 'Play this episode'], ['wait', 2500]]; } },
  'states--search-empty': { steps: [...at('/search', 1800), ['typeLabel', ['Search podcasts', 'zzzqx9nothing']], ['press', 'Enter'], ['wait', 2500]] },
  'states--feed-offline': { faults: [{ path: '/v1/me/feed', mode: 'abort' }, { path: '/v1/me/notifications', mode: 'abort' }], steps: at('/notifications') },
  'me-listening--all-time': { steps: [...at('/me/listening'), ['tap', 'All time'], ['wait', 1500]] },
  // ---- wave 5b ----
  'library--screen': { mini: true, get stores() { return { subs: nSubs(6)() }; } },
  'library--signed-out': { signedOut: true, mini: true, stores: { subs: [] } },
  'library--empty': { mini: true },
  'library--more-sheet': { mini: true, get stores() { return { subs: nSubs(6)() }; }, steps: [...at('/library'), ['holdAny', 'Why mornings matter'], ['wait', 1000]] },
  'library--add-to-playlist': { mini: true, get stores() { return { subs: nSubs(6)() }; }, steps: [...at('/library'), ['holdAny', 'Why mornings matter'], ['wait', 900], ['tap', 'Add to playlist'], ['wait', 1200]] },
  'library--save-moment': { mini: true, get stores() { return { subs: nSubs(6)() }; }, steps: [...at('/library'), ['holdAny', 'Why mornings matter'], ['wait', 900], ['tap', 'Save the moment'], ['wait', 1200]] },
  'library--starred-row': { mini: true, get stores() { return { subs: nSubs(6)().map((s, i) => ({ ...s, starred: i >= 3 })) }; }, steps: [...at('/library'), ['holdAny', 'Why mornings matter'], ['wait', 900], ['tap', 'Star this show'], ['wait', 1500]] },
  'subscriptions--screen': { mini: true },
  'subscriptions--grid': { mini: true },
  'subscriptions--empty': { },
  'subscriptions--show-menu': { mini: true, steps: [...at('/subscriptions'), ['holdAny', 'Field Recordings'], ['wait', 1000]] },
  'subscriptions-manage--screen': { },
  'subscriptions-manage--empty': { },
  'show--screen': { unsub: 'morning-notes', get steps() { return at(`/show/${enc(H.FEED)}`, 3500); } },
  'show--hot-moments': { unsub: 'morning-notes', get steps() { return [...at(`/show/${enc(H.FEED)}`, 3500), ['tap', 'Hot moments'], ['wait', 1800]]; } },
  'show--search': { unsub: 'morning-notes', get steps() { return [...at(`/show/${enc(H.FEED)}`, 3500), ['tap', 'Search this show\'s episodes'], ['wait', 600], ['fillText', 'morn'], ['wait', 1500]]; } },
  'show--menu-sheet': { unsub: 'morning-notes', get steps() { return [...at(`/show/${enc(H.FEED)}`, 3500), ['tap', 'More: show info, report this show'], ['wait', 1000]]; } },
  'show--episode-row-sheet': { unsub: 'morning-notes', get steps() { return [...at(`/show/${enc(H.FEED)}`, 3500), ['holdAny', 'Why mornings matter'], ['wait', 1000]]; } },
  'show-info--screen': { get steps() { return at(`/show-info/${enc(H.FEED)}`, 3000); } },
  'show-info--loading': { get steps() { return at(`/show-info/${enc(H.FEED)}`, 2000); } },
  'show-info--error': { get steps() { return at(`/show-info/${enc(H.FEED)}`, 3000); } },
  'profile--screen': { }, 'profile--own': { }, 'profile--signed-out': { signedOut: true }, 'profile--host': { }, 'profile--stats-empty': { fresh: true },
  'profile--suspended': { }, 'profile--load-failed': { },
  'profile--more-sheet': { }, 'profile--block-dialog': { }, 'profile--blocked': { }, 'profile--report-sheet': { }, 'profile--toast': { },
  'category--screen': { }, 'category--all-sheet': { },
});
// the entries with {user_name}-style steps, expressed with this app's real labels
Object.assign(OVR, {
  'profile--more-sheet': { steps: [...at('/profile/u-rui'), ['tap', 'More actions for Rui Costa'], ['wait', 900]] },
  'profile--block-dialog': { steps: [...at('/profile/u-rui'), ['tap', 'More actions for Rui Costa'], ['wait', 900], ['tap', 'Block Rui Costa'], ['wait', 900]] },
  'profile--blocked': { steps: [...at('/profile/u-rui'), ['tap', 'More actions for Rui Costa'], ['wait', 900], ['tap', 'Block Rui Costa'], ['wait', 900], ['tapLast', 'Block'], ['wait', 1200]] },
  'profile--report-sheet': { steps: [...at('/profile/u-rui'), ['tap', 'More actions for Rui Costa'], ['wait', 900], ['tap', 'Report Rui Costa'], ['wait', 900]] },
  'profile--toast': { steps: [...at('/profile/u-rui'), ['tap', 'More actions for Rui Costa'], ['wait', 900], ['tap', 'Mute Rui Costa'], ['wait', 900]] },
});

for (const d of [...DESIGNS_W6, ...DESIGNS_W5B]) if (!NATIVE_W6[d[0]] && d[0] !== 'discover-fold-likes-deck') ROUTES[d[0]] = route(d[0]);

// A signed-out visitor is sent to the welcome screen by the app; a step back lands on the page the drawing shows (as in waves 2-5).
for (const r of Object.values(ROUTES)) {
  if (!r.signedOut || r.noBack) continue;
  const d = Object.getOwnPropertyDescriptor(r, 'steps');
  const get = d.get ?? (() => d.value);
  Object.defineProperty(r, 'steps', { get: () => [...get.call(r), ['back']], configurable: true, enumerable: true });
}

// ---- what is on the phone ----
export function seedW6(name, route) {
  if (!H || !isW6(name)) return undefined;
  const base = baseStores();
  if (!route.mini) delete base.session;
  if (route.fresh) { base.positions = []; base.subs = []; base.queue = []; }
  if (route.unsub) base.subs = base.subs.filter((x) => !x.feedUrl.includes(route.unsub));
  return { ...base, ...route.stores };
}

// ---- fake server ----
const iso = (ms) => new Date(ms).toISOString();
let LAST = ''; let STATE = {};
const OLD_PROFILE = { 'profile--screen': 'profile', 'profile--own': 'profile-own', 'profile--signed-out': 'profile', 'profile--host': 'profile', 'profile--stats-empty': 'stickers-none', 'profile--suspended': 'profile', 'profile--load-failed': 'profile-load-failed',
  'profile--more-sheet': 'profile-more', 'profile--block-dialog': 'profile-block', 'profile--blocked': 'profile-blocked', 'profile--report-sheet': 'profile', 'profile--toast': 'profile',
  'states--followers-empty': 'profile-followers-empty', 'states--following-empty': 'profile-followers-empty', 'states--stats-empty': 'stickers-none' };
const OLD_EPISODE = { 'states--clips-empty': 'episode-clips-empty', 'states--nextup-empty': 'episode-related-empty' };
const MN_SHOW = () => ({ feedUrl: H.FEED, title: 'Morning Notes', author: 'Mia Tan', imageUrl: H.artUrl('a'), genres: ['Business'], episodeCount: 212 });
const showCard = (title, author, art, slug, latest, extra = {}) => ({ feedUrl: feedUrlOf(slug), title, author, imageUrl: H.artUrl(art), genres: ['Business'], episodeCount: 40, latestEpisode: { title: latest, publishedAt: iso(H.NOW - DAY) }, ...extra });
const voiceStatus = (n, id, i) => ({ id: `s${i}`, author: { id, name: n, initials: n[0] }, url: 'https://cdn.example.test/status.m4a', durationMs: 41000, createdAt: iso(H.NOW - (i + 1) * HOUR), expiresAt: iso(H.NOW + 18 * HOUR), mine: false });

export function answerW6(u, method, R, route) {
  if (!H) return undefined;
  if (R !== LAST) { LAST = R; STATE = {}; }
  if (!isW6(R)) return undefined;
  const r = route ?? ROUTES[R];
  const p = u.pathname; const NOW = H.NOW;
  const fault = (r?.faults ?? []).find((f) => p === f.path || p.startsWith(f.path + '/'));
  if (fault) return fault.mode === 'slow' ? { __hang: true } : fault.mode === 'abort' ? { __abort: true } : { __status: 500, error: 'server_error' };
  const seed = seedW6(R, r);
  // ---- the account and what is on the phone (as wave 5) ----
  if (p === '/v1/me/positions') return { positions: seed.positions.map((x) => ({ episodeId: x.episodeId, offsetMs: x.offsetMs, finished: x.finished === true, explicitSeek: false, receivedAt: iso(x.at), deviceId: 'phone' })), serverTime: iso(NOW) };
  if (p === '/v1/me/queue') return { version: 0, items: seed.queue, deviceId: null, updatedAt: null };
  if (p === '/v1/me/subscriptions') return { items: seed.subs.map((x) => ({ feedUrl: x.feedUrl, createdAt: iso(NOW - 20 * DAY), starred: x.starred === true })), serverTime: iso(NOW) };
  if (u.hostname === 'feeds.example.test') return undefined;
  if (p === '/v1/health' && R === 'maintenance--screen') return { ok: true, maintenance: { until: '2026-10-27T14:30:00', message: 'SocialNet is being updated.' } };
  if (p === '/v1/me') return { listener: { id: 'demo-1', email: AS.email, displayName: AS.name, createdAt: iso(NOW - 90 * DAY), likesPublic: true, privateListening: false, country: 'SG', ...(R === 'wallet--plus' ? { plus: true } : {}) } };
  // ---- Appeal ----
  if (p === '/v1/appeals') {
    if (R === 'appeal--signed-out') return { __status: 401, error: 'unauthenticated' };
    if (method === 'POST') { STATE.sent = true; return { id: 'ap2' }; }
    if (R === 'appeal--nothing-to-appeal') return { items: [] };
    const sent = R === 'toast--appeal' && STATE.sent;
    return { items: [{ actionId: 'a1', action: 'remove', what: 'Your comment on “Why mornings matter” was removed.', at: '2026-10-12T09:00:00Z', appeal: sent ? { id: 'ap2', state: 'open', createdAt: iso(NOW) } : null }, { actionId: 'a2', action: 'suspend', what: 'Your account was suspended for 7 days.', at: '2026-10-09T09:00:00Z', appeal: { id: 'ap1', state: 'open', createdAt: '2026-10-09T10:00:00Z' } }] };
  }
  // ---- Creator ----
  if (p === '/v1/creator/claims') {
    if (method === 'POST') { STATE.claimed = true; return { id: 'cl1', feedUrl: H.FEED, code: 'SN-7Q4K-2M', status: 'pending' }; }
    if (STATE.claimed) return { claims: [{ id: 'cl1', feedUrl: H.FEED, code: 'SN-7Q4K-2M', status: 'pending' }] };
    if (R === 'creator--host-proven') return { claims: [{ id: 'cl1', feedUrl: H.FEED, code: 'SN-7Q4K-2M', status: 'proven', provenAt: iso(NOW - 30 * DAY) }] };
    return { claims: [] };
  }
  if (/^\/v1\/creator\/claims\/[^/]+\/verify$/.test(p)) return { status: 'pending' };
  if (p === '/v1/creator/shows/stats') return { listeners: 120, comments: 14, episodes: 32, topMoments: [['Why mornings matter', 872000, 6], ['Kettle, window, nothing else', 370000, 4], ['The city decides', 1365000, 3]].map(([title, offsetMs, comments], i) => ({ episodeId: idOf('Why mornings matter') + i, title, offsetMs, comments })) };
  // ---- Wallet, tips, redeem, gift ----
  if (p === '/v1/me/purchases') {
    if (R === 'wallet--signed-out') return { __status: 401, error: 'unauthenticated' };
    if (R === 'states--loading-page') return { __hang: true };
    return { items: R === 'wallet--plus' ? [{ id: 'p1', store: 'google_play', productId: 'plus.monthly', status: 'active', expiresAt: '2026-11-12T00:00:00Z', amountMicros: 2990000, currency: 'USD', createdAt: '2026-10-12T00:00:00Z' }] : [], storeReady: false };
  }
  if (p === '/v1/me/tips') return { items: [], storeReady: false };
  if (p === '/v1/me/redeem') return { __status: 404, error: 'not_found', message: 'That code doesn’t exist.' };
  const gm = p.match(/^\/v1\/gifts\/([^/]+)(\/claim)?$/);
  if (gm) {
    if (gm[1] === 'no-such-gift' || R === 'gift--not-found') return { __status: 404, error: 'not_found' };
    if (gm[2]) return { ok: true };
    return { show: { feedUrl: feedUrlOf('slow-places'), title: 'Slow Cities: the full season', artworkUrl: H.artUrl('h') }, claimed: false, cancelled: false, buyerName: 'Ana' };
  }
  // ---- Transcript ----
  if (/^\/v1\/episodes\/[^/]+\/translation$/.test(p)) return { state: 'plus_required' };
  // ---- shared states ----
  if (/^\/v1\/episodes\/[^/]+\/social$/.test(p) && /^states--(comments|heat)-empty$/.test(R)) return { ...H.SOCIAL, comments: [], heat: { available: R !== 'states--heat-empty', buckets: H.SOCIAL.heat.buckets.map(() => 0) }, myReactionBuckets: [] };
  if (p === '/v1/issues' && R === 'states--error-page') return { __status: 500, error: 'server_error' };
  if (/^\/v1\/issues\/[^/]+$/.test(p) && R === 'states--loading-inline') return { __hang: true };
  if (p === '/v1/me/friends-listening' && R === 'states--error-inline') return { __status: 500, error: 'server_error' };
  if (p === '/v1/me/listening' && R === 'me-listening--all-time') {
    const months = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.UTC(2025, 8 + i, 1)); return { day: d.toISOString().slice(0, 7), minutes: i === 13 ? 2470 : [300, 600, 900, 1200, 1500, 900, 1800, 2400, 3000, 2700, 3300, 3600, 2800][i] }; });
    return { range: 'all', days: months, totalMinutes: 18760, topShows: [['Morning Notes', 88], ['Night Shift Radio', 61], ['Field Recordings', 40]].map(([t, h], i) => ({ feedUrl: feedUrlOf(['morning-notes', 'night-shift-radio', 'field-recordings'][i]), title: t, minutes: h * 60 })) };
  }
  if (p === '/v1/me/likes/timeline' && R.startsWith('states--')) return { items: [] };
  // ---- Updates tab ----
  if (p === '/v1/voice-posts' && R.startsWith('library--')) return R === 'library--signed-out' || R === 'library--empty' ? { items: [] } : { items: [['Rui', 'u-rui'], ['Ana', 'u-ana'], ['Jo', 'u-jo'], ['Kai', 'u-kai']].map(([n, id], i) => voiceStatus(n, id, i)) };
  if (p === '/v1/me/playlists' && method === 'GET' && R.startsWith('library--')) return { items: [['Sunday walks', 12], ['For the commute', 7], ['Learn something', 23]].map(([title, count], i) => ({ id: `pl${i}`, imageUrl: H.artUrl('afc'[i]), title, isPublic: false, count, updatedAt: iso(NOW - 2 * DAY) })) };
  if (p === '/v1/episodes/comment-counts' && R.startsWith('library--')) { const E = EPS(); return { counts: { [E['Why mornings matter'].id]: 14, [E['Cities that sleep late'].id]: 9 }, listeners: { [E['Why mornings matter'].id]: 120, [E['Cities that sleep late'].id]: 64 } }; }
  // ---- Show ----
  if (p === '/v1/shows/extras') return { overrides: null, announcements: [], polls: [], tipsEnabled: false, subscribers: 8100, hosts: [{ id: 'h1', name: 'Mia Tan', avatarUrl: null }], hostPicks: [], hiddenGuids: [] };
  if (p === '/v1/discover/moments' && u.searchParams.get('feedUrl')) {
    return { items: [['Why mornings matter', 872000, R.startsWith('library--') ? 41 : 2400, 'the part I replay every morning'], ['The ten minute walk', 1870000, R.startsWith('library--') ? 19 : 812, 'goosebumps']].map(([t, ms, n, line], i) => ({ episodeId: idOf(t) || `m${i}`, showTitle: 'Morning Notes', episodeTitle: t, feedUrl: H.FEED, guid: `mn-${i + 1}`, enclosureUrl: `https://cdn.example.test/mn-${i + 1}.mp3`, coverUrl: H.artUrl('a'), startMs: ms, endMs: ms + 38000, reactions: n, rank: i + 1, followed: false, curve: Array.from({ length: 100 }, (_, k) => Math.max(8, Math.round(100 * Math.exp(-(((k - (38 + i * 14)) / 9) ** 2)))) ), comments: [{ id: `mc${i}`, author: 'Rui', text: line, likes: 3 }] })), computedAt: iso(NOW) };
  }
  if (p === '/v1/shows/info') {
    if (R === 'show-info--loading') return { __hang: true };
    if (R === 'show-info--error') return { __status: 500, error: 'server_error' };
    return { feedUrl: 'https://feeds.morningnotes.fm/rss', claimed: true, ownerName: 'Mia Tan', claimedAt: '2026-03-12T00:00:00Z', madeInStudio: true, createdAt: '2025-01-03T00:00:00Z', ownerCountry: 'Malaysia' };
  }
  // ---- Category ----
  const cm = p.match(/^\/v1\/categories\/(\d+)$/);
  if (cm) {
    const lead = showCard('Money, Plainly', 'J. Park', 'b', 'money-plainly', 'Rent, explained twice', { pinned: true });
    return { genreId: Number(cm[1]), name: 'Business', pinned: [lead.feedUrl], defaultSort: 'forYou', shows: [lead,
      { ...showCard('Morning Notes', 'Lin Wei', 'a', 'morning-notes', 'Why mornings matter'), feedUrl: H.FEED },
      showCard('Night Shift Radio', 'Mia Tan', 'd', 'night-shift-radio', 'Cities that sleep late'),
      showCard('The Long Table', 'Ana Ruiz', 'e', 'the-long-table', 'What bread taught me'),
      showCard('Slow Science', 'Tom Ito', 'g', 'slow-science', 'The quiet maths of luck')] };
  }
  // ---- Profile ----
  if (OLD_PROFILE[R]) {
    if (method === 'POST' && /block/i.test(p)) STATE.blocked = true;
    const pm = p.match(/^\/v1\/listeners\/([^/]+)(\/[a-z]+)?$/);
    if (pm) {
      const id = pm[1]; const sub = pm[2];
      if (sub === '/followers' || sub === '/following') return { listeners: [] };
      if (sub === '/subscriptions') return { items: CAT.map(([slug, t, , art]) => ({ feedUrl: slug === 'morning-notes' ? H.FEED : feedUrlOf(slug), title: t, imageUrl: H.artUrl(art) })) };
      if (sub) return { items: [] };
      if (R === 'profile--load-failed') return { __status: 500, error: 'server_error', message: 'Couldn\u2019t reach the server.' };
      const zero = { listenedMs: 0, finished: 0, topShows: [] };
      const all = { listenedMs: (128 * 60 + 14) * 60000, finished: 312, topShows: [['Morning Notes', 30], ['Night Shift Radio', 23], ['Field Recordings', 16]].map(([t, h], i) => ({ feedUrl: i === 0 ? H.FEED : feedUrlOf(['', 'night-shift-radio', 'field-recordings'][i]), showTitle: t, listenedMs: h * 3600000 })) };
      const base = { id, stickers: [{ stickerId: 'hour-1', x: 0.185, y: 0.444, scale: 0.64, rot: -0.21, z: 1 }, { stickerId: 'finish-1', x: 0.77, y: 0.34, scale: 0.64, rot: 0.17, z: 2 }, { stickerId: 'hour-10', x: 0.82, y: 0.68, scale: 0.54, rot: -0.1, z: 3 }], followers: 1200, following: 212, isFollowing: false, country: 'PT', bio: 'Mornings, cities, long walks. Replays the good bits.', likesCount: 128, stats: { last7: { listenedMs: 5 * 3600000, finished: 6, topShows: [] }, all }, recent: [] };
      if (id === 'demo-1') { const none = /stats-empty/.test(R); return { profile: { ...base, displayName: 'Jayden', followers: 48, bio: 'Morning walks, long interviews.', stats: { last7: zero, all: none ? zero : all }, recent: none ? [] : [{ id: 1, kind: 'commented', actor: { id: 'demo-1', displayName: 'Jayden' }, episode: { id: idOf('Why mornings matter'), title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null }, momentMs: 872000, refId: 'c1', createdAt: iso(NOW - DAY) }] } }; }
      if (id === 'u-sus') return { profile: { id, displayName: 'Rui Costa', followers: 0, following: 0, isFollowing: false, suspended: true, stats: { last7: zero, all: zero }, recent: [] } };
      if (id === 'u-lena') return { profile: { ...base, displayName: 'Lena Park', followers: 8400, hostOf: [MN_SHOW(), { feedUrl: feedUrlOf('night-shift-radio'), title: 'Night Shift Radio', imageUrl: H.artUrl('d') }, { feedUrl: feedUrlOf('field-recordings'), title: 'Field Notes', imageUrl: H.artUrl('b') }] } };
      return { profile: { ...base, displayName: 'Rui Costa', ...(STATE.blocked ? { blockedByMe: true } : {}) } };
    }
    if (p === '/v1/me/hidden') return { reported: [], blocked: STATE.blocked ? [{ id: 'u-rui', displayName: 'Rui Costa' }] : [], hiddenFeeds: [] };
    if (p === '/v1/me/mutes') return { items: [] };
  }
  if (OLD_EPISODE[R]) { const w = answerW34(u, method, OLD_EPISODE[R]); if (w !== undefined) return w; }
  return undefined;
}
