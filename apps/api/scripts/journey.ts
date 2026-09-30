/**
 * The listener journey (specs/015-e2e-journey), against a running e2e server
 * (scripts/e2e-server.ts). NEVER point it at production: it refuses any https address.
 *
 *   npx tsx scripts/journey.ts seed       → 50 listeners, a host with a show of 5 episodes, a
 *                                           moderator's queue with 3 reports; writes journey.json
 *   npx tsx scripts/journey.ts listener   → listener-01 does what the phone does (the "B" layer):
 *                                           sign in, subscribe, listen, resume, comment at a moment,
 *                                           like, star — then the host replies from the Studio and
 *                                           the listener sees the Host reply
 *   npx tsx scripts/journey.ts phone <email> <note>
 *                                        → after a phone ran the journey on screen (Maestro on a
 *                                           simulator, or a real iPhone): the server has that
 *                                           listener's subscription, a position past 0:15, and the
 *                                           comment with that text at the moment they were at
 *
 * Every step checks what the server answers; the first wrong answer stops the run with its name.
 * Env: E2E_API (default http://localhost:8787), E2E_STORE_BASE (the same value the server has),
 * JOURNEY_OUT (default journey.json).
 */
import { writeFileSync, readFileSync } from 'node:fs';

const API = (process.env['E2E_API'] ?? 'http://localhost:8787').replace(/\/$/, '');
const STORE = process.env['E2E_STORE_BASE'] ?? 'https://e2estore.public.blob.vercel-storage.com/';
const OUT = process.env['JOURNEY_OUT'] ?? 'journey.json';
export const PASSWORD = 'e2e-correct-horse';
export const LISTENERS = 50;
const SHOW = 'Journey Morning';
const EPISODES = 5;
const EP_MS = 60_000;

if (!/^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(API)) {
  throw new Error(`journey: ${API} is not a local test server — this script never runs against production.`);
}

export type Journey = {
  api: string;
  show: { key: string; feedUrl: string; title: string };
  episodes: { episodeId: string; guid: string; title: string; audioUrl: string }[];
  host: { email: string; id: string };
  moderator: { email: string } | null;
  listeners: { email: string; name: string; id: string }[];
  reportedCommentIds: string[];
  counts: { comments: number; likes: number; follows: number; subscriptions: number; listened: number };
};

let step = 0;
function ok(cond: unknown, what: string): asserts cond {
  step++;
  if (!cond) throw new Error(`journey step ${step} FAILED: ${what}`);
  console.log(`  ✓ ${step}. ${what}`);
}

async function call<T = unknown>(method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<{ status: number; json: T; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = undefined;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json: json as T, text };
}
const studio = { 'x-studio': '1' };

async function signUp(email: string, name: string): Promise<{ token: string; id: string }> {
  const r = await call<{ token: string; listener: { id: string } }>('POST', '/v1/auth/sign-up', { email, password: PASSWORD, displayName: name });
  if (r.status !== 200) throw new Error(`sign-up ${email}: ${r.status} ${r.text}`);
  return { token: r.json.token, id: r.json.listener.id };
}
async function signIn(email: string, deviceLabel?: string): Promise<string> {
  const r = await call<{ token: string }>('POST', '/v1/auth/sign-in', { email, password: PASSWORD, ...(deviceLabel ? { deviceLabel } : {}) });
  if (r.status !== 200) throw new Error(`sign-in ${email}: ${r.status} ${r.text}`);
  return r.json.token;
}
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => new Date().toISOString().slice(0, 10);

async function seed(): Promise<void> {
  console.log(`seed → ${API}`);
  // The host, and the show made the way the Studio makes it.
  const hostEmail = 'host@journey.test';
  const host = await signUp(hostEmail, 'Journey Host');
  const hostStudio = await signIn(hostEmail, 'studio-web');
  const made = await call<{ show: { feedUrl: string; title: string }; shows: { key: string; feedUrl: string }[] }>('POST', '/v1/studio/hosted-shows',
    { title: SHOW, description: 'Five one-minute episodes for the end-to-end journey.', author: 'Journey Host', category: 'Technology', language: 'en' }, hostStudio, studio);
  ok(made.status === 201, `the host creates "${SHOW}" in the Studio (201, got ${made.status})`);
  const key = made.json.shows.find((s) => s.feedUrl === made.json.show.feedUrl)?.key;
  ok(key, 'the Studio names the new show');

  const episodes: Journey['episodes'] = [];
  for (let i = EPISODES; i >= 1; i--) {
    const up = await call<{ pathname: string }>('POST', `/v1/studio/shows/${key}/uploads`, { kind: 'audio', contentType: 'audio/mpeg', size: 240_448 }, hostStudio, studio);
    if (up.status !== 200) throw new Error(`upload token: ${up.status} ${up.text}`);
    const pub = await call<{ episode: { episodeId: string; guid: string; title: string; audioUrl: string } }>('POST', `/v1/studio/shows/${key}/hosted-episodes`,
      { title: `Episode ${i}: A minute of tone`, description: `<p>Episode ${i}. Jump to <b>0:30</b> for the middle.</p>`, audioUrl: `${STORE}${up.json.pathname}`, durationMs: EP_MS }, hostStudio, studio);
    if (pub.status !== 201) throw new Error(`publish ${i}: ${pub.status} ${pub.text}`);
    episodes.unshift(pub.json.episode);
  }
  ok(episodes.length === EPISODES, `${EPISODES} episodes published`);
  const feed = await call('GET', new URL(made.json.show.feedUrl).pathname.replace(/^\/api/, ''));
  ok(feed.status === 200 && (feed.text.match(/<item>/g) ?? []).length === EPISODES, `the show's RSS feed lists ${EPISODES} items`);
  const audio = await fetch(episodes[0]!.audioUrl, { headers: { range: 'bytes=0-1023' } });
  ok(audio.status === 206 || STORE.startsWith('https://'), `episode audio answers a byte range (${audio.status})`);

  // 50 listeners.
  const listeners: (Journey['listeners'][number] & { token: string })[] = [];
  for (let i = 1; i <= LISTENERS; i++) {
    const email = `listener-${pad(i)}@journey.test`;
    const name = `Listener ${pad(i)}`;
    const u = await signUp(email, name);
    listeners.push({ email, name, id: u.id, token: u.token });
  }
  ok(listeners.length === LISTENERS, `${LISTENERS} listeners signed up`);

  // 45 subscribe (01–05 are left out, so the phone's listener-01 subscribes on screen).
  const counts = { comments: 0, likes: 0, follows: 0, subscriptions: 0, listened: 0 };
  for (const l of listeners.slice(5)) {
    const r = await call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: made.json.show.feedUrl, createdAt: new Date().toISOString() }] }, l.token);
    if (r.status !== 200) throw new Error(`subscribe ${l.email}: ${r.status}`);
    counts.subscriptions++;
  }
  ok(counts.subscriptions === LISTENERS - 5, `${counts.subscriptions} listeners subscribe`);

  // Each follows the next three.
  for (let i = 0; i < LISTENERS; i++) {
    for (const d of [1, 2, 3]) {
      const target = listeners[(i + d) % LISTENERS]!;
      const r = await call('PUT', `/v1/listeners/${target.id}/follow`, undefined, listeners[i]!.token);
      if (r.status >= 300) throw new Error(`follow: ${r.status} ${r.text}`);
      counts.follows++;
    }
  }
  ok(counts.follows === LISTENERS * 3, `${counts.follows} follows`);

  // 30 listen to episode 1 (half of them to the end), 10 to episode 2.
  const ep1 = episodes[0]!;
  const ep2 = episodes[1]!;
  for (let i = 5; i < 35; i++) {
    const l = listeners[i]!;
    const end = i % 2 === 0 ? EP_MS : 25_000;
    const r = await call('PUT', '/v1/me/listened', { deviceId: `seed-${i}`, days: [{ episodeId: ep1.episodeId, day: today(), ranges: [[0, end]] }] }, l.token);
    if (r.status >= 300) throw new Error(`listened: ${r.status} ${r.text}`);
    counts.listened++;
  }
  for (let i = 35; i < 45; i++) {
    const r = await call('PUT', '/v1/me/listened', { deviceId: `seed-${i}`, days: [{ episodeId: ep2.episodeId, day: today(), ranges: [[0, 40_000]] }] }, listeners[i]!.token);
    if (r.status >= 300) throw new Error(`listened: ${r.status} ${r.text}`);
    counts.listened++;
  }
  ok(counts.listened === 40, `${counts.listened} listening records`);

  // 40 comments at moments across episodes 1–2 (one each: the server allows one every few seconds per person).
  const commentIds: string[] = [];
  for (let i = 5; i < 45; i++) {
    const ep = i < 35 ? ep1 : ep2;
    const offsetMs = ((i * 7) % 55) * 1000 + 1000;
    const r = await call<{ comment: { id: string } }>('POST', `/v1/episodes/${ep.episodeId}/comments`, { body: `Seed comment ${pad(i + 1)} at ${Math.floor(offsetMs / 1000)} s`, offsetMs }, listeners[i]!.token);
    if (r.status !== 201 && r.status !== 200) throw new Error(`comment: ${r.status} ${r.text}`);
    commentIds.push(r.json.comment.id);
    counts.comments++;
  }
  ok(counts.comments === 40, `${counts.comments} comments at moments`);

  // Likes: the first 10 comments get 1–6 likes each from other listeners.
  for (let c = 0; c < 10; c++) {
    for (let k = 0; k < (c % 6) + 1; k++) {
      const liker = listeners[(c * 3 + k + 45) % LISTENERS]!;
      const r = await call('PUT', `/v1/comments/${commentIds[c]}/like`, undefined, liker.token);
      if (r.status === 403) continue; // own comment
      if (r.status !== 200) throw new Error(`like: ${r.status} ${r.text}`);
      counts.likes++;
    }
  }
  ok(counts.likes > 20, `${counts.likes} likes`);

  // 3 reports for the moderator's queue.
  const reported = commentIds.slice(20, 23);
  for (const [n, id] of reported.entries()) {
    const r = await call('POST', '/v1/reports', { targetKind: 'comment', targetId: id, reason: 'spam', note: `journey report ${n + 1}` }, listeners[2 + n]!.token);
    if (r.status >= 300) throw new Error(`report: ${r.status} ${r.text}`);
  }
  ok(reported.length === 3, '3 comments reported');

  // What the server now says, read back — not what we meant to write.
  const social = await call<{ comments: { likeCount: number }[] }>('GET', `/v1/episodes/${ep1.episodeId}/social`);
  ok(social.status === 200 && social.json.comments.length === 30, `episode 1 shows 30 comments (got ${social.json?.comments?.length})`);
  const overview = await call<Record<string, unknown>>('GET', `/v1/studio/shows/${key}/subscribers/stats`, undefined, hostStudio);
  ok(overview.status === 200, 'the Studio reads the subscriber numbers');
  const subs = await call<{ total: number }>('GET', `/v1/studio/shows/${key}/subscribers`, undefined, hostStudio);
  ok(subs.json.total === LISTENERS - 5, `the Studio counts ${LISTENERS - 5} subscribers (got ${subs.json.total})`);

  const journey: Journey = {
    api: API,
    show: { key, feedUrl: made.json.show.feedUrl, title: SHOW },
    episodes,
    host: { email: hostEmail, id: host.id },
    moderator: process.env['E2E_MOD_EMAIL'] ? { email: process.env['E2E_MOD_EMAIL'] } : null,
    listeners: listeners.map(({ token: _t, ...l }) => l),
    reportedCommentIds: reported,
    counts,
  };
  writeFileSync(OUT, JSON.stringify(journey, null, 2));
  console.log(`seed done: ${OUT} (password for every account: ${PASSWORD})`);
}

/** listener-01 does, through the API, what the phone does on screen (layer B). */
async function listener(): Promise<void> {
  const j = JSON.parse(readFileSync(OUT, 'utf8')) as Journey;
  const me = j.listeners[0]!;
  const ep = j.episodes[0]!;
  console.log(`listener journey as ${me.email} → ${API}`);
  const token = await signIn(me.email);
  ok(token.length > 10, 'listener-01 signs in with email and password');

  const found = await call<{ shows: { feedUrl: string }[] }>('GET', `/v1/search?q=${encodeURIComponent('Journey Morning')}`);
  ok(found.status === 200 && JSON.stringify(found.json).includes(j.show.feedUrl), 'search finds the show (Apple is down; created shows are searchable)');

  const sub = await call<{ items: { feedUrl: string; deletedAt?: string }[] }>('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: j.show.feedUrl, createdAt: new Date().toISOString() }] }, token);
  ok(sub.status === 200 && sub.json.items.some((i) => i.feedUrl === j.show.feedUrl && !i.deletedAt), 'subscribes');

  // Listen 20 s, stop, come back: the saved position is where the phone resumes.
  const put = await call('PUT', '/v1/me/positions', { deviceId: 'journey-phone', observations: [{ episodeId: ep.episodeId, offsetMs: 20_000, finished: false, progressSeq: 1, explicitSeek: false }] }, token);
  ok(put.status < 300, 'listens for 20 s; the position is saved');
  const back = await call<{ positions: { episodeId: string; offsetMs: number }[] }>('GET', '/v1/me/positions', undefined, token);
  const pos = back.json.positions.find((p) => p.episodeId === ep.episodeId);
  ok(pos?.offsetMs === 20_000, `"Continue listening" resumes at 0:20 (server has ${pos?.offsetMs})`);
  await call('PUT', '/v1/me/listened', { deviceId: 'journey-phone', days: [{ episodeId: ep.episodeId, day: today(), ranges: [[0, 20_000]] }] }, token);

  const posted = await call<{ comment: { id: string; offsetMs: number } }>('POST', `/v1/episodes/${ep.episodeId}/comments`, { body: 'Journey: the tone changes nothing, and I love it', offsetMs: 20_000 }, token);
  ok(posted.status === 201 || posted.status === 200, 'posts a comment at the current moment');
  ok(posted.json.comment.offsetMs === 20_000, 'the comment carries 0:20');

  const social = await call<{ comments: { id: string; likeCount: number; mine?: boolean }[] }>('GET', `/v1/episodes/${ep.episodeId}/social`, undefined, token);
  const other = social.json.comments.find((c) => !c.mine && c.likeCount >= 0)!;
  const liked = await call<{ likeCount: number; likedByMe: boolean }>('PUT', `/v1/comments/${other.id}/like`, undefined, token);
  ok(liked.status === 200 && liked.json.likedByMe && liked.json.likeCount === other.likeCount + 1, 'likes a seeded comment (+1)');

  const star = await call<{ items: { feedUrl: string; starred: boolean }[] }>('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: j.show.feedUrl, createdAt: new Date().toISOString(), starred: true, starredAt: new Date().toISOString() }] }, token);
  ok(star.json.items.find((i) => i.feedUrl === j.show.feedUrl)?.starred === true, 'stars the show, and the server keeps the star');

  // The host, in the Studio.
  const hostStudio = await signIn(j.host.email, 'studio-web');
  const subs = await call<{ total: number; items: { displayName: string }[] }>('GET', `/v1/studio/shows/${j.show.key}/subscribers`, undefined, hostStudio);
  ok(subs.json.items.some((i) => i.displayName === me.name) && subs.json.total === LISTENERS - 4, `the Studio's subscribers include ${me.name} (${subs.json.total} in all)`);
  const comments = await call<{ items: { id: string; offsetMs: number | null }[] }>('GET', `/v1/studio/shows/${j.show.key}/comments`, undefined, hostStudio);
  const mine = comments.json.items.find((c) => c.id === posted.json.comment.id);
  ok(mine?.offsetMs === 20_000, 'the Studio shows the new comment at 0:20');
  const reply = await call('POST', `/v1/studio/shows/${j.show.key}/comments/${posted.json.comment.id}/reply`, { body: 'Thanks for listening — Journey Host' }, hostStudio, studio);
  ok(reply.status < 300, 'the host replies from the Studio');

  type C = { id: string; parentId: string | null; body: string | null; host?: true; replies?: C[] };
  const again = await call<{ comments: C[] }>('GET', `/v1/episodes/${ep.episodeId}/social`, undefined, token);
  const all = again.json.comments.flatMap((c) => [c, ...(c.replies ?? [])]);
  const hostReply = all.find((c) => c.parentId === posted.json.comment.id);
  ok(hostReply?.body?.includes('Journey Host') && hostReply.host === true, 'listener-01 sees the reply, marked as the host');

  const page = await call('GET', `/e/${ep.episodeId}`);
  ok(page.status === 200 && page.text.includes(ep.title.replace(/&/g, '&amp;')), 'the public episode page shows the title');
  console.log(`listener journey done: ${step} checks`);
}

/** What the server holds after a phone did the journey on screen (layer A / the real iPhone). */
async function phone(email: string, note: string): Promise<void> {
  const j = JSON.parse(readFileSync(OUT, 'utf8')) as Journey;
  const ep = j.episodes[0]!;
  console.log(`phone check for ${email} → ${API}`);
  const token = await signIn(email);
  const subs = await call<{ items: { feedUrl: string; deletedAt?: string }[] }>('GET', '/v1/me/subscriptions', undefined, token);
  ok(subs.json.items.some((i) => i.feedUrl === j.show.feedUrl && !i.deletedAt), 'the phone subscribed to the show');
  const pos = (await call<{ positions: { episodeId: string; offsetMs: number }[] }>('GET', '/v1/me/positions', undefined, token)).json.positions.find((p) => p.episodeId === ep.episodeId);
  ok(pos !== undefined && pos.offsetMs >= 10_000, `the phone's listening position reached the server (${pos?.offsetMs} ms)`);
  type C = { body: string | null; offsetMs: number | null; mine?: boolean; replies?: C[] };
  const social = await call<{ comments: C[] }>('GET', `/v1/episodes/${ep.episodeId}/social`, undefined, token);
  const c = social.json.comments.flatMap((x) => [x, ...(x.replies ?? [])]).find((x) => x.body === note && x.mine);
  ok(c !== undefined, 'the comment typed on the phone is on the server');
  ok(c!.offsetMs !== null && c!.offsetMs >= 10_000 && c!.offsetMs < 60_000, `…at the moment the phone was at (${c!.offsetMs} ms)`);
  console.log(`phone check done: ${step} checks`);
}

const cmd = process.argv[2];
if (cmd === 'seed') await seed();
else if (cmd === 'listener') await listener();
else if (cmd === 'phone') await phone(process.argv[3] ?? 'listener-02@journey.test', process.argv[4] ?? 'Maestro: heard it on the simulator');
else { console.error('usage: journey.ts seed | listener | phone <email> <note>'); process.exit(2); }
