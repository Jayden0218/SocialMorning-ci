#!/usr/bin/env node
// M31 T004: screenshots of the phone app's WEB build (layout only, not a device) for the before/after contact sheets.
// Usage: node scripts/capture-web.mjs --out <dir> [--routes home,player,...] [--web <exported dir>] [--probe] [--frame]
//   --compare --out <dir>: drawing vs build for the six Pulse screens (<name>-design/-build/-side/-diff.png, 780x1688).
//   --web reuses an earlier export (skips the ~50 s build); --probe prints requests, console errors and aria-labels.
// Builds `M27_WEB=1 expo export -p web` (the M29 shims) into a temp dir outside the repo, serves it statically,
// opens each route in Playwright Chromium at 390x844 @2x. NEVER calls the production API: every request that is not
// the local static server is answered here with a fixture (or 404). Never run `playwright install`.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadFixture, DESIGN_DIR } from '../m31/capture-fixture.mjs';
import { DESIGNS_W3, DESIGNS_W4, ROUTES_W3, ROUTES_W4, initW34, answerW34, feedXmlW34, seedW34 } from '../m31/capture-w34.mjs';
import { DESIGNS_W5, ROUTES_W5, initW5, answerW5, seedW5 } from '../m31/capture-w5.mjs';
import { DESIGNS_W6, DESIGNS_W5B, ROUTES_W6, initW6, answerW6, seedW6 } from '../m31/capture-w6.mjs';
import { DESIGNS_W7, ROUTES_W7, KIT as KIT_W7, initW7 } from '../m31/capture-w7.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : (process.argv[i + 1]?.startsWith('--') ? true : process.argv[i + 1] ?? true); };
const outDir = path.resolve(String(arg('out') ?? 'capture-out'));
/** The microphone is denied in headless Chromium; a fake device + auto-accepted prompt lets the voice recorder draw (wave 2). */
export const LAUNCH = { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };
const probe = arg('probe') === true;
const suffix = typeof arg('suffix') === 'string' ? String(arg('suffix')) : '';

const FX = loadFixture();
const NOW = Date.parse(FX.now);
const FEED = FX.show.feedUrl;
const IMGBASE = 'https://img.example.test';
const artUrl = (k) => `${IMGBASE}/art-${k}.png`;
const IMG = artUrl('a');
const TITLES = FX.episodes;
const DUR = FX.episodeDurationMs;
const iso = (n) => new Date(NOW - n * 86400000).toISOString();
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>${FX.show.title}</title><link>https://example.test/morning-notes</link><description>Short, warm, good with coffee.</description><language>en</language><itunes:author>${FX.show.author}</itunes:author><itunes:image href="${IMG}"/><image><url>${IMG}</url><title>${FX.show.title}</title></image>${TITLES.map((t, i) => `<item><title>${t}</title><guid isPermaLink="false">mn-${i + 1}</guid><pubDate>${new Date(NOW - (i + 1) * 86400000).toUTCString()}</pubDate><description>${t}. A short episode about the habit, with the three ideas worth keeping and one thing to try tomorrow morning.</description><itunes:duration>${Math.round(DUR / 1000) - i * 420}</itunes:duration><itunes:image href="${IMG}"/>${i === 0 ? '<podcast:chapters url="https://cdn.example.test/mn-1-chapters.json" type="application/json+chapters"/><podcast:transcript url="https://cdn.example.test/mn-1-transcript.txt" type="text/plain"/>' : ''}<enclosure url="https://cdn.example.test/mn-${i + 1}.mp3" length="1000000" type="audio/mpeg"/></item>`).join('')}</channel></rss>`;
/** The app's episode id: FNV-1a 64 over UTF-16 code units, low byte then high byte (packages/social-core/src/hash.ts). */
function fnv1a64(input) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h = ((h ^ BigInt(c & 0xff)) * 0x100000001b3n) & 0xffffffffffffffffn;
    h = ((h ^ BigInt((c >>> 8) & 0xff)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}
const card = (i) => ({ id: fnv1a64(`${FEED}\u0001mn-${i + 1}`), feedUrl: FEED, guid: `mn-${i + 1}`, title: TITLES[i], showTitle: FX.show.title, imageUrl: IMG, durationMs: DUR - i * 420000, publishedAt: iso(i + 1), enclosureUrl: `https://cdn.example.test/mn-${i + 1}.mp3` });
const ART_OF = ['b', 'c', 'e', 'g'];
const showCard = (n, t, a) => ({ feedUrl: n === 0 ? FEED : `https://feeds.example.test/show-${n}.xml`, title: t, author: a, imageUrl: n === 0 ? IMG : artUrl(ART_OF[n]), genres: ['Society & Culture'], episodeCount: 40 + n });
const SHOWS = [showCard(0, FX.show.title, FX.show.author), showCard(1, 'Slow Radio', 'Ana Ruiz'), showCard(2, 'The Long Walk', 'Tom Ito'), showCard(3, 'Kitchen Table', 'Mei Chen')];
/** The first pick's cover is the sample art cut to the pick tile's own rectangle (346 x 272), as the drawing paints it as a gradient on that box. */
const item = (kind, i) => ({ kind, key: `${kind}-${i}`, episode: kind === 'pick' && i === 0 ? { ...card(0), imageUrl: `${IMGBASE}/pick-0.png` } : card(i), why: FX.pickWhy, score: 10 - i, stats: { listeners: FX.listened - i * 20, comments: FX.commentsToday - i * 3 } });
/** The first trending card names the hint under the search field (the app prints the show name; see trendingHints). */
const trendCard = (i) => (i === 0 ? { ...card(0), showTitle: FX.hint } : card(i));
const DISCOVER = { date: FX.now.slice(0, 10), picks: [0, 1, 2].map((i) => item('pick', i)), talkedAbout: [1, 2, 3].map((i) => item('talkedAbout', i)), trending: [0, 2, 3].map((i) => ({ ...item('trending', i), episode: trendCard(i) })), stale: false, serverTime: new Date(NOW).toISOString(), shows: SHOWS, newShows: SHOWS.slice(1, 3).map((s, i) => ({ show: s, episode: card(i) })), collections: [{ id: 'c1', title: 'Gentle starts', subtitle: 'For slow mornings', items: [0, 1, 2].map((i) => item('pick', i)) }], said: [{ commentId: 'sc1', authorId: 'u1', body: FX.comments[0].text, createdAt: iso(1), episode: card(0) }] };
const comment = (i, c) => ({ id: `c${i}`, authorId: `u${i}`, displayName: c.name, body: c.text, offsetMs: c.offsetMs, parentId: null, createdAt: iso(0.1 * (i + 1)), deleted: false, replies: i === FX.reply.to ? [{ id: 'c0r', authorId: 'u9', displayName: FX.reply.name, body: FX.reply.text, offsetMs: null, parentId: `c${i}`, createdAt: iso(0.05), deleted: false }] : [] });
const SOCIAL = { serverTime: new Date(NOW).toISOString(), episode: { id: 'x', durationMs: DUR }, comments: FX.comments.map((c, i) => comment(i, c)), heat: { available: true, buckets: FX.heat.normalised }, myReactionBuckets: [] };
/** GET /v1/discover/moments (specs/033-m31-redesign/contracts/moments.md): feedUrl + guid always present, rank 1-based. */
const momentItem = (i, followed, reactions) => ({ episodeId: card(i).id, showTitle: FX.show.title, episodeTitle: TITLES[i], feedUrl: FEED, guid: `mn-${i + 1}`, enclosureUrl: `https://cdn.example.test/mn-${i + 1}.mp3`, coverUrl: `${IMGBASE}/moment-${i}.png`, startMs: FX.hotMs + i * 60000, endMs: FX.hotMs + 38000 + i * 60000, reactions: reactions - i * 700, rank: i + 1, followed, comments: FX.comments.map((c, k) => ({ id: `mc${i}${k}`, author: c.name, text: c.text, likes: c.likes })) });
const momentsFor = (reactions) => ({ items: [momentItem(0, true, reactions), momentItem(1, true, reactions), momentItem(2, false, reactions)], computedAt: new Date(NOW).toISOString() });
const PROMO = [{ id: 'promo-1', imageUrl: `${IMGBASE}/launch.jpg`, targetKind: 'route', target: '/search', label: FX.launch.label, startsAt: '2020-01-01T00:00:00Z', endsAt: '2100-01-01T00:00:00Z', weight: 1, dailyCap: 5 }];
const W2 = FX.w2;
const ME = { listener: { id: 'demo-1', displayName: W2.me.name, avatarUrl: artUrl('h'), email: 'demo@example.test', createdAt: iso(90), privateListening: false } };

/** 90 s of 8 kHz 8-bit silence (720 KB) is enough for the player to load; the page's clock is pinned (see CLOCK) so it reads the drawn 12:32 / 48:10. */
const wav = (secs) => { const n = 8000 * secs; const b = Buffer.alloc(44 + n, 0x80); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); return b; };
const SILENCE = wav(90), SILENCE_SHORT = wav(3);  // T104: SILENCE_SHORT lets an episode end by itself (the end offer)

/** The drawing's six chapters (More sheet) and a transcript, so Transcript and Chapters (6) tiles exist. */
const CHAPTERS = { version: '1.2.0', chapters: [['0:00', 'Cold open'], ['4:12', 'Why the first hour counts'], ['12:05', 'The coffee question'], ['21:40', 'Light, noise and phones', 'https://example.test/light'], ['33:10', 'The notebook habit'], ['41:30', 'One thing to try tomorrow']].map(([t, title, url]) => ({ startTime: t.split(':').reduce((a, n) => a * 60 + Number(n), 0), title, ...(url ? { url } : {}) })) };
const TRANSCRIPT = 'Welcome to Morning Notes.\nToday: why mornings matter, and what the first hour does for the rest of the day.\n';
const w2Art = (k) => artUrl(k);
const showW2 = (s, i) => ({ feedUrl: `https://feeds.example.test/j-${i}.xml`, title: s.title, author: s.author, imageUrl: w2Art(s.art), genres: ['Society & Culture'], episodeCount: 30 + i });
const epW2 = (e, i) => ({ ...card(i % 4), id: fnv1a64(`j-${i}`), guid: `j-${i}`, title: e.title, showTitle: e.show, imageUrl: w2Art(e.art), feedUrl: FEED });
const momentsW2 = () => ({ items: W2.search.moments.map((m, i) => ({ ...momentItem(0, true, m.reacted), episodeId: card(0).id + i, coverUrl: w2Art(m.art), startMs: m.ms, endMs: m.ms + 38000, reactions: m.reacted, rank: i + 1, comments: [{ id: `jm${i}`, author: 'Rui', text: m.line, likes: 3 }] })), computedAt: new Date(NOW).toISOString() });
const C2 = FX.w2.comments;
const asComment = (c, parentId = null) => ({ id: c.id, authorId: `u-${c.name}`, displayName: c.name, initials: c.initial, body: c.text, offsetMs: parentId ? null : c.offsetMs, parentId, createdAt: new Date(NOW - c.hoursAgo * 3600000).toISOString(), deleted: false, likeCount: c.likes, likedByMe: false, ...(c.pinned ? { pinned: true } : {}), ...(c.host ? { host: true } : {}), ...(c.replyCount ? { replyCount: c.replyCount } : {}), ...(c.voiceMs ? { voice: { url: 'https://cdn.example.test/v.m4a', ms: c.voiceMs, ...(c.voiceText ? { text: c.voiceText } : {}) } } : {}) });
const SOCIAL2 = () => ({ ...SOCIAL, comments: C2.items.map((c) => ({ ...asComment(c), replies: (c.replies ?? []).map((r) => asComment(r, c.id)) })), heat: { available: true, buckets: FX.heat.normalised.map((v, i) => (i === 12 ? 0.2 : v)) } });
const D2 = FX.w2.discover;
const cardW2 = (e, i) => ({ ...card(i % 4), id: fnv1a64(`d2-${i}-${e.title}`), guid: `d2-${i}`, title: e.title, showTitle: e.show, imageUrl: w2Art(e.art), feedUrl: `https://feeds.example.test/d2-${i}.xml` });
/** T105: a caller (m31/capture-k.mjs widths) may rewrite every answer (long names, extreme counts); null = off. */
let ANSWER_HOOK = null;
export const setAnswerHook = (f) => { ANSWER_HOOK = f; };
let ROUTE_NAME = '';  // set per capture; lets one fixture answer differently per screen (Discover's "41 reacting" vs Moments' "2.4k")
/** Fixture answers by URL path. Unknown GETs give `{items:[]}` so the screen shows its empty state. */
function fixture(u, method) {
  // Wave 7 (m31/capture-w7.mjs): a route may borrow an older route's answers (`fixAs`), fail or hang chosen calls (`faults7`) and rewrite an answer (`patch`).
  const r7 = ROUTES[ROUTE_NAME];
  if (!r7 || !(r7.fixAs || r7.patch || r7.faults7)) return fixture0(u, method);
  const f = (r7.faults7 ?? []).find((x) => (!x.method || x.method === method) && (x.path instanceof RegExp ? x.path.test(u.pathname) : u.pathname === x.path || u.pathname.startsWith(x.path + '/')));
  if (f) return f.mode === 'slow' ? { __hang: true } : f.mode === 'abort' ? { __abort: true } : { __status: f.status ?? 500, error: { code: 'server_error', message: f.message ?? 'x' } };
  const saved = ROUTE_NAME; let base;
  if (r7.fixAs) ROUTE_NAME = r7.fixAs;
  try { base = fixture0(u, method); } finally { ROUTE_NAME = saved; }
  return r7.patch ? (r7.patch(u, method, base) ?? base) : base;
}
function fixture0(u, method) {
  const p = u.pathname;
  { const w = answerW34(u, method, ROUTE_NAME); if (w !== undefined) return w; }  // waves 3 and 4 (m31/capture-w34.mjs)
  { const w = answerW5(u, method, ROUTE_NAME, ROUTES[ROUTE_NAME]); if (w !== undefined) return w; }  // wave 5 (m31/capture-w5.mjs)
  { const w = answerW6(u, method, ROUTE_NAME, ROUTES[ROUTE_NAME]); if (w !== undefined) return w; }  // wave 6 and 5b (m31/capture-w6.mjs)
  if (u.hostname === 'feeds.example.test') return { xml: feedXmlW34(u) ?? rss };
  const sp = ROUTE_NAME.split('-')[0];
  if (p === '/v1/search') { const q = (u.searchParams.get('q') ?? '').toLowerCase(); return q.includes('zzz') ? { shows: [], episodes: [], episodeSearch: 'ok', source: { shows: 'apple' } } : { shows: W2.search.shows.map(showW2), episodes: W2.search.episodes.map(epW2), episodeSearch: 'ok', source: { shows: 'apple' } }; }
  if (p === '/v1/search/people') return { listeners: [] };
  if (p === '/v1/discover/moments' && sp === 'search') return ROUTE_NAME === 'search-empty' ? { items: [], computedAt: new Date(NOW).toISOString() } : momentsW2();
  if (p === '/v1/me/chats') { if (ROUTE_NAME === 'chat-error') return { __status: 500, error: { code: 'server_error', message: 'x' } }; return { conversations: ROUTE_NAME === 'chat-empty' ? [] : W2.chat.map((c, i) => ({ with: { id: `p${i}`, displayName: c.name }, last: { id: String(10 + i), fromMe: false, body: c.text, createdAt: new Date(NOW - c.minutesAgo * 60000).toISOString(), read: !c.unread }, unread: c.unread, canSend: true })) }; }
  if (p === '/v1/comments/images') return { on: true };
  if (p === '/v1/me/chats/unread') return { count: sp === 'chat' ? 2 : 3 };
  if (/^\/v1\/episodes\/[^/]+\/social$/.test(p) && sp === 'comments') return SOCIAL2();
  if (/^\/v1\/comments\/[^/]+\/thread$/.test(p)) { const c = C2.items[1]; return { parent: { ...asComment(c), replies: undefined }, replies: (ROUTE_NAME === 'comments-replies' ? C2.threadReplies : c.replies).map((r) => asComment(r, c.id)) }; }
  if (/^\/v1\/episodes\/[^/]+\/comments$/.test(p) && method === 'POST' && ROUTE_NAME === 'comments-rules') return { __status: 428, error: { code: 'rules_required', message: 'Accept the rules' } };
  if (p === '/mn-1-chapters.json') return CHAPTERS;
  if (p === '/v1/health') return { ok: true };
  if (p === '/v1/discover') return /^discover-fold/.test(ROUTE_NAME) ? { ...DISCOVER, premium: D2.premium.map((x, i) => ({ feedUrl: `https://feeds.example.test/pr-${i}.xml`, title: x.title, author: x.author, imageUrl: w2Art(x.art), genres: ['Business'], episodeCount: 12 })), video: D2.video.map((v, i) => ({ ...item('trending', i), key: `video-${i}`, episode: { ...cardW2(v, 20 + i), id: fnv1a64(`vid-${i}`) } })) } : DISCOVER;
  if (p === '/v1/discover/moments') return momentsFor(ROUTE_NAME === 'discover' ? FX.moments.reactionsDiscover : FX.moments.reactions);
  if (p === '/v1/for-you' && /^discover-fold/.test(ROUTE_NAME)) return { items: D2.forYou.map((e, i) => ({ episode: cardW2(e, i), channel: 'pick', reason: e.reason, score: 1 })), computedAt: new Date(NOW).toISOString(), stale: false, similarityAge: null, serverTime: new Date(NOW).toISOString() };
  if (p === '/v1/me/likes/timeline') return { items: !/^discover-fold-likes/.test(ROUTE_NAME) ? [] : D2.likes.map((l, i) => ({ listener: { id: `f${i}`, displayName: l.name }, episode: cardW2({ title: 'Why mornings matter', show: 'Morning Notes', art: l.art }, 30 + i), note: l.note, createdAt: new Date(NOW - 3600000 * (i + 1)).toISOString() })) };
  if (p === '/v1/for-you') return { items: [0, 1, 2, 3].map((i) => ({ episode: card(i), channel: 'pick', reason: 'Because you follow Morning Notes', score: 1 })), computedAt: new Date(NOW).toISOString(), stale: false, similarityAge: null, serverTime: new Date(NOW).toISOString() };
  if (p === '/v1/search') return { shows: SHOWS, episodes: [0, 1, 2].map(card), episodeSearch: 'ok', source: { shows: 'apple' } };
  if (/^\/v1\/episodes\/[^/]+\/social$/.test(p)) return SOCIAL;
  if (/^\/v1\/episodes\/[^/]+\/live$/.test(p)) return { listeningNow: FX.heat.peakReacting };
  if (p === '/v1/me') return ME;
  if (p === '/v1/me/feed') return { items: [], serverTime: new Date(NOW).toISOString() };
  if (p === '/v1/me/positions') return { positions: [] };
  if (p === '/v1/me/hidden') return { reported: [], blocked: [], hiddenFeeds: [] };
  if (p === '/v1/me/chats/unread') return { count: 3 };  // chat-api.ts reads `count`
  if (p === '/v1/me/friends-listening') return { items: [{ episode: card(0), listeners: FX.friends.map((n, i) => ({ id: `f${i}`, name: n, initials: n[0] })), lastAt: new Date(NOW).toISOString() }] };
  if (p === '/v1/episodes/comment-counts') return { counts: Object.fromEntries([0, 1, 2, 3].map((i) => [card(i).id, FX.commentsToday - i * 3])), listeners: Object.fromEntries([0, 1, 2, 3].map((i) => [card(i).id, FX.listened - i * 20])) };
  if (p === '/v1/shows/extras') return { overrides: null, announcements: [], polls: [], tipsEnabled: true, subscribers: FX.show.subscribers, hosts: [{ id: 'h1', name: FX.show.author, avatarUrl: null }], hostPicks: [], hiddenGuids: [] };
  if (p === '/v1/config') return sp === 'search' ? { config: { searchHints: W2.search.try } } : {};
  if (p === '/v1/me/queue') return { version: 0, items: Array.from({ length: FX.queueCount }, (_, i) => card(i).id), deviceId: null, updatedAt: null };
  return method === 'GET' ? { items: [], next: undefined } : { ok: true };
}

const HELPERS = { rss, FX, NOW, FEED, IMG, IMGBASE, TITLES, DUR, SHOWS, ME, W2, card, fnv1a64, artUrl, iso, showCard, item, comment, SOCIAL, DISCOVER, CHAPTERS };
initW34(HELPERS);
initW5(HELPERS);
initW6(HELPERS);
Object.defineProperty(HELPERS, 'ROUTES', { get: () => ROUTES });
initW7(HELPERS);

export function build() {
  const dir = String(arg('web') ?? '');
  if (dir && existsSync(path.join(dir, 'index.html'))) { patchBundle(dir); return dir; }  // the patch is idempotent
  const tmp = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'sm-web-'));
  const r = spawnSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', tmp], { cwd: root, stdio: 'inherit', env: { ...process.env, M27_WEB: '1', CI: '1' } });
  if (r.status !== 0) throw new Error('expo export failed');
  patchBundle(tmp);
  return tmp;
}

/**
 * expo-file-system has no web implementation of File/Directory.validatePath, and src/downloads/expo-downloader.ts builds
 * `new Directory(Paths.document, 'downloads')` at import time, which throws and blanks the whole app. The M29 metro alias
 * (metro.config.js, M27_WEB=1) has no shim for it, so the capture patches the TEMP copy of the bundle (never the repo):
 * an optional call. (Better fix, for the owner: add an expo-file-system shim to m27/web-shims + metro.config.js swaps.)
 */
function patchBundle(dir) {
  const js = path.join(dir, '_expo', 'static', 'js', 'web');
  for (const f of readdirSync(js).filter((n) => n.endsWith('.js'))) {
    const p = path.join(js, f);
    // Web has no file system: LaunchFiles.uri() always answered "not on disk", so the launch promotion could never show.
    // Answer with a remote picture instead (the capture's interceptor serves it). Capture-only; the repo is untouched.
    writeFileSync(p, readFileSync(p, 'utf8').replaceAll('this.validatePath()', 'this.validatePath?.()').replaceAll('try{return s(e)?.uri}catch{return}', "try{return 'https://img.example.test/launch.jpg'}catch{return}"));
  }
}

const FONT_DIR = path.resolve(here, '../../../node_modules/@expo-google-fonts');
/** The drawing's three families, as files in node_modules (Google Fonts is not reachable from the capture). */
const FONT_FILES = [
  ...[500, 600, 700, 800].map((w) => ['Unbounded', w, `unbounded/${w}${{ 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' }[w]}/Unbounded_${w}${{ 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' }[w]}.ttf`]),
  ...[400, 500, 600, 700, 800].map((w) => ['Geist', w, `geist/${w}${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' }[w]}/Geist_${w}${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' }[w]}.ttf`]),
  ...[400, 500, 600].map((w) => ['Geist Mono', w, `geist-mono/${w}${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold' }[w]}/GeistMono_${w}${{ 400: 'Regular', 500: 'Medium', 600: 'SemiBold' }[w]}.ttf`]),
];
const fontCss = (prefix) => FONT_FILES.map(([fam, w, f]) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;src:url("${prefix}${f}") format("truetype")}`).join('\n');

export function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml' };
  return new Promise((res) => {
    const s = createServer((rq, rs) => {
      let rel = '/'; try { rel = decodeURIComponent(new URL(rq.url, 'http://x').pathname); } catch { /* a malformed percent-sequence (the error-boundary drawing opens one): the app shell answers it, as a real host does */ }
      if (rel.startsWith('/__fonts/')) { const f = path.join(FONT_DIR, rel.slice(9)); if (f.startsWith(FONT_DIR) && existsSync(f)) { rs.writeHead(200, { 'content-type': 'font/ttf', 'access-control-allow-origin': '*' }); return rs.end(readFileSync(f)); } }
      let f = path.join(dir, rel);
      if (!f.startsWith(dir) || !existsSync(f) || statSync(f).isDirectory()) f = path.join(dir, 'index.html');
      rs.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
      rs.end(readFileSync(f));
    }).listen(0, '127.0.0.1', () => res(s));
  });
}

// name -> steps. A step is ['goto', path] | ['text', string|RegExp] | ['label', string|RegExp] | ['wait', ms].
// Ids are hashes of feedUrl+guid, so episode screens are reached by tapping, as a listener would.
const enc = encodeURIComponent;
const FIRST = ['label', 'Open Why mornings matter'];
const LOAD = [['goto', '/'], ['wait', 2500]];
const PLAY = [['label', /^Discover$/], ['wait', 1500], ['label', /^Open Why mornings matter/], ['wait', 2500], ['label', 'Play this episode'], ['wait', 2500]];
export const ROUTES = {
  home: { steps: [...LOAD] },
  episode: { steps: [...LOAD, FIRST, ['wait', 2500]] },
  player: { steps: [...LOAD, ...PLAY] },  // Play opens the player by itself
  show: { steps: [['goto', `/show/${enc(FEED)}`], ['wait', 3500]] },
  comments: { steps: [...LOAD, FIRST, ['wait', 2500], ['label', /^Comments, /], ['wait', 2500]] },
  search: { steps: [['goto', '/search'], ['wait', 1500], ['type', 'morning'], ['wait', 2500]] },
  me: { steps: [['goto', '/me'], ['wait', 3000]] },
  'miniplayer-tabs': { steps: [...LOAD, FIRST, ['wait', 2500], ['label', 'Play this episode'], ['wait', 2000], ['label', /^Close the player/], ['wait', 800], ['label', /^Back$/], ['wait', 2000]] },
  sheet: { steps: [...LOAD, FIRST, ['wait', 2500], ['label', 'Play this episode'], ['wait', 2000], ['label', /^Speed .*sleep timer/], ['wait', 1500]] },
  empty: { steps: [['goto', '/following'], ['wait', 2500]] },  // Updates > activity: "No activity yet"
  // M31 wave 1 (T029): the Pulse screens beside design-pulse2. 'launch' seeds a cached promotion.
  // The drawing's Skip ring reads "2" with a third of the arc gone: wait for the app's own countdown to say 2 (the 3 s start when the splash hides, not at load).
  launch: { seed: { 'launch.list': JSON.stringify(PROMO), 'launch.files': JSON.stringify(['promo-1']) }, steps: [['goto', '/'], ['waitCount', '2']] },
  // The drawing reads "Sound on": a browser keeps a page silent until a tap, so tap the pill (a trusted click, as a listener's) and the card says what it does.
  moments: { steps: [...LOAD, ['wait', 1500], ['label', /^Sound off/], ['wait', 2000]] },
  discover: { steps: [...LOAD, ['label', /^Discover$/], ['wait', 2000]] },
  'player-more': { steps: [...LOAD, ...PLAY, ['label', /^More$/], ['wait', 1500]] },
  // The drawing shows a state: this show at 1.2x (its own speed, the default still 1.0, so the "Set 1.2x as default" line shows) and a 30 minute sleep
  // timer mid-run ("pausing in 24:12"). Drive the app there: More settings > This show only, back, tap 1.2x, tap Sleep 30, then move the
  // page's clock on (`skew`, less the 1.8 s the step then waits) so the countdown reads what the drawing's does.
  'player-playback': { steps: [...LOAD, ...PLAY, ['label', /^Speed .*sleep timer/], ['wait', 1200], ['label', /^More settings/], ['wait', 900], ['label', /^This show only$/], ['wait', 500], ['label', /^Back to Playback$/], ['wait', 900], ['label', /^1\.2×$/], ['label', /^Sleep in 30 minutes$/], ['skew', 346000], ['wait', 1800]] },
  // T028: cold start = navigation start -> first Home content (anything labelled with the first episode) visible; prints ms.
  cold: { steps: [['timed', '/']] },
  library: { steps: [['goto', '/library'], ['wait', 2500]] },
};

// ---- Wave 2 (lane W2-CAP) ----
// MINI: play the first episode, close the player: the now bar ("Why mornings matter 12:32 / 48:10", playing) sits over every tab, as drawn.
const MINI0 = [...LOAD, ...PLAY, ['label', /^Close the player/], ['wait', 1200]];  // on the episode page (a stack screen: no tab bar)
const MINI = [...MINI0, ['label', /^Back$/], ['wait', 1500]];
const TAB = (n) => [['tab', n], ['wait', 1800]];
const SEARCH_TERM = [['label', /^Search\./], ['wait', 1200]];
const w2Seed = (extra = {}) => ({ 'search.history': JSON.stringify(FX.w2.search.recent), ...extra });
const FOUNDQ = (q) => [['fillLabel', [/^Search podcasts$/, q]], ['press', 'Enter'], ['wait', 2500]];
const FOUND = FOUNDQ(FX.w2.search.term);
const TABSEARCH = (t, q = FX.w2.search.term) => [...FOUNDQ(q), ['labelLast', new RegExp(`^${t}`)], ['wait', 1500]];
const COMMENTS = [...MINI0, ['label', /^Comments, /], ['wait', 2500]];
export const ROUTES_W2 = {
  'discover-fold-a': { steps: [...MINI, ['scroll', 760]] },
  'discover-fold-likes': { steps: [...MINI, ['scroll', 760]] },  // build-only evidence: with a follower's like the app puts Their likes ABOVE For you (drawn: below)
  'discover-fold-likes-deck': { steps: [...MINI, ['scroll', 1150]] },  // wave 5b: the Their likes deck itself
  'discover-fold-b': { steps: [...MINI, ['scroll', 1633]] },
  'search-idle': { seed: w2Seed(), steps: [...MINI, ['goto', '/search'], ['wait', 2000]] },
  'search-all': { seed: w2Seed(), steps: [['goto', '/search'], ['wait', 1500], ...FOUND] },
  'search-shows': { seed: w2Seed(), steps: [['goto', '/search'], ['wait', 1500], ...TABSEARCH('Shows')] },
  'search-moments': { seed: w2Seed(), steps: [['goto', '/search'], ['wait', 1500], ...TABSEARCH('Moments')] },
  'search-people': { seed: w2Seed(), steps: [['goto', '/search'], ['wait', 1500], ...TABSEARCH('People', 'zzzqqqxx')] },
  'search-empty': { seed: w2Seed(), steps: [['goto', '/search'], ['wait', 1500], ['fillLabel', [/^Search podcasts$/, 'zzzqqqxx']], ['press', 'Enter'], ['wait', 2500]] },
  comments: { steps: COMMENTS },
  'comments-bymoment': { steps: [...COMMENTS, ['label', /^By moment$/], ['wait', 1200]] },
  'comments-order': { steps: [...COMMENTS, ['label', /^(Order|Options|More options)/], ['wait', 1200]] },
  'comments-menu': { steps: [...COMMENTS, ['labelNth', [/^More|^Comment menu|^Options for/, 1]], ['wait', 1200]] },
  'comments-replies': { steps: [...COMMENTS, ['label', /^6 replies|replies/], ['wait', 2500]] },
  'comments-composer': { steps: [...COMMENTS, ['label', /^Write a comment/], ['wait', 1200]] },
  'comments-composer-text': { steps: [...COMMENTS, ['label', /^Write a comment/], ['wait', 1200], ['fillText', 'Reading this on the train.'], ['wait', 600]] },
  'comments-report': { steps: [...COMMENTS, ['labelNth', [/^More|^Comment menu|^Options for/, 1]], ['wait', 800], ['label', /^Report/], ['wait', 1200], ['text', 'Harassment'], ['wait', 600]] },
  'comments-rules': { steps: [...COMMENTS, ['label', /^Write a comment/], ['wait', 1200], ['fillText', 'Reading this on the train.'], ['label', /^Post/], ['wait', 1500]] },
  'comments-recorder': { steps: [...COMMENTS, ['label', /^(Record|Voice)/], ['wait', 1500]] },
  chat: { steps: [...MINI, ...TAB('Chat')] },
  'chat-empty': { steps: [...MINI, ...TAB('Chat')] },
  'chat-signed-out': { signedOut: true, steps: [['goto', '/chat'], ['wait', 3000], ['back']] },
  'chat-error': { steps: [...MINI, ...TAB('Chat'), ['wait', 1500]] },
  me: { seed: { 'me.moments': JSON.stringify(Array.from({ length: FX.w2.me.savedMoments }, (_, i) => ({ id: `m${i}`, episodeId: 'x', atMs: i * 1000, note: '', savedAt: NOW - i }))) }, steps: [...MINI, ...TAB('Me')] },
  'me-signed-out': { signedOut: true, seed: { 'me.moments': JSON.stringify(Array.from({ length: FX.w2.me.savedMoments }, (_, i) => ({ id: `m${i}`, episodeId: 'x', atMs: i * 1000, note: '', savedAt: NOW - i }))) }, steps: [['goto', '/me'], ['wait', 3000], ['back']] },
  'me-plus': { seed: { 'store.ready': '1', 'me.moments': JSON.stringify(Array.from({ length: FX.w2.me.savedMoments }, (_, i) => ({ id: `m${i}`, episodeId: 'x', atMs: i * 1000, note: '', savedAt: NOW - i }))) }, steps: [...MINI, ...TAB('Me')] },
};
ROUTES_W2.dbg = { steps: MINI };
Object.assign(ROUTES, ROUTES_W2, ROUTES_W3, ROUTES_W4, ROUTES_W5, ROUTES_W6, ROUTES_W7);

/** The ten key screens of specs/033-m31-redesign (T004/T011); `library` and any other route name can be asked for with --routes. */
const KEY = ['home', 'player', 'episode', 'show', 'comments', 'search', 'me', 'miniplayer-tabs', 'sheet', 'empty'];

export async function runSteps(page, base, steps, probe) {
  for (const [kind, arg] of steps) {
    if (kind === 'timed') { const t0 = Date.now(); await page.goto(base + arg, { waitUntil: 'commit' }); await page.locator('[aria-label*="Why mornings matter"]:visible').first().waitFor({ timeout: 20000 }); console.log(`COLD_MS ${Date.now() - t0}`); }
    else if (kind === 'goto') await page.goto(base + arg, { waitUntil: 'load' });
    else if (kind === 'wait') await page.waitForTimeout(arg);
    else if (kind === 'ended') await page.evaluate(() => { for (const a of document.querySelectorAll('audio,video')) a.dispatchEvent(new Event('ended')); });  // wave 7: the episode runs out (the end offer)
    else if (kind === 'jsLabel') { const l = page.getByLabel(arg).and(page.locator(':visible')).first(); await l.evaluate((e) => e.click(), undefined, { timeout: 5000 }); }  // T104: a click by script on a control another layer covers (the now bar over the Moments tab)
    else if (kind === 'waitCount') await page.waitForFunction((n) => document.querySelector('[data-testid="launch-count"]')?.textContent === n, arg, { timeout: 15000 });
    else if (kind === 'skew') await page.evaluate((ms) => { window.__skew = (window.__skew ?? 0) + ms; }, arg);
    else if (kind === 'text') await page.getByText(arg).first().click({ timeout: 5000 });
    else if (kind === 'label') { const l = page.getByLabel(arg).and(page.locator(':visible')).first(); if (page.__jsClick) await l.evaluate((e) => e.click(), undefined, { timeout: 5000 }); else await l.click({ timeout: 5000 }); }  // __jsClick (T094): a control another layer covers is still pressed, and the covering is reported by the caller
    else if (kind === 'type') await page.locator('input').first().fill(arg, { timeout: 5000 });
    else if (kind === 'scroll') { await page.mouse.move(195, 400); await page.mouse.wheel(0, arg); await page.waitForTimeout(500); }
    else if (kind === 'fillLabel') await page.getByLabel(arg[0]).and(page.locator(':visible')).first().fill(arg[1], { timeout: 5000 });
    else if (kind === 'fillText') await page.locator('textarea:visible, input:visible').first().fill(arg, { timeout: 5000 });
    else if (kind === 'click') await page.mouse.click(arg[0], arg[1]);
    else if (kind === 'labelLast') await page.getByLabel(arg).and(page.locator(':visible')).last().click({ timeout: 5000 });
    else if (kind === 'textLast') await page.getByText(arg).and(page.locator(':visible')).last().click({ timeout: 5000 });
    else if (kind === 'hold') { const l = page.getByLabel(arg).and(page.locator(':visible')).first(); await l.hover({ timeout: 5000 }); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); }
    else if (kind === 'holdAt') { await page.mouse.move(arg[0], arg[1]); await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up(); }
    else if (kind === 'labelNth') await page.getByLabel(arg[0]).and(page.locator(':visible')).nth(arg[1]).click({ timeout: 5000 });
    else if (kind === 'tab') await page.locator('[role="tab"]').and(page.getByLabel(new RegExp(`^${arg}(,|$)`))).last().click({ timeout: 5000, force: true });
    else if (kind === 'back') { await page.goBack(); await page.waitForTimeout(1200); }
    else if (kind === 'press') await page.keyboard.press(arg);
    else if (kind === 'signOutStore') await page.evaluate(() => { try { localStorage.removeItem('m27.auth'); } catch {} });  // wave 5: forget the sign-in a retry made
    else if (kind === 'until') {  // wave 5: run the steps again from the top until the words show (the sign-in sheet is a race in the app: see the README)
      for (let t = 0; t < arg.tries; t++) { await runSteps(page, base, arg.steps, false); await page.waitForTimeout(500); if (await page.getByText(arg.text).count()) break; }
    }
    else if (kind === 'waitText') await page.getByText(arg).first().waitFor({ timeout: 20000 }).catch(() => undefined);  // wave 5: until the words are on the page (a sign-in answer, a sheet)
    else if (kind === 'holdAny') {  // wave 6: long press on the first visible element named by the words (a label or the text), as a finger does on an Updates / show row
      const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const vis = page.locator(':visible');
      const cands = [page.getByLabel(new RegExp(`^More for ${esc(arg)}`)), page.getByLabel(new RegExp(`^(Open )?${esc(arg)}`)), page.getByText(arg, { exact: true })];
      let done = false;
      for (const c of cands) { const l = c.and(vis); if (await l.count()) { const box = await l.first().boundingBox(); await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up(); done = true; break; } }
      if (!done) throw new Error(`holdAny: nothing named "${arg}"`);
    }
    else if (kind === 'tapLast') await page.getByLabel(arg, { exact: true }).and(page.locator(':visible')).last().click({ timeout: 5000 });
    else if (kind === 'labelForce') await page.getByLabel(arg).and(page.locator(':visible')).first().click({ timeout: 5000, force: true });  // for a switch another layer sits over (wave 5)
    else if (kind === 'tap') {  // wave 5: what the drawing's entry says a person taps: an accessibility label or the words, exact first, then as a prefix
      const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const vis = page.locator(':visible');
      const cands = [page.getByLabel(arg, { exact: true }), page.getByText(arg, { exact: true }), page.getByLabel(new RegExp(`^${esc(arg)}`)), page.getByText(new RegExp(`^${esc(arg)}`))];
      let done = false;
      for (const c of cands) { const l = c.and(vis); if (await l.count()) { await l.first().click({ timeout: 5000 }); done = true; break; } }
      if (!done) throw new Error(`tap: nothing named "${arg}"`);
    }
    else if (kind === 'typeLabel') {  // [label, text]: a field by its label or placeholder
      const [lab, txt] = arg; const vis = page.locator(':visible');
      const cands = [page.getByLabel(lab, { exact: true }), page.getByPlaceholder(lab, { exact: true }), page.getByLabel(new RegExp(`^${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)), page.getByPlaceholder(new RegExp(`^${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))];
      let done = false;
      for (const c of cands) { const l = c.and(vis); if (await l.count()) { await l.first().fill(txt, { timeout: 5000 }); done = true; break; } }
      if (!done) throw new Error(`typeLabel: no field named "${lab}"`);
    }
  }
  // A click on something at the edge of a scroller can scroll the whole page sideways; the drawing never is. Put every horizontal offset back to 0.
  await page.evaluate(() => { for (const e of document.querySelectorAll('*')) if (e.scrollLeft && e.scrollWidth - e.clientWidth < 80) e.scrollLeft = 0; document.scrollingElement.scrollLeft = 0; }).catch(() => undefined);
  if (probe) console.log('  bgboxes:', JSON.stringify(await page.$$eval('*', (e) => e.filter((x) => getComputedStyle(x).backgroundImage.startsWith('url')).slice(0, 6).map((x) => { const r = x.getBoundingClientRect(); const c = getComputedStyle(x); return [Math.round(r.width), Math.round(r.height), c.backgroundSize, c.backgroundImage.slice(0, 50)]; }))));
  if (probe) console.log('  imgboxes:', JSON.stringify(await page.$$eval('img', (e) => e.slice(0, 4).map((i) => { const r = i.getBoundingClientRect(); const c = getComputedStyle(i); return [Math.round(r.width), Math.round(r.height), c.opacity, c.visibility, c.objectFit, i.parentElement && getComputedStyle(i.parentElement).opacity]; }))));
  if (probe) console.log('  imgs:', JSON.stringify(await page.$$eval('img', (e) => e.slice(0, 3).map((i) => [i.src.slice(0, 60), i.naturalWidth, i.complete]))), 'bgimgs:', await page.$$eval('*', (e) => e.filter((x) => getComputedStyle(x).backgroundImage.startsWith('url')).length));
  if (probe) console.log('  labels:', (await page.$$eval('[aria-label]', (els) => els.filter((e) => e.getClientRects().length).map((e) => e.getAttribute('aria-label')))).slice(0, 60).join(' | '));
}


/** Entries of design-pulse2 for each compared screen: [name, page, entry id, phone index inside the entry]. */
export const DESIGNS = [
  ['launch', 'index.html', 'launch--promotion', 0], ['player', 'listen.html', 'player--screen', 0], ['player-more', 'listen.html', 'player--screen', 1],
  ['player-playback', 'listen.html', 'player--playback-sheet', 0], ['moments', 'index.html', 'home--moments', 0], ['discover', 'index.html', 'discover--screen', 0],
];
export const COMPARE = DESIGNS.map((d) => d[0]);
/** Wave 2 (lane W2-CAP): group pages render their entries from JS (discover.html, social.html); one phone per entry. */
export const DESIGNS_W2 = [
  ['discover-fold-a', 'discover.html', 'home--fold-a', 0], ['discover-fold-b', 'discover.html', 'home--fold-b', 0],
  ['search-idle', 'discover.html', 'search--screen', 0], ['search-all', 'discover.html', 'search--results-episodes', 0], ['search-shows', 'discover.html', 'search--results', 0],
  ['search-moments', 'discover.html', 'search--results-moments', 0], ['search-people', 'discover.html', 'search--people-empty', 0], ['search-empty', 'discover.html', 'search--empty', 0],
  ['comments', 'social.html', 'comments--screen', 0], ['comments-order', 'social.html', 'comments--order-options-sheet', 0], ['comments-menu', 'social.html', 'comments--comment-menu', 0],
  ['comments-replies', 'social.html', 'comment-thread--screen', 0], ['comments-composer', 'social.html', 'comments--composer-sheet', 0], ['comments-report', 'social.html', 'comments--report-sheet', 0],
  ['comments-rules', 'social.html', 'comments--community-rules', 0], ['comments-recorder', 'social.html', 'comments--voice-record', 0],
  ['chat', 'discover.html', 'chat--screen', 0], ['chat-empty', 'discover.html', 'chat--empty', 0], ['chat-signed-out', 'discover.html', 'chat--signed-out', 0], ['chat-error', 'discover.html', 'chat--error', 0],
  ['me', 'discover.html', 'me--screen', 0], ['me-signed-out', 'discover.html', 'me--signed-out', 0], ['me-plus', 'discover.html', 'me--plus', 0],
];
DESIGNS.push(...DESIGNS_W2, ...DESIGNS_W3, ...DESIGNS_W4, ...DESIGNS_W5, ...DESIGNS_W6, ...DESIGNS_W5B, ...DESIGNS_W7);
export const WAVE2 = DESIGNS_W2.map((d) => d[0]);
export const WAVE3 = DESIGNS_W3.map((d) => d[0]);
export const WAVE4 = DESIGNS_W4.map((d) => d[0]);
export const WAVE5 = DESIGNS_W5.map((d) => d[0]);
export const WAVE6 = DESIGNS_W6.map((d) => d[0]);
export const WAVE5B = DESIGNS_W5B.map((d) => d[0]);
export const WAVE7 = DESIGNS_W7.map((d) => d[0]);
export { DESIGNS_W3, DESIGNS_W4, DESIGNS_W5, DESIGNS_W6, DESIGNS_W5B, DESIGNS_W7 };

/**
 * The drawing's phone as a 390x844 picture, no bezel. `.ph` is 390x844 border-box with a 10 px black border (inner 370x824) and a radius;
 * both go, so the screen is the full 390x844 and lines up with the app. Local fonts replace Google Fonts. Returns {page, ph, rect}.
 */
export async function openDesign(browser, name, scale = 2) {
  const [, file, id, idx] = DESIGNS.find((d) => d[0] === name);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.route('**/*', (rt) => (rt.request().url().startsWith('file:') ? rt.continue() : rt.abort()));
  await page.goto(pathToFileURL(path.join(DESIGN_DIR, file)).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: `${fontCss(pathToFileURL(FONT_DIR).href + '/')}\n.ph{border:0 !important;border-radius:0 !important;outline:0 !important;width:390px !important;height:844px !important;margin:0 !important;transform:none !important}` });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const ph = page.locator(`#${id} .ph`).nth(idx);
  await ph.scrollIntoViewIfNeeded();
  const rect = await ph.boundingBox();
  return { ctx, page, ph, rect };
}

/** Same status bar and home indicator as the drawing (kit.css .sb / .hb), laid over the app. */
const OVERLAY = `<div id="__sb" style="position:fixed;left:0;top:0;width:390px;height:50px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 30px 8px;font:600 15px/1 Geist,system-ui,sans-serif;color:#F4F2EE;z-index:2147483646;pointer-events:none"><span>9:41</span><span style="font:500 12px/1 'Geist Mono',monospace">5G ▮▮▮</span></div><i id="__hb" style="position:fixed;left:50%;bottom:8px;transform:translateX(-50%);width:134px;height:5px;border-radius:3px;background:#F4F2EE;z-index:2147483647;pointer-events:none"></i>`;

/** One PNG per art gradient (600 px), plus the full-screen ones the drawings paint behind Launch and Moments (390x844, same aspect). */
export async function renderArts(browser, scale = 2) {
  const out = new Map();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale });
  const shot = async (css, w, h) => { await p.setViewportSize({ width: w, height: h }); await p.setContent(`<body style="margin:0"><div style="width:${w}px;height:${h}px;background:${css}"></div></body>`); return p.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }); };
  for (const [k, css] of Object.entries(FX.arts)) out.set(`/art-${k}.png`, await shot(css, 300, 300));
  out.set('/launch.jpg', await shot(FX.arts.f, 390, 844));
  for (let i = 0; i < 3; i++) out.set(`/moment-${i}.png`, await shot(FX.arts.a, 390, 844));
  out.set('/pick-0.png', await shot(FX.arts.a, 346, 272));
  await p.close();
  return out;
}

/**
 * Opens the app's route in a fresh 390x844 @2x page with the fixture interceptor and runs its steps.
 * frame: a 50 px top and 34 px bottom safe-area inset (what the drawing's status bar and home indicator imply),
 * the same status bar + indicator drawn over it, and a pinned player clock (position 12:32 of 48:10).
 */
export async function openBuild(browser, base, name, { frame = true, arts, probe = false, errors = [], seen = [], viewport = { width: 390, height: 844 }, initScripts = [], route: routeOverride, onPage } = {}) {
  const route = routeOverride ?? ROUTES[name];  // T094/T105: a caller may pass its own steps + seed (font scale, widths); the fixture still answers by ROUTE_NAME
  if (!route) throw new Error(`unknown route ${name}`);
  ROUTE_NAME = name;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'en-US', permissions: route.camera ? ['microphone', 'camera'] : ['microphone'] });
  if (route.denyCamera) await ctx.addInitScript(() => { const d = (n) => { const e = new Error('Permission denied'); e.name = n; return e; }; if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(d('NotAllowedError')); });  // wave 6: the browser's "Don't Allow"
  // The app passes the global `fetch` around as `deps.fetch` and calls it as a method; a browser throws "Illegal
  // invocation" for that (React Native's polyfill does not), so every API call looked offline. Rebind it.
  // The drawings say TUE 27 OCT; the fixture's `now` is that day, so the page's Date is shifted to it.
  // (shifted, not frozen: animations read the clock, and a frozen Date stops them)
  if (frame) await ctx.addInitScript((now) => { const real = Date, off = now - real.now(); const D = class extends real { constructor(...a) { if (a.length) super(...a); else super(real.now() + off + (window.__skew ?? 0)); } static now() { return real.now() + off + (window.__skew ?? 0); } }; window.Date = D; }, NOW);
  for (const sc of [...initScripts, ...(route.init ?? [])]) await ctx.addInitScript(sc);
  await ctx.addInitScript(() => { const f = window.fetch.bind(window); window.fetch = function (...a) { return f(...a); }; });
  await ctx.addInitScript(([now, state]) => {
    try {
      if (!state.__signedOut) localStorage.setItem('m27.auth', JSON.stringify({ listenerId: 'demo-1', displayName: state.__name, email: state.__email ?? 'demo@example.test', signedInAt: now }));
      delete state.__signedOut; delete state.__name; delete state.__email;
      for (const k of state.__unseed ?? []) delete state[k];
      delete state.__unseed;
      localStorage.setItem('m27.settings', JSON.stringify(state));
    } catch {}
  }, [NOW, { __signedOut: route.signedOut === true, __name: route.authName ?? W2.me.name, __email: route.authEmail, __unseed: route.unseed, ...(route.seed ?? {}), 'terms.accepted': '4', 'age.confirmed': '16@2026-10-01T00:00:00.000Z', 'interests.genreIds': '[1,2,3]', 'rate.answered': 'no', 'updates.lastSeenVersion': '999.0.0', 'me.privateListening': '0' }]);
  { const sn = route.fixAs ?? name; const sr = route.fixAs ? { ...(ROUTES[route.fixAs] ?? {}), ...route } : route; const seed = seedW34(sn, sr) ?? seedW5(sn, sr) ?? seedW6(sn, sr); if (seed) await ctx.addInitScript((j) => { try { localStorage.setItem('m31.seed', j); } catch {} }, JSON.stringify(seed)); }
  if (frame) {
    await ctx.addInitScript(([pos, dur, overlay, css]) => {
      // react-native-safe-area-context (web) reads env(safe-area-inset-*) from a probe element's computed padding; a desktop browser says 0.
      const gcs = window.getComputedStyle.bind(window);
      window.getComputedStyle = (el, p) => {
        const cs = gcs(el, p);
        if (el && el.style && /safe-area|constant\(/.test(el.style.paddingTop + el.style.paddingBottom + el.style.cssText)) {
          return new Proxy(cs, { get: (t, k) => (k === 'paddingTop' ? '50px' : k === 'paddingBottom' ? '34px' : k === 'paddingLeft' || k === 'paddingRight' ? '0px' : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
        }
        return cs;
      };
      // Pinned clock: the 90 s test tone plays, but the page reads 12:32 of 48:10, as drawn. Capture-only.
      if (!window.__realClock) { Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', { get() { return pos; }, set() {}, configurable: true });
      Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get() { return dur; }, configurable: true }); }
      document.addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.innerHTML = overlay; document.body.append(...d.children); const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); });
    }, [FX.positionMs / 1000, DUR / 1000, OVERLAY.replace('width:390px', `width:${viewport.width}px`), `${fontCss('/__fonts/')}`]);
  }
  // Network guard: nothing leaves the machine. Local server passes; everything else is a fixture.
  await ctx.route('**/*', async (rt) => {
    const u = new URL(rt.request().url());
    if (u.hostname === '127.0.0.1') return rt.continue();
    if (u.protocol === 'data:') return rt.continue();
    seen.push(`${rt.request().method()} ${u.host}${u.pathname}`);
    if (route.deadAudio && /\.(mp3|m4a)$/.test(u.pathname)) return rt.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'gone' });  // T104: an episode whose audio address is dead
    if (/\.(mp3|m4a)$/.test(u.pathname)) return rt.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'none' }, body: route.shortAudio ? SILENCE_SHORT : SILENCE });
    if (/\.(png|jpe?g|webp|svg)$/.test(u.pathname)) return rt.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: arts.get(u.pathname) ?? arts.get('/art-a.png') });
    if (u.pathname === '/mn-1-transcript.vtt') return rt.fulfill({ status: 200, contentType: 'text/vtt', headers: { 'access-control-allow-origin': '*' }, body: 'WEBVTT\n\n00:13:58.000 --> 00:14:18.000\n...and that is when the light changes, slowly, over the roofs.\n\n00:14:20.000 --> 00:14:30.000\nI used to fight it. Now I wait for it.\n\n00:14:32.000 --> 00:14:50.000\nThis is the part I replay every morning — the quiet before anyone else is up.\n\n00:14:51.000 --> 00:15:08.000\nYou can hear the city deciding to wake.\n\n00:15:10.000 --> 00:15:30.000\nSo, a small ritual: kettle, window, nothing else.\n' });
    if (u.pathname === '/mn-1-transcript.txt') return rt.fulfill({ status: 200, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: TRANSCRIPT });
    if (u.hostname === 'feeds.example.test') return rt.fulfill({ status: 200, contentType: 'application/rss+xml', headers: { 'access-control-allow-origin': '*' }, body: ANSWER_HOOK ? ANSWER_HOOK(u, { xml: feedXmlW34(u) ?? rss }).xml : (feedXmlW34(u) ?? rss) });
    if (rt.request().method() === 'OPTIONS') return rt.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.hostname.includes('fonts.')) return rt.abort();
    let fx = fixture(u, rt.request().method());
    if (ANSWER_HOOK && fx && !fx.__hang && !fx.__abort && !fx.__status) fx = ANSWER_HOOK(u, fx) ?? fx;
    if (fx?.__hang) return new Promise(() => {});  // a request that never answers (a loading state)
    if (fx?.__abort) return rt.abort('failed');  // a request that never arrives (the app says "Couldn't reach the server.")
    return rt.fulfill({ status: fx?.__status ?? 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fx?.__status ? { error: fx.error, ...(fx.message ? { message: fx.message } : {}) } : fx) });
  });
  const page = await ctx.newPage();
  onPage?.(page);
  // (Until round 3 the capture patched `revert-layer` images here; src/ui/lib/image now keeps the caller's style on web, so nothing is patched.)
  if (probe) { page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('  console:', m.text().slice(0, 200))); page.on('requestfailed', (r) => console.log('  reqfailed:', r.url().slice(0, 100))); }
  page.on('pageerror', (e) => errors.push((e.stack ?? String(e)).slice(0, 1500)));
  await runSteps(page, base, route.steps, probe);
  return { ctx, page };
}

/** Side by side (labelled) and 50 % overlay + red pixel-diff, composed in a canvas. Returns {side, diff} PNG buffers. */
async function compose(browser, name, designPng, buildPng) {
  const p = await browser.newPage({ viewport: { width: 1700, height: 1808 } });
  await p.setContent('<body style="margin:0;background:#000"></body>');
  const r = await p.evaluate(async ([d, b, label]) => {
    const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
    const [di, bi] = [await load(d), await load(b)];
    const W = 780, H = 1688;
    const side = document.createElement('canvas'); side.width = 40 * 3 + W * 2; side.height = 80 + H + 40;
    const s = side.getContext('2d'); s.fillStyle = '#16161b'; s.fillRect(0, 0, side.width, side.height);
    s.fillStyle = '#F4F2EE'; s.font = '600 30px sans-serif';
    s.fillText('DESIGN  design-pulse2 / ' + label, 40, 52); s.fillText('BUILD  web build, ' + label, 40 * 2 + W, 52);
    s.drawImage(di, 40, 80, W, H); s.drawImage(bi, 40 * 2 + W, 80, W, H);
    s.strokeStyle = '#555'; s.lineWidth = 2; s.strokeRect(39, 79, W + 2, H + 2); s.strokeRect(40 * 2 + W - 1, 79, W + 2, H + 2);
    const diff = document.createElement('canvas'); diff.width = W; diff.height = H;
    const g = diff.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.5; g.drawImage(di, 0, 0, W, H); g.drawImage(bi, 0, 0, W, H); g.globalAlpha = 1;
    const read = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H); };
    const A = read(di), B = read(bi), O = g.getImageData(0, 0, W, H);
    let n = 0;
    for (let k = 0; k < A.data.length; k += 4) {
      const dv = Math.max(Math.abs(A.data[k] - B.data[k]), Math.abs(A.data[k + 1] - B.data[k + 1]), Math.abs(A.data[k + 2] - B.data[k + 2]));
      if (dv > 48) { n++; O.data[k] = Math.round(O.data[k] * 0.4 + 255 * 0.6); O.data[k + 1] = Math.round(O.data[k + 1] * 0.4); O.data[k + 2] = Math.round(O.data[k + 2] * 0.4); }
    }
    g.putImageData(O, 0, 0);
    return { side: side.toDataURL('image/png'), diff: diff.toDataURL('image/png'), share: n / (W * H) };
  }, [`data:image/png;base64,${designPng.toString('base64')}`, `data:image/png;base64,${buildPng.toString('base64')}`, name]);
  await p.close();
  const buf = (u) => Buffer.from(u.split(',')[1], 'base64');
  return { side: buf(r.side), diff: buf(r.diff), share: r.share };
}

/**
 * One picture of every compared screen: a row per screen, design | build | diff, a third of the size, labelled. Written to <outDir>/<file>.
 * `cols` > 1 lays the rows out in that many columns (wave 2 has 23 screens; one column would be 14000 px tall).
 */
export async function contactSheet(browser, outDir, names, { file = 'wave-1b.png', cols = 1 } = {}) {
  const W = 260, H = 563, PAD = 20, TITLE = 34, HEAD = 56;
  const rows = names.filter((n) => existsSync(path.join(outDir, `${n}-design.png`)) && existsSync(path.join(outDir, `${n}-build.png`)) && existsSync(path.join(outDir, `${n}-diff.png`)));
  const uri = (n, k) => `data:image/png;base64,${readFileSync(path.join(outDir, `${n}-${k}.png`)).toString('base64')}`;
  const per = Math.ceil(rows.length / cols), CW = 3 * W + 4 * PAD;
  const p = await browser.newPage({ viewport: { width: cols * CW, height: HEAD + per * (TITLE + H + PAD) } });
  await p.setContent('<body style="margin:0;background:#16161b"></body>');
  const png = await p.evaluate(async ([list, W, H, PAD, TITLE, HEAD, cols, per, CW]) => {
    const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
    const c = document.createElement('canvas'); c.width = cols * CW; c.height = HEAD + per * (TITLE + H + PAD);
    const g = c.getContext('2d'); g.fillStyle = '#16161b'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#F4F2EE'; g.font = '600 22px sans-serif';
    for (let col = 0; col < cols; col++) ['DESIGN', 'BUILD  (web)', 'DIFF  (red = differs)'].forEach((t, k) => g.fillText(t, col * CW + PAD + k * (W + PAD), 36));
    for (let r = 0; r < list.length; r++) {
      const col = Math.floor(r / per), row = r % per, ox = col * CW;
      const y = HEAD + row * (TITLE + H + PAD);
      g.fillStyle = '#A3A1AB'; g.font = '600 18px sans-serif'; g.fillText(list[r].name, ox + PAD, y + 24);
      for (let k = 0; k < 3; k++) { const im = await load(list[r].src[k]); g.drawImage(im, ox + PAD + k * (W + PAD), y + TITLE, W, H); g.strokeStyle = '#444'; g.strokeRect(ox + PAD + k * (W + PAD) - 0.5, y + TITLE - 0.5, W + 1, H + 1); }
    }
    return c.toDataURL('image/png');
  }, [rows.map((n) => ({ name: n, src: ['design', 'build', 'diff'].map((k) => uri(n, k)) })), W, H, PAD, TITLE, HEAD, cols, per, CW]);
  writeFileSync(path.join(outDir, file), Buffer.from(png.split(',')[1], 'base64'));
  await p.close();
}

async function compare(pw, web, outDir, names) {
  const server = await serve(web);
  const base = `http://127.0.0.1:${server.address().port}`;
  mkdirSync(outDir, { recursive: true });
  const browser = await pw.chromium.launch(LAUNCH);
  const arts = await renderArts(browser);
  const fails = [];
  for (const name of (arg('sheetonly') ? [] : names)) {
    try {
      const d = await openDesign(browser, name);
      const dPng = await d.page.screenshot({ path: path.join(outDir, `${name}-design.png`), clip: { x: d.rect.x, y: d.rect.y, width: 390, height: 844 } });  // clip, not element: a fractional element box rounds to 1690 px
      await d.ctx.close();
      const errors = [];
      const b = await openBuild(browser, base, name, { frame: true, arts, errors }).catch((e) => { fails.push(`${name}: ${String(e).slice(0, 160)}`); return null; });
      if (!b) continue;
      const bPng = await b.page.screenshot({ path: path.join(outDir, `${name}-build.png`) });
      await b.ctx.close();
      const c = await compose(browser, KIT_W7[name] ? (KIT_W7[name][2] === 'Bars' ? `${name} (design = the bars drawing, index.html section 2)` : `${name} (kit rule: design = ${KIT_W7[name][2]} ${KIT_W7[name][1]})`) : name, dPng, bPng);
      writeFileSync(path.join(outDir, `${name}-side.png`), c.side);
      writeFileSync(path.join(outDir, `${name}-diff.png`), c.diff);
      console.log(`ok   ${name}  design+build+side+diff  (pixels differing >48: ${(c.share * 100).toFixed(1)} %${errors.length ? `, page errors ${errors.length}` : ''})`);
    } catch (e) { fails.push(`${name}: ${String(e).slice(0, 200)}`); console.log(`FAIL ${name}`); }
  }
  await contactSheet(browser, outDir, names, { file: String(arg('sheet') ?? 'wave-1b') + '.png', cols: Number(arg('cols') ?? 1) });
  await browser.close(); server.close();
  if (fails.length) { console.log('\nFailures:\n' + fails.join('\n')); process.exitCode = 1; }
}

export function loadPlaywright() {
  const requireFrom = createRequire(import.meta.url);
  try { return requireFrom('playwright'); } catch { return requireFrom(path.join(process.env.NODE_PATH ?? '', 'playwright')); }
}

async function main() {
  const pw = loadPlaywright();
  const web = build();
  const built = !arg('web');
  const keepWeb = () => { if (built && arg('keep') !== true) rmSync(web, { recursive: true, force: true }); };
  if (arg('compare')) {
    const names = arg('sheetonly') ? (arg('wave3') ? WAVE3 : arg('wave4') ? WAVE4 : arg('wave5') ? WAVE5 : arg('wave6') ? WAVE6 : arg('wave5b') ? WAVE5B : arg('wave7') ? WAVE7 : WAVE2) : arg('routes') && arg('routes') !== true ? String(arg('routes')).split(',') : arg('wave2') ? WAVE2 : arg('wave3') ? WAVE3 : arg('wave4') ? WAVE4 : arg('wave5') ? WAVE5 : arg('wave6') ? WAVE6 : arg('wave5b') ? WAVE5B : arg('wave7') ? WAVE7 : COMPARE;
    await compare(pw, web, path.resolve(String(arg('out') ?? '../../specs/033-m31-redesign/contact/wave-1b')), names);
    keepWeb(); return;
  }
  const server = await serve(web);
  const base = `http://127.0.0.1:${server.address().port}`;
  mkdirSync(outDir, { recursive: true });
  const names = arg('routes') && arg('routes') !== true ? String(arg('routes')).split(',') : KEY;
  const browser = await pw.chromium.launch(LAUNCH);
  const arts = await renderArts(browser);
  const frame = arg('frame') === true;
  const failures = [];
  for (const name of names) {
    const errors = [], seen = [];
    let b;
    try {
      b = await openBuild(browser, base, name, { frame, arts, probe, errors, seen });
      await b.page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`) });
      console.log(`ok   ${name}${errors.length ? `  (page errors: ${errors.length})` : ''}`);
      if (probe) console.log('  requests:', [...new Set(seen)].join('\n    '), '\n  errors:', errors.join(' | '));
    } catch (e) {
      failures.push(`${name}: ${String(e).slice(0, 200)}`); console.log(`FAIL ${name}`);
    }
    await b?.ctx.close();
  }
  await browser.close();
  server.close();
  keepWeb();
  if (failures.length) { console.log('\nFailures:\n' + failures.join('\n')); process.exitCode = 1; }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
