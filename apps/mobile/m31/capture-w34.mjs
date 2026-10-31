// M31 waves 3 and 4 (lane C34): which drawing beside which route, how the build gets there, and what the fake API answers.
// capture-web.mjs imports this and merges it in (DESIGNS, ROUTES, fixture()). Web build only; not a device.
// DESIGNS_Wn rows: [name, drawing page, entry id, phone index inside the entry].
export const DESIGNS_W3 = [
  // Episode
  ['episode', 'listen.html', 'episode--screen', 0], ['episode-notes', 'listen.html', 'episode--screen', 1],
  ['episode-more', 'listen.html', 'episode--more-sheet', 0], ['episode-more-playlist', 'listen.html', 'episode--more-sheet-playlist-picker', 0],
  ['episode-more-moment', 'listen.html', 'episode--more-sheet-save-moment', 0], ['episode-like', 'listen.html', 'episode--like-sheet', 0],
  ['episode-clips-empty', 'listen.html', 'episode--clips-empty', 0], ['episode-related-empty', 'listen.html', 'episode--related-empty', 0],
  ['episode-picture', 'listen.html', 'episode--picture-viewer', 0],
  ['toast-episode', 'listen.html', 'toast--episode-page', 0], ['toast-download', 'listen.html', 'toast--download-button', 0],
  ['toast-queue', 'listen.html', 'toast--queue-buttons', 0], 
  // Queue and the player's queue sheet
  ['episode-card-sheet', 'listen.html', 'episode--card-sheet', 0], ['toast-card-sheet', 'listen.html', 'toast--card-sheet', 0], ['queue', 'listen.html', 'queue--screen', 0], ['queue-empty', 'listen.html', 'queue--empty', 0], ['queue-item-sheet', 'listen.html', 'queue--item-sheet', 0],
  ['queue-conflict', 'listen.html', 'queue--conflict-chooser', 0],
  ['player-queue', 'listen.html', 'player--queue-sheet', 0], ['player-queue-edit', 'listen.html', 'player--queue-sheet-edit', 0],
  ['player-queue-clear', 'listen.html', 'player--queue-clear-dialog', 0], ['player-queue-empty', 'listen.html', 'player--queue-empty', 0],
  ['player-share', 'listen.html', 'player--share-sheet', 0], ['player-transcript', 'listen.html', 'player--transcript-pane', 0],
  // Downloads
  ['downloads', 'listen.html', 'downloads--screen', 0], ['downloads-empty', 'listen.html', 'downloads--empty', 0], ['downloads-settings', 'listen.html', 'downloads--settings', 0],
  ['downloads-select', 'listen.html', 'downloads--select-mode', 0], ['downloads-delete', 'listen.html', 'downloads--delete-dialog', 0], ['toast-downloads', 'listen.html', 'toast--downloads', 0],
  // Clip, New clip, Transcript, Voice status
  ['clip', 'listen.html', 'clip--screen', 0], ['clip-signed-out', 'listen.html', 'clip--signed-out', 0], ['clip-share', 'listen.html', 'clip--share-sheet', 0], ['clip-not-found', 'listen.html', 'clip--not-found', 0],
  ['clip-new', 'listen.html', 'clip-new--screen', 0], ['clip-new-signed-out', 'listen.html', 'clip-new--signed-out', 0], ['clip-new-missing', 'listen.html', 'clip-new--episode-missing', 0],
  ['clip-new-saved', 'listen.html', 'clip-new--saved-share-panel', 0], ['toast-clip-new', 'listen.html', 'toast--clip-new', 0],
  ['transcript', 'shell.html', 'transcript--screen', 0], ['transcript-none', 'listen.html', 'transcript--none-on-phone', 0],
  ['voice-new', 'social.html', 'voice-new--screen', 0], ['voice-new-recording', 'social.html', 'voice-new--recording', 0],
  // Playlists, Playlist
  ['playlists', 'listen.html', 'playlists--screen', 0], ['playlists-signed-out', 'listen.html', 'playlists--signed-out', 0], ['playlists-empty', 'listen.html', 'playlists--empty', 0],
  ['playlists-error', 'listen.html', 'playlists--load-error', 0], ['toast-playlists', 'listen.html', 'toast--playlists', 0],
  ['playlist', 'listen.html', 'playlist--screen', 0], ['playlist-rename', 'listen.html', 'playlist--rename', 0], ['playlist-delete', 'listen.html', 'playlist--delete-dialog', 0], ['playlist-missing', 'listen.html', 'playlist--missing', 0],
  // History, Favourites, Saved moments, My comments, Likes, Listening data
  ['history', 'listen.html', 'history--screen', 0], ['history-empty', 'listen.html', 'history--empty', 0], ['history-select', 'listen.html', 'history--select-mode', 0],
  ['history-clear', 'listen.html', 'history--clear-dialog', 0], ['history-sheet', 'listen.html', 'history--episode-sheet', 0], ['toast-history', 'listen.html', 'toast--history', 0],
  ['favourites', 'shell.html', 'favourites--screen', 0], ['favourites-empty', 'shell.html', 'favourites--empty', 0], ['favourites-comments', 'listen.html', 'favourites--comments-tab', 0],
  ['moments-saved', 'listen.html', 'moments--screen', 0], ['moments-saved-empty', 'listen.html', 'moments--empty', 0], ['moments-saved-edit', 'listen.html', 'moments--edit-note', 0],
  ['my-comments', 'listen.html', 'my-comments--screen', 0], ['my-comments-signed-out', 'listen.html', 'my-comments--signed-out', 0], ['my-comments-empty', 'listen.html', 'my-comments--empty', 0],
  ['likes', 'listen.html', 'likes--screen', 0], ['likes-signed-out', 'listen.html', 'likes--signed-out', 0], ['likes-empty', 'listen.html', 'likes--empty', 0], ['likes-error', 'listen.html', 'likes--error', 0],
  ['like', 'listen.html', 'like--screen', 0], ['like-gone', 'listen.html', 'like--gone', 0],
  ['me-listening', 'discover.html', 'me-listening--screen', 0], ['me-listening-empty', 'discover.html', 'me-listening--empty', 0],
];
export const DESIGNS_W4 = [
  // (the Profile page itself, its More sheet and the block dialog belong to another lane and are still the old design at cafd03ea: not compared)
  ['profile-followers', 'social.html', 'profile-followers--screen', 0], ['profile-followers-empty', 'social.html', 'profile-followers--own-empty', 0],
  ['profile-following', 'social.html', 'profile-following--screen', 0],
  ['profile-likes', 'social.html', 'profile-likes--screen', 0], ['profile-likes-empty', 'social.html', 'profile-likes--empty', 0],
  ['profile-subscriptions', 'social.html', 'profile-subscriptions--screen', 0], ['profile-subscriptions-private', 'social.html', 'profile-subscriptions--private', 0],
  ['profile-edit', 'social.html', 'profile-edit--screen', 0], ['profile-edit-signed-out', 'social.html', 'profile-edit--signed-out', 0],
  ['stickers', 'social.html', 'stickers--screen', 0], ['stickers-none', 'social.html', 'stickers--none-earned', 0], ['stickers-card', 'social.html', 'stickers--card-sheet', 0],
  ['stickers-decorate', 'social.html', 'stickers-decorate--screen', 0], ['stickers-decorate-empty', 'social.html', 'stickers-decorate--empty', 0], ['stickers-help', 'social.html', 'stickers-help--screen', 0],
  ['status', 'social.html', 'status--screen', 0], ['status-own', 'social.html', 'status--screen', 0], ['status-more', 'social.html', 'status--more-sheet', 0], ['status-gone', 'social.html', 'status--gone', 0], ['status-signed-out', 'social.html', 'status--signed-out', 0],
  ['status-text', 'social.html', 'status-text--screen', 0], ['status-text-episode', 'social.html', 'status-text--add-episode-sheet', 0], ['status-text-signed-out', 'social.html', 'status-text--signed-out', 0],
  ['voice-posts', 'social.html', 'voice-posts--chooser-sheet', 0], ['voice-posts-delete', 'social.html', 'voice-posts--delete-dialog', 0],
  ['chat-thread', 'social.html', 'chat-thread--screen', 0], ['chat-thread-cannot-send', 'social.html', 'chat-thread--cannot-send', 0],
  ['chat-thread-signed-out', 'social.html', 'chat-thread--signed-out', 0], ['chat-thread-error', 'social.html', 'chat-thread--error', 0],
  ['chat-new', 'social.html', 'chat-new--screen', 0], ['chat-new-send-to', 'social.html', 'chat-new--send-to', 0], ['chat-new-signed-out', 'social.html', 'chat-new--signed-out', 0],
  ['notifications', 'social.html', 'notifications--people', 0], ['notifications-empty', 'social.html', 'notifications--people-empty', 0], ['notifications-signed-out', 'social.html', 'notifications--signed-out', 0],
  ['notifications-interactions', 'social.html', 'notifications--interactions', 0], ['notifications-interactions-empty', 'social.html', 'notifications--interactions-empty', 0],
  ['notifications-mute', 'social.html', 'notifications--mute-sheet', 0],
  ['notifications-hosts', 'social.html', 'notifications-hosts--screen', 0], ['notifications-hosts-empty', 'social.html', 'notifications-hosts--empty', 0],
  ['notifications-system', 'social.html', 'notifications-system--screen', 0], ['notifications-system-empty', 'social.html', 'notifications-system--empty', 0],
  ['friends-listening', 'discover.html', 'friends-listening--screen', 0], ['friends-listening-empty', 'discover.html', 'friends-listening--empty', 0], ['friends-listening-help', 'discover.html', 'friends-listening--help-sheet', 0],
  ['muted-threads', 'social.html', 'muted-threads--toast', 0],
];

/** Set by capture-web.mjs: the shared sample data and builders (card(), fnv1a64(), ...). */
let H = null;
export function initW34(helpers) { H = helpers; }

// ---- The catalogue: the shows and episodes the drawings of waves 3 and 4 name (queue, downloads, history, favourites ...) ----
// [slug, show title, author, art key, [[episode title, seconds], ...]]. Morning Notes is the feed the older waves already use (guids mn-1...).
export const CAT = [
  ['morning-notes', 'Morning Notes', 'Lin Wei', 'a', [['Why mornings matter', 2890], ['The ten minute walk', 2400], ['Coffee, slowly', 2100], ['Keeping a notebook', 1900], ['Bread at 5 a.m.', 1500]]],
  ['night-shift-radio', 'Night Shift Radio', 'Mia Tan', 'd', [['Cities that sleep late', 2300]]],
  ['field-recordings', 'Field Recordings', 'Tom Ito', 'b', [['The long walk home', 3120], ['Rain on tin', 1500]]],
  ['money-plainly', 'Money, Plainly', 'Lee Park', 'b', [['Rent, explained twice', 2100]]],
  ['kitchen-table', 'Kitchen Table', 'Mei Chen', 'c', [['Bread, slowly', 1860]]],
  ['deep-work-weekly', 'Deep Work Weekly', 'Sam Okoye', 'e', [['Notes on attention', 2400]]],
  ['slow-places', 'Slow Places', 'Ana Ruiz', 'h', [['What the river knows', 3300], ['The slow commute', 1500]]],
  ['big-ideas', 'Big Ideas', 'Kai Lund', 'f', [['Small talk, big ideas', 1800]]],
  ['rain-room', 'Rain Room', 'Bea Sato', 'g', [['Ten minutes of rain', 600]]],
];
export const feedUrlOf = (slug) => `https://feeds.example.test/${slug}.xml`;
const guidOf = (slug, n) => (slug === 'morning-notes' && n < 4 ? `mn-${n + 1}` : `${slug}-${n + 1}`);
/** Look an episode up by its title: { id, feedUrl, guid, title, show, secs, art, slug }. */
export function EPS() {
  const out = {};
  for (const [slug, show, author, art, eps] of CAT) eps.forEach(([title, secs], n) => { const feedUrl = slug === 'morning-notes' ? H.FEED : feedUrlOf(slug); const guid = guidOf(slug, n); out[title] = { id: H.fnv1a64(`${feedUrl}\u0001${guid}`), feedUrl, guid, title, show, author, secs, art, slug, n }; });
  return out;
}
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** The RSS of one catalogue show; Morning Notes = the shared feed plus its fifth item. */
export function feedXmlW34(u) {
  if (!H) return undefined;
  const slug = u.pathname.replace(/^\//, '').replace(/\.xml$/, '');
  const row = CAT.find((c) => c[0] === slug);
  if (!row) return undefined;
  if (slug === 'morning-notes') {
    const e = EPS()['Bread at 5 a.m.'];
    const mn1 = H.rss.replace('mn-1-transcript.txt" type="text/plain"', 'mn-1-transcript.vtt" type="text/vtt"').replace(/(<item><title>Why mornings matter<\/title><guid[^>]*>mn-1<\/guid><pubDate>)[^<]*/, `$1${new Date(H.NOW - 3600000).toUTCString()}`).replace(/(mn-1<\/guid>.*?<description>)[^<]*/, '$1&lt;p&gt;A short one about the first hour of the day. 04:12 why it counts, 12:05 the coffee question.&lt;/p&gt;&lt;img src="https://img.example.test/art-e.png" alt="the kitchen at 6 a.m."/&gt;');
    return mn1.replace('</channel>', `<item><title>${esc(e.title)}</title><guid isPermaLink="false">${e.guid}</guid><pubDate>${new Date(H.NOW - 9 * 86400000).toUTCString()}</pubDate><description>${esc(e.title)}.</description><itunes:duration>${e.secs}</itunes:duration><enclosure url="https://cdn.example.test/${e.guid}.mp3" length="1000000" type="audio/mpeg"/></item></channel>`);
  }
  const [, show, author, art, eps] = row;
  const img = H.artUrl(art);
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${esc(show)}</title><link>https://example.test/${slug}</link><description>${esc(show)}, a sample show.</description><language>en</language><itunes:author>${esc(author)}</itunes:author><itunes:image href="${img}"/><image><url>${img}</url><title>${esc(show)}</title></image>${eps.map(([t, secs], n) => `<item><title>${esc(t)}</title><guid isPermaLink="false">${guidOf(slug, n)}</guid><pubDate>${new Date(H.NOW - (n + 2 + CAT.indexOf(row)) * 86400000).toUTCString()}</pubDate><description>${esc(t)}.</description><itunes:duration>${secs}</itunes:duration><itunes:image href="${img}"/><enclosure url="https://cdn.example.test/${slug}-${n + 1}.mp3" length="1000000" type="audio/mpeg"/></item>`).join('')}</channel></rss>`;
}

export const DAY = 86400000;
/** What is on the phone, as the drawings of waves 3 and 4 show it (history rows, queue, subscriptions). A route may replace any key. */
export function baseStores() {
  const E = EPS(); const NOW = H.NOW;
  return {
    now: NOW,
    feeds: Object.fromEntries(CAT.map(([slug]) => { const u = slug === 'morning-notes' ? H.FEED : feedUrlOf(slug); return [u, feedXmlW34(new URL(u))]; })),
    subs: CAT.map(([slug], i) => ({ feedUrl: slug === 'morning-notes' ? H.FEED : feedUrlOf(slug), starred: i < 3 })),
    positions: [
      { episodeId: E['Why mornings matter'].id, offsetMs: 730000, durationMs: 2890000, at: NOW - 3600000 },
      { episodeId: E['Cities that sleep late'].id, offsetMs: 2290000, durationMs: 2300000, at: NOW - 7200000 },
      { episodeId: E['The long walk home'].id, offsetMs: 3100000, durationMs: 3120000, finished: true, at: NOW - 1 * DAY - 3600000 },
      { episodeId: E['Bread, slowly'].id, offsetMs: 1450000, durationMs: 1860000, at: NOW - 3 * DAY },
      { episodeId: E['What the river knows'].id, offsetMs: 3290000, durationMs: 3300000, finished: true, at: NOW - 4 * DAY },
    ],
    session: { episodeId: E['Why mornings matter'].id },
    queue: ['Cities that sleep late', 'The long walk home', 'Bread, slowly', 'Notes on attention'].map((t) => E[t].id),
  };
}
/** The seed written to localStorage `m31.seed` for a route (m31/capture-sqlite-shim.ts reads it), or undefined for the older waves' routes. */
export function seedW34(name, route) {
  if (!H || !(name in ROUTES_W3 || name in ROUTES_W4)) return undefined;
  const extra = route.stores === 'DL' ? { downloads: downloadsSeed() } : (route.stores ?? {});
  if (extra.downloads && process.env.DLN) extra.downloads = extra.downloads.slice(Number(process.env.DLN.split(':')[0]), Number(process.env.DLN.split(':')[1]));
  const base = baseStores();
  if ((W4NAMES.has(name) || route.nomini) && !route.mini) delete base.session;
  if (route.unsub) base.subs = base.subs.filter((x) => !x.feedUrl.includes(route.unsub));
  return { ...base, ...extra };
}

const MB = 1000000;
const downloadsSeed = () => { const E = EPS(); const NOW = H.NOW; const d = (t, state, done, total, extra = {}) => ({ episodeId: E[t].id, url: `https://cdn.example.test/${E[t].guid}.mp3`, state, bytesDone: done, bytesTotal: total, at: NOW - 3600000, ...extra });
  return [d('Cities that sleep late', 'downloading', 16 * MB, 38 * MB), d('The long walk home', 'paused', 5 * MB, 52 * MB), d('Bread, slowly', 'failed', 0, 31 * MB, { error: 'Not enough space' }), d('Small talk, big ideas', 'failed', 0, 30 * MB, { error: 'network lost' }),
    d('Why mornings matter', 'complete', 46 * MB, 46 * MB), d('Notes on attention', 'complete', 41 * MB, 41 * MB), d('What the river knows', 'complete', 55 * MB, 55 * MB), d('Ten minutes of rain', 'complete', 9 * MB, 9 * MB)]; };
const CITIES_DL = { get stores() { return { downloads: [{ url: `https://cdn.example.test/${EPS()['Cities that sleep late'].guid}.mp3`, episodeId: EPS()['Cities that sleep late'].id, state: 'complete', bytesDone: 38 * MB, bytesTotal: 38 * MB, at: H.NOW - 3600000 }] }; } };
const at = (path) => [['goto', path], ['wait', 3000]];
const FAVS = () => { const E = EPS(); const NOW = H.NOW; return { 'me.favourites': JSON.stringify(['Why mornings matter', 'Cities that sleep late', 'Rain on tin', 'The slow commute', 'Bread at 5 a.m.'].map((t, i) => ({ episodeId: E[t].id, at: NOW - (i + 1) * DAY }))), 'me.favComments': JSON.stringify([{ commentId: 'f1', episodeId: E['Why mornings matter'].id, body: 'This is the part I replay every morning.', author: 'Rui', offsetMs: 872000, at: NOW - 5 * 3600000 }, { commentId: 'f2', episodeId: E['The long walk home'].id, body: 'The rain sound at the end. Perfect.', author: 'Aisha', offsetMs: 1870000, at: NOW - 2 * DAY }, { commentId: 'f3', episodeId: E['Bread, slowly'].id, body: '', author: 'Tom', offsetMs: 400000, at: NOW - 3 * DAY }]) }; };
const MOMS = () => { const E = EPS(); const NOW = H.NOW; return { 'me.moments': JSON.stringify([['Why mornings matter', 752000, 'the coffee question — send to Ana'], ['The long walk home', 1870000, ''], ['Bread, slowly', 600000, 'start here'], ['Notes on attention', 300000, ''], ['Cities that sleep late', 900000, 'night buses']].map(([t, ms, note], i) => ({ id: `m${i}`, episodeId: E[t].id, atMs: ms, note, savedAt: NOW - (i + 1) * 3600000 }))) }; };
const epPath = (t) => `/episode/${EPS()[t].id}`;
export const ROUTES_W3 = {
  episode: { unsub: 'morning-notes', get steps() { return at(epPath('Why mornings matter')); } },
  'episode-more': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^More: play next/], ['wait', 1200]]; } },
  'episode-like': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^Like this episode/], ['wait', 1500]]; } },
  'episode-notes': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['scroll', 790]]; } },
  'player-transcript': { steps: [...at('/player'), ['label', /^More$/], ['wait', 900], ['label', /^Transcript/], ['wait', 1500]] },
  'episode-picture': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['scroll', 3000], ['label', /^Picture:/], ['wait', 1200]]; } },
  'episode-clips-empty': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['scroll', 1037]]; } },
  'episode-related-empty': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['scroll', 1239]]; } },
  'toast-episode': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^Add to queue/], ['wait', 700]]; } },
  'toast-queue': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^Add to queue/], ['wait', 900]]; } },
  'episode-more-playlist': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^More: play next/], ['wait', 900], ['label', /^Add to playlist/], ['wait', 1200]]; } },
  'toast-download': { unsub: 'morning-notes', seed: { 'downloads.budgetBytes': '200000000' }, stores: { downloads: [{ url: 'https://cdn.example.test/x1.mp3', episodeId: 'x1', state: 'complete', bytesDone: 106000000, bytesTotal: 106000000, at: 1 }, { url: 'https://cdn.example.test/x2.mp3', episodeId: 'x2', state: 'complete', bytesDone: 106000000, bytesTotal: 106000000, at: 2 }] }, get steps() { return [...at(epPath('Why mornings matter')), ['label', /^More: play next/], ['wait', 900], ['label', /^Download this episode/], ['wait', 900]]; } },
  'episode-more-moment': { unsub: 'morning-notes', get steps() { return [...at(epPath('Why mornings matter')), ['label', /^More: play next/], ['wait', 900], ['label', /^Save the moment/], ['wait', 900]]; } },
  'player-queue': { get stores() { return CITIES_DL.stores; }, steps: [...at('/player'), ['label', /^Playlist$/], ['wait', 1500]] },
  'player-queue-edit': { get stores() { return CITIES_DL.stores; }, steps: [...at('/player'), ['label', /^Playlist$/], ['wait', 1500], ['label', /^Edit/], ['wait', 800]] },
  'queue-edit': { get stores() { return CITIES_DL.stores; }, steps: [...at('/queue'), ['label', /^Edit/], ['wait', 800]] },
  'episode-card-sheet': { steps: [...at('/chart'), ['hold', /^Notes on attention/], ['wait', 1200]] },
  'toast-card-sheet': { steps: [...at('/chart'), ['hold', /^Notes on attention/], ['wait', 900]] },
  'queue-item-sheet': { get stores() { return CITIES_DL.stores; }, steps: [...at('/queue'), ['label', /^More/], ['wait', 900]] },
  'player-queue-clear': { get stores() { return CITIES_DL.stores; }, steps: [...at('/player'), ['label', /^Playlist$/], ['wait', 1500], ['label', /^Edit/], ['wait', 600], ['label', /^Select Cities/], ['label', /^Clear all/], ['wait', 900]] },
  'player-queue-empty': { stores: { queue: [] }, steps: [...at('/player'), ['label', /^Playlist$/], ['wait', 1500]] },
  'player-share': { get stores() { return CITIES_DL.stores; }, steps: [...at('/player'), ['label', /^Share/], ['wait', 1200]] },
  'queue-conflict': { get seed() { return { 'queue.synced': JSON.stringify({ listenerId: 'demo-1', items: [EPS()['Rain on tin'].id], version: 3 }) }; }, steps: [...at('/queue'), ['wait', 4000]] },
  queue: { get stores() { return CITIES_DL.stores; }, steps: at('/queue') },
  clip: { steps: at('/clip/c1') }, 'clip-signed-out': { signedOut: true, steps: at('/clip/c1') }, 'clip-not-found': { steps: at('/clip/c1') },
  'clip-share': { steps: [...at('/clip/c1'), ['label', /^Share/], ['wait', 1200]] },
  'clip-new': { get steps() { return at(`/clip/new?episodeId=${EPS()['Why mornings matter'].id}&positionMs=752000&startMs=722000&endMs=752000`); } },
  'clip-new-signed-out': { signedOut: true, get steps() { return at(`/clip/new?episodeId=${EPS()['Why mornings matter'].id}&positionMs=752000`); } },
  'clip-new-missing': { steps: at('/clip/new?episodeId=zzzz&positionMs=752000') },
  'toast-clip-new': { get steps() { return [...at(`/clip/new?episodeId=${EPS()['Why mornings matter'].id}&positionMs=752000&startMs=722000&endMs=752000`), ['label', /^Save/], ['wait', 1500]]; } },
  'clip-new-saved': { get steps() { return [...at(`/clip/new?episodeId=${EPS()['Why mornings matter'].id}&positionMs=752000&startMs=722000&endMs=752000`), ['label', /^Save/], ['wait', 1500]]; } },
  transcript: { get steps() { return [...at(epPath('Why mornings matter')), ['label', 'Play this episode'], ['wait', 2500], ['label', /^More$/], ['wait', 900], ['label', /^Transcript/], ['wait', 1500], ['label', /^Open the transcript full screen/], ['wait', 2000]]; } },
  'transcript-none': { get steps() { return at(`/transcript/${EPS()['Cities that sleep late'].id}`); } },
  'voice-new': { nomini: true, steps: at('/voice/new') },
  'voice-new-recording': { nomini: true, steps: [...at('/voice/new'), ['label', /^Start recording/], ['wait', 1500]] },
  playlists: { steps: at('/playlists') }, 'playlists-signed-out': { signedOut: true, steps: at('/playlists') }, 'playlists-empty': { steps: at('/playlists') }, 'playlists-error': { steps: at('/playlists') },
  playlist: { steps: at('/playlists/pl0') }, 'playlist-missing': { steps: at('/playlists/pl0') },
  'playlist-rename': { steps: [...at('/playlists/pl0'), ['label', /^Rename playlist/], ['wait', 900]] },
  'playlist-delete': { steps: [...at('/playlists/pl0'), ['label', /^Delete playlist/], ['wait', 900]] },
  'toast-playlists': { steps: [...at('/playlists'), ['fillLabel', [/^New playlist name/, 'Evening walks']], ['label', /^New playlist$/], ['wait', 1200]] },
  'history-select': { steps: [...at('/history'), ['label', /^Select$/], ['wait', 500], ['label', /^Select Why mornings/], ['wait', 400]] },
  'history-clear': { steps: [...at('/history'), ['label', /^Select$/], ['wait', 600], ['label', /^Clear all/], ['wait', 900]] },
  'history-sheet': { steps: [...at('/history'), ['hold', /^Why mornings matter/], ['wait', 900]] },
  'toast-history': { steps: [...at('/history'), ['label', /^Select$/], ['wait', 500], ['label', /^Select Cities/], ['label', /^Delete/], ['wait', 900]] },
  favourites: { get seed() { return FAVS(); }, steps: at('/favourites') },
  'favourites-empty': { steps: at('/favourites') },
  'favourites-comments': { get seed() { return FAVS(); }, steps: [...at('/favourites'), ['text', /^Comments/], ['wait', 900]] },
  'moments-saved': { get seed() { return MOMS(); }, steps: at('/moments') },
  'moments-saved-empty': { steps: at('/moments') },
  'moments-saved-edit': { get seed() { return MOMS(); }, steps: [...at('/moments'), ['label', /^Edit note/], ['wait', 900]] },
  'my-comments': { steps: at('/my-comments') }, 'my-comments-signed-out': { signedOut: true, steps: at('/my-comments') }, 'my-comments-empty': { steps: at('/my-comments') },
  likes: { steps: at('/likes') }, 'likes-signed-out': { signedOut: true, steps: at('/likes') }, 'likes-empty': { steps: at('/likes') }, 'likes-error': { steps: at('/likes') },
  like: { get steps() { return at(`/like/u-Aisha/${EPS()['The long walk home'].id}`); } }, 'like-gone': { get steps() { return at(`/like/u-Aisha/${EPS()['The long walk home'].id}`); } },
  'me-listening': { steps: at('/me/listening') }, 'me-listening-empty': { steps: at('/me/listening') },
  downloads: { stores: 'DL', seed: { 'downloads.budgetBytes': '1073741824' }, steps: at('/downloads') },
  'downloads-settings': { stores: 'DL', seed: { 'downloads.budgetBytes': '1073741824' }, steps: [...at('/downloads'), ['label', /^(Download settings|Settings)/], ['wait', 900]] },
  'downloads-select': { stores: 'DL', seed: { 'downloads.budgetBytes': '1073741824' }, steps: [...at('/downloads'), ['label', /^Select/], ['wait', 600]] },
  'downloads-delete': { stores: 'DL', seed: { 'downloads.budgetBytes': '1073741824' }, steps: [...at('/downloads'), ['label', /^Select$/], ['wait', 500], ['label', /^Select Why mornings/], ['label', /^Delete/], ['wait', 900]] },
  'toast-downloads': { stores: 'DL', seed: { 'downloads.budgetBytes': '1073741824' }, steps: [...at('/downloads'), ['label', /^Select$/], ['wait', 500], ['label', /^Select Why mornings/], ['label', /^Delete/], ['wait', 900], ['text', /^Delete$/], ['wait', 900]] },
  'downloads-empty': { steps: at('/downloads') },
  history: { steps: at('/history') },
  'history-empty': { stores: { positions: [] }, steps: at('/history') },
  'queue-empty': { stores: { queue: [] }, steps: at('/queue') },
};
const W4NAMES = new Set(DESIGNS_W4.map((d) => d[0]));
const PEOPLE = [['Rui Costa', 'Mornings and maps', 'R'], ['Ana', 'Night owl', 'A'], ['Jo', '', 'J'], ['Bea', 'Runs, listens', 'B'], ['Mei', 'Cities', 'M'], ['Tom', '', 'T'], ['Sam', 'Books on tape', 'S'], ['Kai', 'Coffee first', 'K']];
const idOf = (n) => `u-${n.split(' ')[0].toLowerCase()}`;
const asAuthor = ([n, bio]) => ({ id: idOf(n), displayName: n, ...(bio ? { bio } : {}), youFollow: true });
// Reaction kinds are 1-6 (REACTIONS in src/social/api-m22-social.ts: 1 love, 2 funny, 3 applause, 4 thinking, 5 wow, 6 listening too). Until 16f76d98 this fixture used 0,1,2,4,5, so every count landed one chip off.
// The own-status case: the owner alone sees 'Reacted: Bea ❤️, Jo 🎧, Tom 👏 and 22 more' (25 reactions; the drawing's chips add up to 29, its line says 25: kept as drawn).
const OWN_STATUS = { author: { id: 'demo-1', name: 'Jayden', initials: 'J' }, mine: true, suggested: false, replyCount: 0, get reactedBy() { return [['Bea', 1], ['Jo', 6], ['Tom', 3], ...Array.from({ length: 22 }, (_, i) => [`Listener ${i + 1}`, [1, 2, 3, 5, 6][i % 5]])].map(([name, kind], i) => ({ id: `u-r${i}`, name, kind })); } };
const statusOf = (R) => ({ id: 's1', author: { id: 'u-ana', name: 'Ana', initials: 'A' }, url: 'https://cdn.example.test/status.m4a', durationMs: 41000, createdAt: new Date(H.NOW - 6 * 3600000).toISOString(), expiresAt: new Date(H.NOW + 18 * 3600000).toISOString(), text: 'Three episodes into Morning Notes and I get up earlier now. Start with this one.', items: [{ kind: 'episode', ...epCardItem('Why mornings matter') }], reactions: [{ kind: 1, count: 12 }, { kind: 2, count: 3 }, { kind: 3, count: 5 }, { kind: 5, count: 1 }, { kind: 6, count: 8 }], myReaction: null, suggested: true, ...(R === 'status-own' ? OWN_STATUS : {}) });
const epCardItem = (t) => { const c = epCard(t); return { episodeId: c.id, title: c.title, showTitle: c.showTitle, imageUrl: c.imageUrl, feedUrl: c.feedUrl, enclosureUrl: c.enclosureUrl, durationMs: c.durationMs }; };
function answerW4(u, method, R, seed, iso) {
  const p = u.pathname;
  if (p === '/v1/me') return { listener: { id: 'demo-1', email: 'demo@example.test', displayName: 'Jayden', createdAt: iso(H.NOW - 90 * DAY), avatarUrl: R === 'profile-edit' ? H.artUrl('h') : undefined, bio: 'Morning walks, long interviews.', ageRange: '25-34', gender: null, likesPublic: true, privateListening: false } };
  const pm = p.match(/^\/v1\/listeners\/([^/]+)(\/[a-z]+)?$/);
  if (pm) {
    const id = pm[1]; const sub = pm[2];
    if (!sub) { if (R === 'profile-load-failed') return { __status: 500, error: 'server_error' }; const own = id === 'demo-1'; const none = /stickers-none|stickers-decorate-empty/.test(R); if (own) return { profile: { id, displayName: 'Jayden', followers: 0, following: 0, isFollowing: false, stats: { last7: { listenedMs: 0, finished: 0, topShows: [] }, all: { listenedMs: none ? 0 : 3.5 * 3600000, finished: none ? 0 : 5, topShows: [] } }, recent: none ? [] : [{ id: 1, kind: 'commented', actor: person('Jayden'), episode: { id: EPS()['Why mornings matter'].id, title: 'Why mornings matter', showTitle: 'Morning Notes', imageUrl: null }, momentMs: 872000, refId: 'c1', createdAt: iso(H.NOW - DAY) }] } }; return { profile: { id, displayName: own ? 'Jayden' : 'Rui Costa', followers: own ? 0 : 1200, following: 212, isFollowing: false, blockedByMe: R === 'profile-blocked' || undefined, country: 'PT', bio: own ? 'Morning walks, long interviews.' : 'Mornings, cities, long walks. Replays the good bits.', likesCount: 128, stats: { last7: { listenedMs: 5 * 3600000, finished: 6, topShows: [] }, all: { listenedMs: (128 * 60 + 14) * 60000, finished: 312, topShows: [['Morning Notes', 'a'], ['Night Shift Radio', 'b'], ['Field Recordings', 'c']].map(([t], i) => ({ feedUrl: i === 0 ? H.FEED : feedUrlOf(['', 'night-shift-radio', 'field-recordings'][i]), showTitle: t, listenedMs: (30 - i * 7) * 3600000 })) } }, recent: [] } }; }
    if (sub === '/followers' || sub === '/following') { const empty = /empty/.test(R); return { listeners: empty ? [] : [...PEOPLE, ...PEOPLE.slice(0, 2)].map(asAuthor) }; }
    if (sub === '/likes') return { items: /empty/.test(R) ? [] : [['Why mornings matter', 'Warm and short, good with coffee.', 2 * DAY], ['The long walk home', undefined, 3 * DAY], ['Cities that sleep late', 'Good bus listening.', 5 * DAY]].map(([t, note, ago]) => ({ episode: epCard(t), ...(note ? { note } : {}), createdAt: iso(H.NOW - ago) })) };
    if (sub === '/subscriptions') { if (/private/.test(R)) return { __status: 403, error: 'private' }; return { items: CAT.map(([slug, t, , art]) => ({ feedUrl: slug === 'morning-notes' ? H.FEED : feedUrlOf(slug), title: t, imageUrl: H.artUrl(art) })) }; }
    if (sub === '/playlists') return { items: [] };
  }
  if (p === '/v1/voice-posts' || p === '/v1/voice-posts/') { if (R === 'status-gone') return { items: [] }; if (R.startsWith('voice-posts')) return { items: [['You', 'demo-1', true], ['Ana', 'u-ana', false], ['Mei', 'u-mei', false], ['Tom', 'u-tom', false]].map(([n, id, mine], i) => ({ ...statusOf(R), id: `s${i}`, author: { id, name: n, initials: n[0] }, mine, suggested: i === 3 })) }; return { items: [statusOf(R)] }; }
  if (/^\/v1\/voice-posts\/[^/]+$/.test(p)) { if (R === 'status-gone') return { __status: 404, error: 'not_found' }; return statusOf(R); }
  if (/^\/v1\/voice-posts\/[^/]+\/replies$/.test(p)) return { items: [] };
  if (p === '/v1/me/chats/friends') return { friends: PEOPLE.slice(0, 8).map(([n]) => ({ id: idOf(n), displayName: n })) };
  const cm = p.match(/^\/v1\/me\/chats\/([^/]+)$/);
  if (cm && method === 'GET') { if (R === 'chat-thread-error') return { __abort: true }; const mon = (h, mi) => Date.parse('2026-10-26T00:00:00Z') + (h * 60 + mi) * 60000; const m = (id, fromMe, body, at, ep) => ({ id, fromMe, body, ...(ep ? { episode: epCard(ep) } : {}), createdAt: iso(at), read: true }); return { with: { id: cm[1], displayName: 'Ana' }, canSend: R !== 'chat-thread-cannot-send', messages: [m('1', false, 'Have you heard the new Morning Notes?', mon(9, 0)), m('2', true, 'Not yet! Is it good?', mon(9, 1)), m('3', false, '', mon(9, 12), 'Cities that sleep late'), m('4', false, 'This one. 14:32 is the bit.', mon(9, 13)), m('5', true, 'Listening on the bus now 🎧', mon(9, 20))] }; }
  if (p === '/v1/me/notifications') { const k = (id, kind, name, ago, ex) => ({ id, kind, actor: { id: idOf(name), name, avatarUrl: null }, ref: { episodeId: EPS()['Why mornings matter'].id, commentId: 'c1', excerpt: ex ?? '', episodeTitle: 'Why mornings matter' }, createdAt: iso(H.NOW - ago), unread: true }); return { items: /empty/.test(R) ? [] : [k('n1', 'reply', 'Bea', 40 * 60000, 'Same here.'), k('n2', 'like', 'Tom', 90 * 60000), k('n3', 'mention', 'Ana', 3 * HOUR, '@you this part'), k('n4', 'follow', 'Mei', 26 * HOUR)], next: null }; }
  if (p === '/v1/me/notifications/system') return { items: /empty/.test(R) ? [] : [{ id: 'sy1', title: 'Your appeal was accepted', body: 'Your comment on "Why mornings matter" is back.', createdAt: iso(H.NOW - 1 * DAY) }, { id: 'sy2', title: 'Welcome to SocialMorning', body: 'Thanks for joining.', createdAt: iso(H.NOW - 9 * DAY) }] };
  if (p === '/v1/me/feed') { const f = (id, kind, name, ago, t, ms) => ({ id, kind, actor: { id: idOf(name), displayName: name }, episode: { id: EPS()[t].id, title: t, showTitle: EPS()[t].show, imageUrl: H.artUrl(EPS()[t].art) }, momentMs: ms ?? null, refId: kind === 'listened' ? null : `r${id}`, createdAt: iso(H.NOW - ago) }); return { items: /empty|signed/.test(R) ? [] : [f(1, 'commented', 'Ana', 70 * 60000, 'Why mornings matter', 872000), f(2, 'clipped', 'Jo', 2.5 * HOUR, 'Why mornings matter', 872000), f(3, 'listened', 'Mei', 26 * HOUR, 'Why mornings matter')], serverTime: iso(H.NOW) }; }
  if (p === '/v1/me/host-notices') return { items: /empty/.test(R) ? [] : [{ id: 'hn1', feedUrl: H.FEED, showTitle: 'Morning Notes', imageUrl: H.artUrl('a'), body: 'New season starts Monday. Thank you for every comment on the last one.', images: [H.artUrl('c'), H.artUrl('f')], releaseAt: '2026-10-27T08:10:00Z' }, { id: 'hn2', feedUrl: feedUrlOf('night-shift-radio'), showTitle: 'Night Shift Radio', imageUrl: H.artUrl('d'), body: 'Live recording this Friday — questions in the comments.', images: [], releaseAt: '2026-10-22T23:40:00Z' }] };
  if (p === '/v1/me/likes/timeline') return { items: /empty/.test(R) ? [] : [['Rui', 'Why mornings matter', 'the part about light got me', HOUR], ['Ana', 'What the river knows', 'saving for the weekend', 2 * HOUR]].map(([n, t, note, ago]) => ({ listener: person(n), episode: epCard(t), note, createdAt: iso(H.NOW - ago) })) };
  if (p === '/v1/me/muted-threads') return { items: [['Bea replied to your comment', 'c1'], ['Tom liked your comment', 'c2']].map(([title, k]) => ({ threadKind: 'comment', threadKey: k, title, createdAt: iso(H.NOW - DAY) })) };
  if (p === '/v1/me/friends-listening') return { items: /empty/.test(R) ? [] : [['Rent, explained twice', ['Jo'], 2 * HOUR], ['Rain on tin', ['Kai'], 26 * HOUR]].map(([t, ls, ago], i) => ({ episode: epCard(t), listeners: ls.map((n, k) => ({ id: `f${i}${k}`, name: n, initials: n[0] })), lastAt: iso(H.NOW - ago) })) };
  return undefined;
}
export const ROUTES_W4 = {
  profile: { steps: at('/profile/u-rui') }, 'profile-own': { steps: at('/profile/demo-1') }, 'profile-more': { steps: [...at('/profile/u-rui'), ['label', /^More/], ['wait', 900]] },
  'profile-block': { steps: [...at('/profile/u-rui'), ['label', /^More/], ['wait', 900], ['text', /^Block/], ['wait', 900]] }, 'profile-blocked': { steps: at('/profile/u-rui') },
  'profile-followers': { steps: at('/profile/u-rui/followers') }, 'profile-followers-empty': { steps: at('/profile/demo-1/followers') }, 'profile-following': { steps: at('/profile/u-rui/following') },
  'profile-likes': { steps: at('/profile/u-rui/likes') }, 'profile-likes-empty': { steps: at('/profile/u-rui/likes') },
  'profile-subscriptions': { steps: at('/profile/u-rui/subscriptions') }, 'profile-subscriptions-private': { steps: at('/profile/u-rui/subscriptions') },
  'profile-edit': { steps: at('/profile/edit') }, 'profile-edit-signed-out': { signedOut: true, steps: at('/profile/edit') },
  stickers: { stores: { positions: [] }, steps: at('/stickers') }, 'stickers-none': { stores: { positions: [] }, steps: at('/stickers') }, 'stickers-card': { stores: { positions: [] }, steps: [...at('/stickers'), ['label', /^First hour/], ['wait', 1000]] },
  'stickers-decorate': { stores: { positions: [] }, steps: at('/stickers/decorate') }, 'stickers-decorate-empty': { stores: { positions: [] }, steps: at('/stickers/decorate') }, 'stickers-help': { steps: at('/stickers/help') },
  status: { steps: at('/status/s1') }, 'status-own': { steps: at('/status/s1') }, 'status-more': { steps: [...at('/status/s1'), ['label', /^More/], ['wait', 900]] }, 'status-gone': { steps: at('/status/s1') }, 'status-signed-out': { signedOut: true, steps: at('/status/s1') },
  'status-text': { get steps() { return [...at('/status/text'), ['fillText', 'Listening to something good'], ['label', /^Add episode/], ['wait', 900], ['label', /^Add Why mornings matter/], ['wait', 900]]; } }, 'status-text-episode': { steps: [...at('/status/text'), ['fillText', 'Listening to something good'], ['label', /^Add episode/], ['wait', 900]] }, 'status-text-signed-out': { signedOut: true, steps: at('/status/text') },
  'voice-posts': { steps: [...at('/library'), ['label', /^Post a status/], ['wait', 900]] }, 'voice-posts-delete': { steps: [...at('/library'), ['hold', /^Your voice status/], ['wait', 900]] },
  'chat-thread': { steps: at('/chat/u-ana') }, 'chat-thread-cannot-send': { steps: at('/chat/u-ana') }, 'chat-thread-signed-out': { signedOut: true, steps: at('/chat/u-ana') }, 'chat-thread-error': { steps: at('/chat/u-ana') },
  'chat-new': { steps: at('/chat/new') }, 'chat-new-send-to': { get steps() { return at(`/chat/new?episodeId=${EPS()['Why mornings matter'].id}&episodeTitle=Why%20mornings%20matter`); } }, 'chat-new-signed-out': { signedOut: true, steps: at('/chat/new') },
  notifications: { steps: at('/notifications') }, 'notifications-empty': { steps: at('/notifications') }, 'notifications-signed-out': { signedOut: true, steps: at('/notifications') },
  'notifications-interactions': { steps: [...at('/notifications'), ['label', /^Interactions\./], ['wait', 1200]] }, 'notifications-interactions-empty': { steps: [...at('/notifications'), ['label', /^Interactions\./], ['wait', 1200]] },
  'notifications-mute': { steps: [...at('/notifications'), ['label', /^Interactions\./], ['wait', 1200], ['label', /^More for Bea/], ['wait', 900]] },
  'notifications-hosts': { steps: at('/notifications/hosts') }, 'notifications-hosts-empty': { steps: at('/notifications/hosts') },
  'notifications-system': { steps: at('/notifications/system') }, 'notifications-system-empty': { steps: at('/notifications/system') },
  'friends-listening': { steps: at('/friends-listening') }, 'friends-listening-empty': { steps: at('/friends-listening') }, 'friends-listening-help': { steps: [...at('/friends-listening'), ['label', /^What is this page/], ['wait', 900]] },
  'muted-threads': { steps: [...at('/settings/privacy'), ['label', /^Unmute/], ['wait', 900]] },
};

export const HOUR = 3600000;
export const epCard = (t) => { const e = EPS()[t]; return { id: e.id, feedUrl: e.feedUrl, guid: e.guid, title: e.title, showTitle: e.show, imageUrl: H.artUrl(e.art), durationMs: e.secs * 1000, publishedAt: new Date(H.NOW - 2 * DAY).toISOString(), enclosureUrl: `https://cdn.example.test/${e.guid}.mp3` }; };
const person = (name) => ({ id: `u-${name}`, displayName: name });
const PLAYLISTS = [['Slow mornings', true, 12], ['Walks', false, 5], ['Kitchen', false, 8], ['To share', false, 3], ['Rainy days', false, 9]];
const playlist = (n, withItems) => ({ id: `pl${n}`, imageUrl: H.artUrl('afcdg'[n]), title: PLAYLISTS[n][0], isPublic: PLAYLISTS[n][1], count: PLAYLISTS[n][2], updatedAt: new Date(H.NOW - 2 * DAY).toISOString(), ...(withItems ? { items: ['Why mornings matter', 'The long walk home'].map(epCard) } : {}) });
const LIKES = () => [['Aisha', 'The long walk home', 'The rain at the end.', 2 * HOUR], ['Rui', 'Why mornings matter', undefined, 24 * HOUR], ['Lee', 'What the river knows', 'A slow one for Sunday.', 3 * DAY]].map(([n, t, note, ago]) => ({ listener: person(n), episode: epCard(t), ...(note ? { note } : {}), createdAt: new Date(H.NOW - ago).toISOString() }));

/** Fake API answers for waves 3 and 4. Returns undefined when this wave has nothing to say (the older fixture then answers). */
export function answerW34(u, method, routeName) {
  if (!H || !(routeName in ROUTES_W3 || routeName in ROUTES_W4)) return undefined;
  const p = u.pathname; const R = routeName; const iso = (ms) => new Date(ms).toISOString();
  const seed = seedW34(R, (ROUTES_W3[R] ?? ROUTES_W4[R]));
  if (p === '/v1/me/positions') return { positions: seed.positions.map((x) => ({ episodeId: x.episodeId, offsetMs: x.offsetMs, finished: x.finished === true, explicitSeek: false, receivedAt: iso(x.at), deviceId: 'phone' })), serverTime: iso(H.NOW) };
  if (p === '/v1/me/queue') return { version: R === 'queue-conflict' ? 4 : 0, items: R === 'queue-conflict' ? ['The long walk home', 'Rain on tin', 'Ten minutes of rain', 'Small talk, big ideas', 'What the river knows', 'The slow commute'].map((t) => EPS()[t].id) : seed.queue, deviceId: null, updatedAt: null };
  if (p === '/v1/me/subscriptions') return { items: seed.subs.map((s) => ({ feedUrl: s.feedUrl, createdAt: iso(H.NOW - 20 * DAY), starred: s.starred === true })), serverTime: iso(H.NOW) };
  if (method === 'POST' && ((R === 'toast-playlists' && p === '/v1/me/playlists') || (R === 'toast-clip-new' && p.endsWith('/clips')))) return { __status: 503, error: 'offline' };
  if (p === '/v1/discover/chart' && (R === 'episode-card-sheet' || R === 'toast-card-sheet')) return { kind: u.searchParams.get('kind') ?? 'talked', updatedAt: iso(H.NOW), items: ['Notes on attention', 'Ten minutes of rain', 'Rain on tin', 'Cities that sleep late', 'The slow commute'].map((t, i) => ({ key: `ch${i}`, rank: i + 1, episode: i === 3 && R === 'toast-card-sheet' ? { ...epCard(t), id: 'gone-from-feed' } : epCard(t) })) };  // RC: five rows so the 4th has a ··· (a long press does nothing); toast: its id is not in the feed
  if (p === '/v1/discover/chart') return { kind: u.searchParams.get('kind') ?? 'talked', updatedAt: iso(H.NOW), items: ['Notes on attention', 'Ten minutes of rain', 'Rain on tin'].map((t, i) => ({ key: `ch${i}`, rank: i + 1, episode: epCard(t) })) };
  if (method === 'POST' && /\/v1\/episodes\/[^/]+\/clips$/.test(p)) { const e = EPS()['Why mornings matter']; return { clip: { id: 'c-new', author: person('Jayden'), episodeId: e.id, startMs: 722000, endMs: 752000, caption: '', createdAt: iso(H.NOW), deleted: false } }; }
  // playlists
  if (p === '/v1/me/playlists' && method === 'GET') { if (R === 'playlists-error') return { __status: 500, error: 'server_error' }; return { items: /empty/.test(R) ? [] : PLAYLISTS.map((_, n) => playlist(n, false)) }; }
  if (/^\/v1\/playlists\/[^/]+$/.test(p)) { if (R === 'playlist-missing') return { __status: 404, error: 'not_found' }; return { ...playlist(0, false), items: Object.keys(EPS()).slice(0, 12).map(epCard), owner: { id: 'demo-1', displayName: 'Jayden' } }; }
  // comments, likes, listening
  if (p === '/v1/me/comments') return { items: /empty/.test(R) ? [] : [['This is the part I replay every morning.', 872000, 5 * HOUR, 'Why mornings matter'], ['Recorded this walk too, years ago.', 1870000, 5 * HOUR, 'The long walk home'], [null, 135000, 2 * DAY, 'Notes on attention', true]].map(([b, off, ago, t, removed], i) => ({ id: `mc${i}`, body: b, deleted: false, removed: removed === true, offsetMs: off, createdAt: iso(H.NOW - ago), episode: epCard(t) })) };
  if (p === '/v1/me/likes/timeline' && !W4NAMES.has(R)) { if (R === 'likes-error') return { __status: 500, error: 'server_error' }; return { items: /empty/.test(R) ? [] : LIKES() }; }
  if (/^\/v1\/likes\/[^/]+\/[^/]+$/.test(p)) { if (R === 'like-gone') return { __status: 404, error: 'not_found' }; return { like: LIKES()[0], comments: [['Rui', 'Adding this to my walk list.', 3600000], ['Jo', 'Same rain as last week?', 1200000]].map(([n, b, ago], i) => ({ id: `lc${i}`, author: person(n), body: b, createdAt: iso(H.NOW - ago), mine: false })), reactions: { counts: [{ emoji: '👍', n: 4 }, { emoji: '❤️', n: 2 }, { emoji: '🔥', n: 1 }] } }; }
  if (p === '/v1/me/listening') return { range: u.searchParams.get('range') ?? '30d', days: Array.from({ length: 30 }, (_, i) => ({ day: iso(H.NOW - (29 - i) * DAY).slice(0, 10), minutes: R === 'me-listening-empty' ? 0 : [20, 45, 0, 60, 30, 90, 10][i % 7] })), totalMinutes: R === 'me-listening-empty' ? 0 : 94 * 60 + 12, topShows: R === 'me-listening-empty' ? [] : [['Morning Notes', 31], ['Night Shift Radio', 18], ['The Long Table', 9]].map(([t, h], i) => ({ feedUrl: `https://feeds.example.test/ls-${i}.xml`, title: t, minutes: h * 60 })) };
  if (/^\/v1\/episodes\/[^/]+\/social$/.test(p)) { const sc = H.SOCIAL; return { ...sc, heat: { ...sc.heat, buckets: sc.heat.buckets.map((v, i) => (i === 29 || i === 31 ? 0.99 : v)) } }; }
  if (/^\/v1\/episodes\/[^/]+\/clips$/.test(p)) return { clips: /clips-empty|related-empty/.test(R) ? [] : [['Rui', 722000, 752000, 'the part I replay every morning'], ['Jo', 1870000, 1900000, 'saving this']].map(([n, a, b, c], i) => ({ id: `cl${i}`, author: person(n), episodeId: EPS()['Why mornings matter'].id, startMs: a, endMs: b, caption: c, createdAt: iso(H.NOW - (i + 1) * HOUR), deleted: false })) };
  if (/^\/v1\/episodes\/[^/]+\/next-up$/.test(p)) return { items: R === 'episode-clips-empty' || R === 'episode-related-empty' ? [] : ['Notes on attention', 'What the river knows', 'Rain on tin', 'The slow commute'].map((t) => ({ episode: epCard(t), reason: 'alsoListened', label: 'Listeners also played' })), computedAt: iso(H.NOW) };
  // ---- wave 4 ----
  if (W4NAMES.has(R)) { const w = answerW4(u, method, R, seed, iso); if (w !== undefined) return w; }
  // clips
  const cm = p.match(/^\/v1\/clips\/([^/]+)$/);
  if (cm) { if (R === 'clip-not-found') return { __status: 404, error: 'not_found' }; const e = EPS()['Why mornings matter']; return { clip: { id: cm[1], author: person('Rui'), episodeId: e.id, startMs: 722000, endMs: 752000, caption: 'the part I replay every morning', createdAt: iso(H.NOW - 5 * HOUR), deleted: false }, episode: { id: e.id, feedUrl: e.feedUrl, guid: e.guid, title: e.title, showTitle: e.show, enclosureUrl: `https://cdn.example.test/${e.guid}.mp3`, imageUrl: H.artUrl(e.art), durationMs: e.secs * 1000 } }; }
  return undefined;
}

// A signed-out visitor is sent to the welcome screen by the app; as in wave 2, a step back lands on the page the drawing shows.
for (const R of [ROUTES_W3, ROUTES_W4]) {
  for (const r of Object.values(R)) {
    if (!r.signedOut) continue;
    const d = Object.getOwnPropertyDescriptor(r, 'steps');
    const get = d.get ?? (() => d.value);
    Object.defineProperty(r, 'steps', { get: () => [...get(), ['back']], configurable: true, enumerable: true });
  }
}
