// M31 wave 5 (lane CAP5): the settings group (data/settings.json), the sign-in and onboarding pages, and the rest of the discover group
// (data/discover.json, T064) beside their drawings. Same shape as capture-w34.mjs: capture-web.mjs imports DESIGNS_W5 / ROUTES_W5 / answerW5 / seedW5.
// Web build only; not a device. The drawings' sample data is seeded here (the words each drawing prints), never invented for the app.
// DESIGNS_W5 rows: [capture name = the drawing's entry id, drawing page, entry id, phone index inside the entry].
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseStores, EPS, epCard, CAT, feedUrlOf, DAY, HOUR } from './capture-w34.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../../specs/033-m31-redesign/design-pulse2/data');
const entries = (f) => JSON.parse(readFileSync(path.join(DATA, f), 'utf8'));
const ENTRY = new Map([...entries('settings.json'), ...entries('discover.json'), ...entries('shell.json')].map((e) => [e.name, e]));

/** Entries that are a system alert, the OS share sheet, the mail app, the photo picker ...: no web equivalent, listed as "not captured" in the README. */
export const NATIVE_W5 = {
  'auth-sign-in--notification-permission': 'iOS notification permission alert (system UI)',
  'settings-appearance--change-icon-dialog': 'native Alert.alert (the web build has none; the drawing says NOT_CAPTURABLE)',
  'toast--settings-appearance': 'needs the native alternate-icon call to fail',
  'settings-feedback--email-fallback': 'iOS mail composer (system UI)',
  'settings-feedback--photo-permission': 'iOS photo-library alert (system UI)',
  'settings-feedback--photo-picker': 'iOS photo picker (system UI)',
  'settings-help--contact-support': 'mailto: hand-off to the mail app',
  'settings-licences--package-link': 'hand-off to the browser',
  'settings-opml--share-sheet': 'iOS share sheet (system UI)',
  'settings-push--open-settings': 'hand-off to the iOS Settings app',
  'toast--library': 'the Updates rows offer Add to queue / More only by swipe or long press; a headless pointer press opens the episode instead',
  'toast--episode-extras': 'same: the row sheet that holds Save the moment opens by long press on an Updates row',
  'pending-deletion--sheet': 'after a web sign-in whose answer carries pendingDeletion the sheet never opened in 5 tries: PendingDeletion.tsx clears the store while the listener state is still empty (probable race, listed as a defect)',
  'toast--pending-deletion': 'same: no sheet, so no Keep my account to press',
  'issue--share': 'iOS share sheet (system UI)',
  'report--share': 'iOS share sheet (system UI)',
};

const S = (name, file) => [name, file, name, 0];
const SET = ['terms--first-launch', 'terms--refused', 'terms--full-document', 'auth-sign-in--screen', 'auth-sign-in--consent-sheet', 'auth-sign-in--legal-document',
  'auth-email--screen', 'auth-email--consent-sheet', 'auth-email--code-step', 'auth-email--name-step', 'auth-email--under-age', 'auth-email--suspended',
  'onboarding-interests--screen', 'onboarding-interests--picked', 'onboarding-not-liking--screen',
  'account--screen', 'account--signed-out', 'account--sign-out-dialog',
  'settings-account--screen', 'settings-account--signed-out', 'settings-account-email--screen', 'settings-account-email--codes-sent', 'toast--settings-account-email',
  'settings-account-more--screen', 'settings-account-more--signed-out', 'settings-account-more--delete-steps', 'settings-account-more--code-sent',
  'settings-appearance--screen', 'settings-appearance--app-icon-locked', 'settings-appearance--app-icon-plus', 'settings-background--screen',
  'settings-blocked--screen', 'settings-blocked--with-blocks', 'settings-collected--screen', 'settings-collected--detail-sheet', 'settings-collected--signed-out',
  'settings-devices--screen', 'settings-devices--loading', 'settings-devices--error', 'settings-devices--signed-out', 'toast--settings-devices',
  'settings-downloads--screen', 'settings-downloads--clear-cache-dialog', 'settings-downloads--clear-downloads-dialog', 'toast--settings-downloads',
  'settings-feedback--screen', 'settings-feedback--signed-out', 'settings-feedback--mine-empty', 'toast--settings-feedback',
  'settings-help--screen', 'settings-help--answer-open', 'settings-how-for-you--screen', 'settings-licences--screen', 'settings-licences--package-detail',
  'settings-minor--screen', 'settings-minor--set-passcode', 'settings-minor--confirm-passcode', 'toast--settings-minor', 'settings-minor--turn-off-prompt', 'settings-minor--forgot-passcode',
  'settings-more--screen', 'settings-network--screen', 'settings-network--results', 'toast--settings-network',
  'settings-not-interested--screen', 'settings-not-interested--empty', 'settings-not-interested--signed-out', 'toast--settings-not-interested',
  'settings-opml--screen', 'settings-opml--from-app', 'settings-opml--found', 'settings-opml--export-sheet', 'toast--settings-opml',
  'settings-playback--screen', 'settings-privacy--screen', 'settings-privacy--signed-out', 'settings-privacy--muted-empty', 'settings-privacy--muted-loading', 'settings-privacy--muted-error',
  'toast--settings-privacy', 'toast--often-listened-switch', 'toast--muted-threads', 'settings-push--screen', 'settings-push--signed-out',
  'settings-queue-backups--screen', 'settings-queue-backups--empty', 'settings-queue-backups--restore-dialog', 'toast--settings-queue-backups',
  'settings-sharing--screen', 'settings-updates--screen', 'settings-widgets--screen', 'settings-about--screen', 'settings-about--legal-sheet'];
const DIS = ['categories--screen', 'chart--screen', 'chart--error', 'chart-rules--screen', 'topic--screen', 'academy--screen', 'academy--article', 'academy--article-missing',
  'picks-daily--screen', 'picks-daily--error', 'picks-past--screen', 'picks-past--error', 'issues--screen', 'issues--error', 'issue--screen', 'digest--screen', 'digest--none',
  'report--screen', 'report--signed-out', 'report--empty', 'report--error', 'friends-listening--signed-out', 'friends-listening--error', 'plaza--screen', 'plaza--list', 'plaza--error',
  'play-latest--screen', 'me-listening--signed-out', 'me-listening--30-days', 'toast--home', 'toast--digest', 'toast--report', 'toast--use-discover',
  'toast--rec-feedback', 'toast--tell-editors'];
const SHELL = ['rate-sheet--sheet', 'toast--rate-sheet', 'coming-soon--wallet-sheet'];
export const DESIGNS_W5 = [...SET.map((n) => S(n, 'settings.html')), ...DIS.map((n) => S(n, 'discover.html')), ...SHELL.map((n) => S(n, 'shell.html'))];

/** Set by capture-web.mjs (initW5). */
let H = null;
export function initW5(helpers) { H = helpers; }

const NAME5 = new Set(DESIGNS_W5.map((d) => d[0]));
export const isW5 = (n) => NAME5.has(n);

// ---- steps: the drawing's entry (data/*.json) already lists what a person taps; this turns it into capture steps ----
const FILL = { '{user}': 'u-rui', '{code}': '123456', '{oldcode}': '654321', '{month}': '2026-09', '{digest}': '2026-W44', '{issue}': 'i12', '{academy}': 'record-first', '{thread}': 'Comments on “Why mornings matter”' };
const sub = (s) => Object.entries(FILL).reduce((a, [k, v]) => a.replaceAll(k, v), s);
function stepsOf(name) {
  const e = ENTRY.get(name);
  return e.steps.flatMap((s) => {
    if (s.open) return [['goto', sub(s.open)], ['wait', 2800]];
    if (s.tap) return [['tap', sub(s.tap)], ['wait', 900]];
    if (s.type) return [['typeLabel', [s.type, sub(s.text)]], ['wait', 300]];
    if (s.key) return [['press', s.key]];
    return [];
  });
}
const faultsOf = (name) => ENTRY.get(name).steps.filter((s) => s.fault && s.fault.mode !== 'off').map((s) => s.fault);
const asOf = (name) => ENTRY.get(name).as;

const AS = { email: 'ruitanai@example.com', emailChange: 'rui.tanaka@example.com', name: 'Rui Tanaka' };
const OVR = {};   // name -> route options that replace what the entry implies
const ROUTES = {};
export const ROUTES_W5 = ROUTES;

function route(name) {
  const a = asOf(name);
  const r = { steps: stepsOf(name), faults: faultsOf(name), authName: AS.name, authEmail: name.startsWith('settings-account-email') || name === 'toast--settings-account-email' ? AS.emailChange : AS.email };
  if (a === 'visitor') r.signedOut = true;
  if (a === 'new') r.fresh = true;
  if (a === 'plus') r.plus = true;
  if (a === 'host') r.host = true;
  if (r.signedOut && /^(terms|auth-|onboarding)/.test(name)) r.noBack = true;
  if (OVR[name]) Object.defineProperties(r, Object.getOwnPropertyDescriptors(OVR[name]));
  // A signed-out launch pushes the sign-in page over whatever was opened; the email page is the one under it, so step back once it has arrived.
  if (name.startsWith('auth-email') && name !== 'auth-email--suspended') r.steps = [r.steps[0], r.steps[1], ['wait', 1500], ['back'], ...r.steps.slice(2)];
  return r;
}

// Per-screen overrides (where the entry's own steps are not enough on the web, or the drawing needs a state).
Object.assign(OVR, {
  'terms--first-launch': { signedOut: true, noBack: true, unseed: ['terms.accepted', 'age.confirmed'], steps: [['goto', '/'], ['wait', 3000]] },
  'terms--refused': { signedOut: true, noBack: true, unseed: ['terms.accepted', 'age.confirmed'], steps: [['goto', '/'], ['wait', 3000], ['tap', 'Disagree'], ['wait', 900]] },
  'terms--full-document': { signedOut: true, noBack: true, unseed: ['terms.accepted', 'age.confirmed'], steps: [['goto', '/'], ['wait', 3000], ['tap', 'Read the full agreement'], ['wait', 1200]] },
  'onboarding-interests--screen': { fresh: true, unseed: ['interests.genreIds'] },
  'onboarding-interests--picked': { fresh: true, unseed: ['interests.genreIds'] },
});


// ---- the drawings' people and shows (words printed in data/*.json), episodes the older waves' catalogue lacks ----
const MN = () => H.FEED;
const SHOW5 = { 'The Long Table': ['the-long-table', 'e'], 'Slow Science': ['slow-science', 'g'], 'Small Histories': ['small-histories', 'h'], 'Code & Coffee': ['code-coffee', 'c'] };
const feed5 = (slug) => `https://feeds.example.test/${slug}.xml`;
const EP5 = { 'What bread taught me': ['The Long Table', 3120], 'The quiet maths of luck': ['Slow Science', 1860], 'The year without summer': ['Small Histories', 2400], 'Rain on a tin roof': ['Field Recordings', 1500] };
/** An episode card of the drawings: the catalogue's if it has it, else one of the extra shows. */
function ep(title) {
  const E = EPS();
  if (E[title]) return epCard(title);
  const [show, secs] = EP5[title]; const [slug, art] = SHOW5[show] ?? [show === 'Field Recordings' ? 'field-recordings' : 'x', 'b'];
  const feedUrl = feed5(slug); const guid = `${slug}-${title.length}`;
  return { id: H.fnv1a64(`${feedUrl}\u0001${guid}`), feedUrl, guid, title, showTitle: show, imageUrl: H.artUrl(art), durationMs: secs * 1000, publishedAt: new Date(H.NOW - 2 * DAY).toISOString(), enclosureUrl: `https://cdn.example.test/${guid}.mp3` };
}
const showFeed = (t) => ep(t).feedUrl;
const nSubs = (n) => () => baseStores().subs.slice(0, n);
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const jsonList = (a) => JSON.stringify(a);
const FAVS5 = () => many(12, (i) => ({ episodeId: `fav${i}`, at: H.NOW - (i + 1) * DAY }));
const MOMS5 = () => many(4, (i) => ({ id: `m${i}`, episodeId: `mo${i}`, atMs: 1000 * (i + 5), note: '', savedAt: H.NOW - (i + 1) * HOUR }));
const POS5 = () => many(184, (i) => ({ episodeId: `h${i}`, offsetMs: 60000, durationMs: 1800000, at: H.NOW - (i + 1) * HOUR }));
const MB = 1000000;
const DL5 = () => many(14, (i) => ({ episodeId: `d${i}`, url: `https://cdn.example.test/d${i}.mp3`, state: 'complete', bytesDone: 88 * MB, bytesTotal: 88 * MB, at: H.NOW - i * HOUR }));
const BACKUPS5 = () => { const E = EPS(); return [
  { items: [E['Why mornings matter'].id, E['Cities that sleep late'].id, E['The long walk home'].id, E['Bread, slowly'].id, E['Notes on attention'].id, E['What the river knows'].id], device: null, reason: 'chooser', createdAt: Date.parse('2026-10-27T08:14:00Z') },
  { items: [E['Cities that sleep late'].id, E['The long walk home'].id, E['Bread, slowly'].id, E['Notes on attention'].id], device: 'iPad', reason: 'restore', createdAt: Date.parse('2026-10-25T21:02:00Z') },
  { items: many(9, (i) => Object.values(E)[i].id), device: null, reason: 'manual', createdAt: Date.parse('2026-10-22T07:40:00Z') }].reverse(); };

Object.assign(OVR, {
  'onboarding-not-liking--screen': { steps: [['goto', '/onboarding/not-liking'], ['wait', 2800], ['tap', 'Not my topics'], ['tap', 'Comedy'], ['wait', 600]] },
  'settings-account-email--screen': { steps: [['goto', '/settings/account-email'], ['wait', 2800], ['typeLabel', ['New email', 'rui@newmail.com']], ['wait', 300]] },
  'settings-account-email--codes-sent': { steps: [['goto', '/settings/account-email'], ['wait', 2800], ['typeLabel', ['New email', 'rui@newmail.com']], ['tap', 'Email me a code'], ['wait', 1200]] },
  'toast--settings-account-email': { steps: [['goto', '/settings/account-email'], ['wait', 2800], ['typeLabel', ['New email', 'rui@newmail.com']], ['tap', 'Email me a code'], ['wait', 1200], ['typeLabel', ['Code from your new email', '123456']], ['typeLabel', ['Code from your current email', '654321']], ['tap', 'Change email'], ['wait', 900]] },
  'auth-email--name-step': { steps: [['goto', '/auth/email'], ['wait', 2500], ['typeLabel', ['Email', 'capture-newcomer@example.com']], ['tap', 'I have read and agree to the Service Agreement and Privacy Policy'], ['tap', 'Send code'], ['wait', 1200], ['typeLabel', ['Code', '123456']], ['tap', 'Continue'], ['wait', 1200], ['typeLabel', ['Display name', 'Rui Tanaka']], ['wait', 300]] },
  'auth-email--under-age': { steps: [['goto', '/auth/email'], ['wait', 2500], ['typeLabel', ['Email', 'capture-newcomer@example.com']], ['tap', 'I have read and agree to the Service Agreement and Privacy Policy'], ['tap', 'Send code'], ['wait', 1200], ['typeLabel', ['Code', '123456']], ['tap', 'Continue'], ['wait', 1200], ['tap', 'I am under 14'], ['wait', 900]] },
  'auth-email--suspended': { get seed() { return { 'safety.suspendedMessage': 'This account is suspended until 3 Nov 2026 for repeated spam in comments.', 'safety.appealToken': 'tok' }; }, steps: [['goto', '/auth/email'], ['wait', 2500]] },
  'settings-collected--screen': { get seed() { return { 'me.favourites': jsonList(FAVS5()), 'me.moments': jsonList(MOMS5()), 'search.history': jsonList(many(9, (i) => `term ${i}`)) }; }, get stores() { return { positions: POS5(), subs: nSubs(6)() }; } },
  'settings-downloads--screen': { seed: { 'downloads.budgetBytes': '2000000000' }, get stores() { return { downloads: DL5() }; } },
  'settings-blocked--with-blocks': { get stores() { return { blocks: [{ listenerId: 'u-x' }] }; }, steps: [['goto', '/settings/blocked'], ['wait', 2800]] },
  'settings-queue-backups--screen': { get stores() { return { queueBackups: BACKUPS5() }; } },
  'settings-queue-backups--restore-dialog': { get stores() { return { queueBackups: BACKUPS5() }; } },
  'toast--settings-queue-backups': { get stores() { return { queueBackups: BACKUPS5() }; } },
  'settings-opml--screen': { get stores() { return { subs: nSubs(6)() }; } },
  'settings-opml--from-app': { get stores() { return { subs: nSubs(6)() }; } },
  'settings-opml--found': { get stores() { return { subs: nSubs(6)() }; } },
  'settings-opml--export-sheet': { get stores() { return { subs: nSubs(6)() }; } },
  'settings-feedback--screen': { get seed() { return { 'me.feedback': jsonList([{ kind: 'Using the app', body: 'The player is clear.', at: H.NOW - DAY }, { kind: 'Suggestion or other', body: 'More speeds, please.', at: H.NOW - 3 * DAY }]) }; } },
  'toast--settings-feedback': { get seed() { return {}; } },
  'issue--screen': { get stores() { return { subs: [{ feedUrl: H.FEED }] }; } },
  'toast--library': { mini: true },
  'toast--episode-extras': { mini: true },
  'toast--use-discover': { mini: true },
});


const COLLECTED = { get seed() { return { 'me.favourites': jsonList(FAVS5()), 'me.moments': jsonList(MOMS5()), 'search.history': jsonList(many(9, (i) => `term ${i}`)) }; }, get stores() { return { positions: POS5(), subs: nSubs(6)() }; } };
const SIGNIN_PD = [['signOutStore'], ['goto', '/auth/email'], ['wait', 2500], ['wait', 1500], ['back'], ['typeLabel', ['Email', 'rui.tanaka@example.com']], ['tap', 'I have read and agree to the Service Agreement and Privacy Policy'], ['tap', 'Send code'], ['wait', 1200], ['typeLabel', ['Code', '123456']], ['tap', 'Continue'], ['wait', 3500]];
const WITH_DL = { seed: { 'downloads.budgetBytes': '2000000000', 'pref.autoDownloadQueued': '1' }, get stores() { return { downloads: DL5(), subs: nSubs(6)() }; } };
const PRIV_SCROLL = (more = []) => [['goto', '/settings/privacy'], ['wait', 2800], ['scroll', 545], ['wait', 400], ...more];
const DISCOVER_HOME = [['goto', '/'], ['wait', 3000], ['tap', 'Discover'], ['wait', 2500]];
Object.assign(OVR, {
  'settings-collected--detail-sheet': Object.defineProperty(Object.defineProperties({}, Object.getOwnPropertyDescriptors(COLLECTED)), 'steps', { value: [['goto', '/settings/collected'], ['wait', 2800], ['tap', 'Account details'], ['wait', 900]], enumerable: true, configurable: true, writable: true }),
  'settings-collected--signed-out': COLLECTED,
  'account--screen': WITH_DL, 'account--signed-out': WITH_DL, 'account--sign-out-dialog': WITH_DL,
  'settings-downloads--clear-cache-dialog': WITH_DL, 'settings-downloads--clear-downloads-dialog': WITH_DL,
  'settings-downloads--screen': WITH_DL,
  'settings-privacy--muted-empty': { fresh: true, steps: PRIV_SCROLL() },
  'settings-privacy--muted-loading': { steps: PRIV_SCROLL() },
  'settings-privacy--muted-error': { steps: PRIV_SCROLL() },
  'toast--often-listened-switch': { steps: PRIV_SCROLL([['labelForce', /Often listened/], ['wait', 900]]) },
  'rate-sheet--sheet': { fresh: true, unseed: ['rate.answered'], steps: [['goto', '/'], ['wait', 7000]] },
  'toast--rate-sheet': { fresh: true, unseed: ['rate.answered'], steps: [['goto', '/'], ['wait', 7000], ['tap', 'Rate us'], ['wait', 900]] },
  'toast--report': { steps: [['goto', '/report/2026-09'], ['wait', 2800], ['tap', 'Share your September 2026'], ['wait', 700]] },
  'toast--digest': { steps: [['goto', '/digest/2026-W43'], ['wait', 2800], ['tap', 'Queue all'], ['wait', 900]] },
  'topic--screen': { steps: [...DISCOVER_HOME, ['tap', 'Rainy-day listening'], ['wait', 2500]] },
  'toast--home': { mini: true, steps: [...DISCOVER_HOME, ['tap', 'More for Cities that sleep late'], ['wait', 900], ['tap', 'Not interested in this episode'], ['wait', 900]] },
  'toast--use-discover': { mini: true, steps: [...DISCOVER_HOME, ['tap', 'Add Why mornings matter to the queue'], ['wait', 700]] },
  'digest--screen': { get stores() { return { subs: nSubs(6)() }; } },
});

for (const d of DESIGNS_W5) if (!NATIVE_W5[d[0]]) ROUTES[d[0]] = route(d[0]);

// A signed-out visitor is sent to the welcome screen by the app; as in wave 2, a step back lands on the page the drawing shows (not for the auth pages themselves).
for (const r of Object.values(ROUTES)) {
  if (!r.signedOut || r.noBack) continue;
  const steps = r.steps;
  Object.defineProperty(r, 'steps', { get: () => [...steps, ['back']], configurable: true, enumerable: true });
}

// ---- what is on the phone ----
export function seedW5(name, route) {
  if (!H || !isW5(name)) return undefined;
  const base = baseStores();
  if (!route.mini) delete base.session;
  if (route.fresh) { base.positions = []; base.subs = []; base.queue = []; }
  return { ...base, ...(route.stores ?? {}) };
}

const iso = (ms) => new Date(ms).toISOString();


const PAGE = (slug, title, summary, tag, body, position) => ({ slug, title, summary, tag, body, position, updatedAt: '2026-10-01T00:00:00Z' });
const ACADEMY = () => [
  PAGE('record-first', 'Record your first episode', 'A quiet room, one microphone and twenty minutes.', 'start', '## Find the quietest room\nSoft things absorb echo: a wardrobe, a sofa, curtains.\n\n## Hold the microphone close\nA hand’s width away. Speak across it, not into it.\n\n## Record twenty minutes\nDo not edit while you record. Leave the mistakes for later.', 1),
  PAGE('write-description', 'Write a show description', 'Two lines that say who it is for.', 'start', '## Say who it is for\nOne sentence.', 2),
  PAGE('cover-small', 'Pick a cover that reads small', 'Test it at the size of a thumbnail.', 'grow', '## Test it small\nShrink it to 60 pixels.', 3),
  PAGE('first-comments', 'Answer your first comments', 'A short reply is enough.', 'community', '## Reply\nSay thanks.', 4),
  PAGE('schedule', 'Publish on a schedule', 'Same day, same hour.', 'grow', '## Pick a day\nKeep it.', 5)];
const FEED_DAYS = (n) => `2026-10-${String(27 - n).padStart(2, '0')}`;

function answerBase(u, method, R, route) {
  if (!H || !isW5(R)) return undefined;
  const p = u.pathname; const NOW = H.NOW;
  const r = route ?? ROUTES[R];
  const fault = (r?.faults ?? []).find((f) => p === f.path || p.startsWith(f.path + '/'));
  if (fault) return fault.mode === 'slow' ? { __hang: true } : { __status: 500, error: 'server_error' };
  const seed = seedW5(R, r);
  if (p === '/v1/me/positions') return { positions: seed.positions.map((x) => ({ episodeId: x.episodeId, offsetMs: x.offsetMs, finished: x.finished === true, explicitSeek: false, receivedAt: iso(x.at), deviceId: 'phone' })), serverTime: iso(NOW) };
  if (p === '/v1/me/queue') return { version: 0, items: seed.queue, deviceId: null, updatedAt: null };
  if (p === '/v1/me/subscriptions') return { items: seed.subs.map((x) => ({ feedUrl: x.feedUrl, createdAt: iso(NOW - 20 * DAY), starred: x.starred === true })), serverTime: iso(NOW) };
  if (u.hostname === 'feeds.example.test') return undefined;
  if (p === '/v1/me') return { listener: { id: 'demo-1', email: r?.authEmail ?? AS.email, displayName: AS.name, createdAt: iso(NOW - 90 * DAY), likesPublic: true, privateListening: false, country: 'SG' } };
  // ---- auth and account ----
  if (p === '/v1/auth/code') return { sent: true, resendAfterSeconds: 42 };
  if (p === '/v1/auth/code/verify') return /^(toast--)?pending-deletion/.test(R) ? { token: 'tok', listener: { id: 'demo-1', displayName: AS.name, email: AS.email }, pendingDeletion: { dueAt: '2026-11-11T00:00:00Z' } } : { needsName: true };
  if (p === '/v1/me/deletion/cancel') return { ok: true };
  if (p === '/v1/me/email/start') return { sent: true, resendAfterSeconds: 60 };
  if (p === '/v1/me/email/confirm') return { email: 'rui@newmail.com', signedOut: 0 };
  if (p === '/v1/me/sessions' && method === 'GET') return { items: [
    { id: 'd1', kind: 'phone', label: 'iPhone 16', country: 'SG', signedInAt: iso(NOW - 30 * DAY), lastSeenAt: iso(NOW), current: true },
    { id: 'd2', kind: 'studio', label: 'Studio · Chrome on macOS', country: 'SG', signedInAt: iso(NOW - 12 * DAY), lastSeenAt: iso(NOW - 3 * HOUR), current: false },
    { id: 'd3', kind: 'mod', label: 'Moderation · Safari', country: 'MY', signedInAt: iso(NOW - 40 * DAY), lastSeenAt: iso(NOW - 6 * DAY), current: false }] };
  if (p === '/v1/me/sessions/sign-out-others') return { signedOut: 1 };
  if (p === '/v1/me/export') return { sent: true, expiresInHours: 24 };
  // ---- settings ----
  if (p === '/v1/me/dismissals') return { items: r?.fresh ? [] : [{ kind: 'show', itemKey: 'https://feeds.example.test/daily-grind.xml', title: 'The Daily Grind', createdAt: iso(NOW - DAY) }, { kind: 'episode', itemKey: 'ep212', title: 'Ep. 212 — The long goodbye to cash', createdAt: iso(NOW - 2 * DAY) }, { kind: 'show', itemKey: 'https://feeds.example.test/crypto-hour.xml', title: 'Crypto Hour', createdAt: iso(NOW - 3 * DAY) }] };
  if (p === '/v1/me/mutes') return { items: r?.fresh ? [] : [{ id: 'u-mika', name: 'Mika', avatarUrl: null }, { id: 'u-tom', name: 'Tom W.', avatarUrl: null }] };
  if (p === '/v1/me/muted-threads') return { items: [{ threadKind: 'comment', threadKey: 'c1', title: 'Comments on “Why mornings matter”', createdAt: iso(NOW - DAY) }] };
  if (p === '/v1/me/push-prefs') return { newEpisodes: true, popular: false, replies: true, likes: true, follows: true, mentions: true, statuses: false, digest: false, system: true };
  if (p === '/v1/me/privacy') return { privateListening: false };
  if (p === '/v1/me/interests') return { genreIds: [], skippedAt: null };
  if (p === '/v1/feedback' || p === '/v1/me/rec-feedback') return method === 'GET' ? { items: [] } : { id: 'f1', ok: true };
  if (p === '/v1/content/academy') return { items: ACADEMY() };
  // ---- discover, the rest ----
  if (p === '/v1/discover/daily') return { date: '2026-10-27', items: [['Why mornings matter', 'Short, warm, and good with coffee.'], ['Cities that sleep late', 'A city story told after midnight.'], ['What bread taught me', 'Flour, patience, and a grandmother.']].map(([t, why]) => ({ feedUrl: showFeed(t), why, episode: ep(t) })) };
  if (p === '/v1/picks/past') return { days: [['2026-10-26', [['Why mornings matter', 'Short, warm, and good with coffee.'], ['The quiet maths of luck', 'Luck, in numbers.']]], ['2026-10-25', [['The year without summer', 'The year without summer, slowly.']]], ['2026-10-24', [['What bread taught me', 'Flour and patience.'], ['Rain on a tin roof', 'Rain only.']]]].map(([date, ps]) => ({ date, picks: ps.map(([t, why]) => ({ feedUrl: showFeed(t), why, episode: ep(t) })) })) };
  if (p === '/v1/issues') return { issues: [['i12', '2026-10-27', 'Sounds of the city at night'], ['i11', '2026-10-20', 'Kitchen stories'], ['i10', '2026-10-13', 'Before the election'], ['i9', '2026-10-06', 'Learning slowly'], ['i8', '2026-09-29', 'Long walks']].map(([id, date, title]) => ({ id, date, title })) };
  if (/^\/v1\/issues\/[^/]+$/.test(p)) return { id: 'i12', date: '2026-10-27', title: 'Sounds of the city at night', intro: 'Six episodes for walking home late, picked by the editors.', items: [['Cities that sleep late', 'Neon, rain and a taxi driver who talks.'], ['Why mornings matter', 'Start here if you can’t sleep.']].map(([t, note], i) => ({ order: i + 1, feedUrl: showFeed(t), note, episode: ep(t) })) };
  if (p === '/v1/me/digests') return { items: R === 'digest--none' ? [] : [{ isoWeek: '2026-W43', sentAt: iso(NOW - 2 * DAY), episodes: [['Why mornings matter', 'Mon'], ['Cities that sleep late', 'Wed'], ['What bread taught me', 'Thu'], ['The quiet maths of luck', 'Sat']].map(([t], i) => ({ ...ep(t), publishedAt: iso(Date.parse('2026-10-19T08:00:00Z') + [0, 2, 3, 5][i] * DAY), imageUrl: ep(t).imageUrl })) }] };
  if (p === '/v1/me/report') { const empty = R === 'report--empty'; return { month: '2026-09', minutes: empty ? 0 : 1284, shows: empty ? 0 : 12, episodes: empty ? 0 : 46, comments: empty ? 0 : 9, clips: empty ? 0 : 3, topShows: empty ? [] : [['Morning Notes', 370], ['Night Shift Radio', 242], ['The Long Table', 160]].map(([title, minutes], i) => ({ feedUrl: i === 0 ? H.FEED : feed5(['', 'night-shift-radio', 'the-long-table'][i]), title, imageUrl: H.artUrl('abd'[i]), minutes })), topEpisodes: [] }; }
  if (p === '/v1/discover/plaza') return R === 'plaza--error' ? { __status: 500, error: 'server_error' } : { shuffle: 0, items: Array.from({ length: 96 }, (_, i) => ['Morning Notes', 'Night Shift Radio', 'The Long Table', 'Slow Science', 'Money, Plainly', 'Small Histories', 'Field Recordings', 'Code & Coffee'][i % 8]).map((title, i) => ({ feedUrl: i === 0 ? H.FEED : feed5(`p${i}`), title, imageUrl: H.artUrl('abcdefgh'[i % 8]), episodes: (i % 8) + 2, firstAt: iso(NOW - i * DAY) })) };
  if (p === '/v1/discover/chart') { const kind = u.searchParams.get('kind') ?? 'talked'; if (R === 'chart--error') return { __status: 500, error: 'server_error' }; return { kind, updatedAt: iso(NOW - 3 * 60000), serverTime: iso(NOW), items: ['Why mornings matter', 'Cities that sleep late', 'What bread taught me', 'The quiet maths of luck', 'Rent, explained twice'].map((t, i) => ({ kind: 'talkedAbout', key: `ch${i}`, rank: i + 1, score: 50 - i, reason: i === 0 ? '41 comments this week' : '', episode: ep(t) })) }; }
  if (p === '/v1/me/listening') { const w = R === 'me-listening--30-days'; return { range: u.searchParams.get('range') ?? '30d', days: Array.from({ length: 30 }, (_, i) => ({ day: iso(NOW - (29 - i) * DAY).slice(0, 10), minutes: [20, 45, 0, 60, 30, 90, 10][i % 7] })), totalMinutes: w ? 612 : 0, topShows: w ? [['Morning Notes', 31], ['Night Shift Radio', 18], ['The Long Table', 9]].map(([t, h], i) => ({ feedUrl: `https://feeds.example.test/ls-${i}.xml`, title: t, minutes: h * 60 })) : [] }; }
  if (p === '/v1/me/friends-listening' && R === 'friends-listening--error') return { __status: 500, error: 'server_error' };
  if (p === '/v1/discover/moments') return undefined;
  return undefined;
}

// ---- answers added after the first pass ----
const FAQ5 = () => [['Where does the audio come from?', 'Listening', 'Every episode plays straight from its publisher. SocialNet never stores or hosts audio.'], ['How do timestamped comments work?', 'Comments', 'Tap a moment, then write.'], ['Why is an episode not downloading?', 'Downloads', 'Downloads wait for Wi-Fi unless you allow mobile data.'], ['How do I move my shows from another app?', 'Subscriptions', 'Use Import or export.'], ['How do stickers work?', 'Stickers', 'You earn them by listening.'], ['Who can see what I listen to?', 'Privacy', 'Only you, if you keep your listening private.']].map(([title, tag, body], i) => ({ slug: `faq-${i}`, title, summary: null, tag, body, position: i, updatedAt: '2026-10-01T00:00:00Z' }));
const answer1 = answerBase;
const pick5 = (t, why, i) => ({ kind: 'pick', key: `pick-${i}`, episode: ep(t), why, score: 10 - i, stats: { listeners: [120, 64, 31][i], comments: 14 - i * 3 } });
export function answerW5(u, method, R, route) {
  const first = answer1(u, method, R, route);
  if (first !== undefined || !H || !isW5(R)) return first;
  const p = u.pathname; const NOW = H.NOW;
  if (p === '/v1/content/faq') return { items: FAQ5() };
  if (p === '/v1/meta') return { appealsEmail: 'appeals@socialnet.app' };
  if (p === '/v1/me/hidden') return { reported: [], blocked: R === 'settings-blocked--with-blocks' ? [{ id: 'u-x', displayName: 'A listener' }] : [], hiddenFeeds: [] };
  if (p === '/v1/discover' && /^(topic--screen|toast--home|toast--use-discover)$/.test(R)) return {
    ...H.DISCOVER,
    picks: [['Why mornings matter', 'Short, warm, and good with coffee.'], ['Cities that sleep late', 'A city story told after midnight.'], ['What bread taught me', 'Flour, patience, and a grandmother.']].map(([t, w], i) => pick5(t, w, i)),
    collections: [{ id: 'rain', title: 'Rainy-day listening', subtitle: 'Eight episodes for a slow afternoon', items: [['Rent, explained twice', 'Explains rent so you never need it again.'], ['The year without summer', 'A summer that never came, told slowly.'], ['Rain on a tin roof', 'Just rain. Perfect for reading.']].map(([t, w], i) => pick5(t, w, i)) }] };
  if (p === '/v1/for-you' && R === 'toast--home') return { items: [['Cities that sleep late', 'Because you follow Morning Notes'], ['The quiet maths of luck', 'Popular with people like you'], ['What bread taught me', 'New to you']].map(([t, reason]) => ({ episode: ep(t), channel: 'pick', reason, score: 1 })), computedAt: iso(NOW), stale: false, similarityAge: null, serverTime: iso(NOW) };
  return undefined;
}
