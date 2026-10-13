// Seeds the extra data the screen capture needs, on top of journey.ts seed, through real API routes only.
/**
 * M27 (specs/031-m29-screen-capture, FR-005, FR-006, research R4). Run AFTER `journey.ts seed`,
 * against the same running e2e server (scripts/e2e-server.ts, PGlite in memory). NEVER point it at
 * production: it refuses any address that is not local, and it writes no SQL — every row comes from
 * a route a phone, the Studio or Admin really calls (accounts via the test server's /__e2e/account).
 *
 *   npx tsx scripts/capture-seed.ts      → capture.json (env CAPTURE_OUT) = the manifest of placeholders
 *
 * Accounts (password for all: e2e-correct-horse; sign in by email + password on the web, or by the
 * emailed code at GET /__e2e/code?email=… on the phone):
 *   visitor (no session) · new@capture.test (nothing) · listener = listener-02@journey.test ·
 *   host = host@journey.test · plus@capture.test (PLUS by an admin grant) ·
 *   moderator = E2E_MOD_EMAIL (the e2e server makes it WITH a password, E2E_MOD_PASSWORD or the shared one) ·
 *   suspended@capture.test (suspended through Admin).
 *
 * A thing that cannot be made through the API is printed as `GAP: …` and listed in `gaps` of the manifest.
 * Run it once per fresh server: a second run finds the accounts and the data there and skips what it can.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const API = (process.env['E2E_API'] ?? 'http://localhost:8787').replace(/\/$/, '');
const STORE = process.env['E2E_STORE_BASE'] ?? 'https://e2estore.public.blob.vercel-storage.com/';
const IN = process.env['JOURNEY_OUT'] ?? 'journey.json';
const OUT = process.env['CAPTURE_OUT'] ?? 'capture.json';
const PASSWORD = 'e2e-correct-horse';
const MOD_PASSWORD = process.env['E2E_MOD_PASSWORD'] ?? PASSWORD;

if (!/^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(API)) {
  throw new Error(`capture-seed: ${API} is not a local test server — this script never runs against production.`);
}

type Journey = {
  show: { key: string; feedUrl: string; title: string };
  episodes: { episodeId: string; guid: string; title: string; audioUrl: string }[];
  host: { email: string; id: string };
  moderator: { email: string } | null;
  listeners: { email: string; name: string; id: string }[];
  reportedCommentIds: string[];
};
const j = JSON.parse(readFileSync(IN, 'utf8')) as Journey;

let step = 0;
const gaps: string[] = [];
function ok(cond: unknown, what: string): asserts cond {
  step++;
  if (!cond) throw new Error(`capture-seed step ${step} FAILED: ${what}`);
  console.log(`  ✓ ${step}. ${what}`);
}
function gap(what: string): void {
  gaps.push(what);
  console.log(`  GAP: ${what}`);
}

type Res<T> = { status: number; json: T; text: string };
async function call<T = any>(method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}): Promise<Res<T>> {
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
const STUDIO = { 'x-studio': '1' };
const good = (r: Res<unknown>) => r.status >= 200 && r.status < 300;
/** A required write: the first wrong answer stops the run with its name. */
function must<T>(r: Res<T>, what: string): T {
  step++;
  if (!good(r)) throw new Error(`capture-seed step ${step} FAILED: ${what} → ${r.status} ${r.text.slice(0, 300)}`);
  console.log(`  ✓ ${step}. ${what}`);
  return r.json;
}
/** An optional write: a refusal becomes a GAP line and the run goes on. */
async function maybe<T>(what: string, run: () => Promise<Res<T>>): Promise<T | undefined> {
  const r = await run();
  if (!good(r)) { gap(`${what} — the API answered ${r.status} ${r.text.slice(0, 160)}`); return undefined; }
  step++;
  console.log(`  ✓ ${step}. ${what}`);
  return r.json;
}

const tokens = new Map<string, string>();
const ids = new Map<string, string>();
async function account(email: string, name: string): Promise<string> {
  const made = await call<{ token: string; listener: { id: string } }>('POST', '/__e2e/account', { email, password: PASSWORD, displayName: name });
  if (made.status === 200) { tokens.set(email, made.json.token); ids.set(email, made.json.listener.id); return made.json.token; }
  if (made.status !== 409) throw new Error(`account ${email}: ${made.status} ${made.text}`);
  return signIn(email);
}
async function signIn(email: string, label?: string, password = PASSWORD): Promise<string> {
  const r = await call<{ token: string }>('POST', '/v1/auth/sign-in', { email, password, ...(label ? { deviceLabel: label } : {}) });
  if (r.status !== 200) throw new Error(`sign-in ${email}: ${r.status} ${r.text}`);
  if (!label) tokens.set(email, r.json.token);
  return r.json.token;
}
const tok = (email: string) => tokens.get(email)!;
const pad = (n: number) => String(n).padStart(2, '0');
const L = (n: number) => j.listeners[n - 1]!; // listener-NN
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Publishes one episode the way the Studio does (an upload token, then the publish). */
async function publish(hostStudio: string, key: string, title: string, description: string, durationMs = 60_000): Promise<{ episodeId: string; guid: string; title: string }> {
  const up = must(await call<{ pathname: string }>('POST', `/v1/studio/shows/${key}/uploads`, { kind: 'audio', contentType: 'audio/mpeg', size: 240_448 }, hostStudio, STUDIO), `upload token for "${title}"`);
  const pub = must(await call<{ episode: { episodeId: string; guid: string; title: string } }>('POST', `/v1/studio/shows/${key}/hosted-episodes`, { title, description, audioUrl: `${STORE}${up.pathname}`, durationMs }, hostStudio, STUDIO), `publishes "${title}"`);
  return pub.episode;
}

/** 1x1 PNG, for a photo status. */
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));

async function main(): Promise<void> {
  console.log(`capture seed → ${API}`);
  const ep1 = j.episodes[0]!;
  const ep2 = j.episodes[1]!;
  const ep3 = j.episodes[2]!;
  const ep4 = j.episodes[3]!;
  const ep5 = j.episodes[4]!;

  // ---------- accounts ----------
  const lis = L(2).email; // the active listener
  for (const n of [2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 40, 49]) await signIn(L(n).email);
  const hostEmail = j.host.email;
  await signIn(hostEmail);
  const newEmail = 'new@capture.test';
  const plusEmail = 'plus@capture.test';
  const suspEmail = 'suspended@capture.test';
  await account(newEmail, 'New Listener');
  await account(plusEmail, 'Plus Listener');
  await account(suspEmail, 'Suspended Listener');
  ids.set(lis, L(2).id);
  ids.set(hostEmail, j.host.id);
  ok(tokens.size >= 26, 'seed accounts signed in (new, plus, suspended made here; listener-02 and host from the journey seed)');

  const modEmail = process.env['E2E_MOD_EMAIL'] ?? j.moderator?.email;
  let admin: string | undefined;
  if (!modEmail) gap('moderator: E2E_MOD_EMAIL is not set, so the e2e server made no moderator and Admin is closed');
  else {
    // Admin = a Studio-labelled session that also passed the emailed second factor (the e2e inbox shows the code).
    admin = await signIn(modEmail, 'studio-web', MOD_PASSWORD);
    const sent = await call('POST', '/v1/studio/second-factor/send', undefined, admin, STUDIO);
    if (sent.status !== 200 && sent.status !== 429) throw new Error(`second factor send: ${sent.status} ${sent.text}`);
    const code = (await call<{ code: string }>('GET', `/__e2e/code?email=${encodeURIComponent(modEmail)}`)).json?.code;
    must(await call('POST', '/v1/studio/second-factor/verify', { code }, admin, STUDIO), 'the moderator passes the admin second factor');
    const who = await call<{ listener: { id: string } }>('GET', '/v1/me', undefined, await signIn(modEmail, undefined, MOD_PASSWORD));
    ids.set(modEmail, who.json.listener.id);
  }
  const adm = (method: string, path: string, body?: unknown) => call(method, `/v1/admin${path}`, body, admin, STUDIO);

  // ---------- the host: a second show, more episodes, announcements ----------
  const hostStudio = await signIn(hostEmail, 'studio-web');
  const shows = await call<{ shows: { key: string; feedUrl: string; title: string }[] }>('GET', '/v1/studio/shows', undefined, hostStudio);
  let show2 = shows.json?.shows?.find((s) => s.title === 'Capture Evenings');
  if (!show2) {
    const made = must(await call<{ show: { feedUrl: string; title: string }; shows: { key: string; feedUrl: string }[] }>('POST', '/v1/studio/hosted-shows',
      { title: 'Capture Evenings', description: 'A second show, for the screens that list more than one.', author: 'Journey Host', category: 'Society & Culture', language: 'en' }, hostStudio, STUDIO), 'the host creates a second show "Capture Evenings"');
    show2 = { key: made.shows.find((s) => s.feedUrl === made.show.feedUrl)!.key, feedUrl: made.show.feedUrl, title: made.show.title };
  }
  const evenings: { episodeId: string; guid: string; title: string }[] = [];
  for (let i = 3; i >= 1; i--) evenings.unshift(await publish(hostStudio, show2.key, `Evening ${i}: Quiet hours`, `<p>Evening ${i}. A long note for the show-notes screen.</p><p>Jump to <b>0:15</b> and <b>0:45</b>.</p>`, 90_000));
  ok(evenings.length === 3, '3 episodes on the second show');
  const eveEp = evenings[0]!;
  // A draft and a scheduled episode (Studio lists), when the API takes them.
  const upd = must(await call<{ pathname: string }>('POST', `/v1/studio/shows/${j.show.key}/uploads`, { kind: 'audio', contentType: 'audio/mpeg', size: 240_448 }, hostStudio, STUDIO), 'upload token for a draft');
  await maybe('a draft episode in the Studio', () => call('POST', `/v1/studio/shows/${j.show.key}/hosted-episodes`, { title: 'Episode 6: Draft, not yet out', description: 'Draft.', audioUrl: `${STORE}${upd.pathname}`, durationMs: 60_000, status: 'draft' }, hostStudio, STUDIO));
  await maybe('a scheduled episode in the Studio', async () => {
    const u = await call<{ pathname: string }>('POST', `/v1/studio/shows/${j.show.key}/uploads`, { kind: 'audio', contentType: 'audio/mpeg', size: 240_448 }, hostStudio, STUDIO);
    return call('POST', `/v1/studio/shows/${j.show.key}/hosted-episodes`, { title: 'Episode 7: Coming next week', description: 'Scheduled.', audioUrl: `${STORE}${u.json.pathname}`, durationMs: 60_000, publishAt: new Date(Date.now() + 7 * 86_400_000).toISOString() }, hostStudio, STUDIO);
  });
  gap('chapters and transcripts: they come from the publisher\'s RSS feed (podcast:chapters / podcast:transcript) read by the phone; the hosted feed the Studio makes carries neither and no Studio or listener route stores them');

  // ---------- subscriptions ----------
  const now = new Date().toISOString();
  must(await call('PUT', '/v1/me/subscriptions', { items: [
    { feedUrl: j.show.feedUrl, createdAt: now, starred: true, starredAt: now },
    { feedUrl: show2.feedUrl, createdAt: now },
  ] }, tok(lis)), 'listener-02 subscribes to both shows (the first starred)');
  must(await call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: j.show.feedUrl, createdAt: now }, { feedUrl: show2.feedUrl, createdAt: now }] }, tok(plusEmail)), 'plus subscribes to both shows');
  for (const n of [3, 4, 10, 11, 12]) await call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: show2.feedUrl, createdAt: now }] }, tok(L(n).email));
  await maybe('subscription order for listener-02', () => call('PUT', '/v1/me/subscriptions/order', { feedUrls: [show2.feedUrl, j.show.feedUrl] }, tok(lis)));

  // ---------- follows (followers, following, mutual friends for chat) ----------
  for (const n of [3, 4, 10, 11, 12]) must(await call('PUT', `/v1/listeners/${L(2).id}/follow`, undefined, tok(L(n).email)), `listener-${pad(n)} follows listener-02`);
  must(await call('PUT', `/v1/listeners/${L(3).id}/follow`, undefined, tok(lis)), 'listener-02 follows listener-03 (mutual with 03)');
  must(await call('PUT', `/v1/listeners/${L(4).id}/follow`, undefined, tok(lis)), 'listener-02 follows listener-04 (mutual with 04)');
  await call('PUT', `/v1/listeners/${L(20).id}/follow`, undefined, tok(lis));
  await call('PUT', `/v1/listeners/${L(21).id}/follow`, undefined, tok(lis));
  await call('PUT', `/v1/listeners/${L(2).id}/follow`, undefined, tok(plusEmail));
  await call('PUT', `/v1/listeners/${L(2).id}/follow`, undefined, tok(newEmail));
  await call('PUT', `/v1/listeners/${j.host.id}/follow`, undefined, tok(lis));
  // listener-03 (the "user" screens) also has followers of their own.
  for (const n of [5, 10, 11, 12, 13]) await call('PUT', `/v1/listeners/${L(3).id}/follow`, undefined, tok(L(n).email));

  // ---------- profile bits ----------
  await maybe('listener-02 profile: bio, age range, likes public', () => call('PATCH', '/v1/me', { bio: 'Listens on the train. Two shows, many opinions.', likesPublic: true, ageRange: '25-34', gender: 'woman' }, tok(lis)));
  await maybe('listener-03 profile bio', () => call('PATCH', '/v1/me', { bio: 'Night owl. Comments at the good bits.' }, tok(L(3).email)));
  await maybe('interests for listener-02', () => call('PUT', '/v1/me/interests', { genreIds: [1318, 1303, 1489] }, tok(lis)));
  await maybe('community rules accepted (listener-02, host, plus)', async () => { await call('POST', '/v1/me/rules', undefined, tok(plusEmail)); await call('POST', '/v1/me/rules', undefined, tok(hostEmail)); return call('POST', '/v1/me/rules', undefined, tok(lis)); });
  await maybe('push preferences (all on) for listener-02', () => call('PUT', '/v1/me/push-prefs', { newEpisodes: true, popular: true, replies: true, likes: true, follows: true, mentions: true, statuses: true, digest: true, system: true }, tok(lis)));
  await maybe('a push token for listener-02 (so Settings › Push shows it on)', () => call('POST', '/v1/me/push-tokens', { token: 'ExponentPushToken[captureseedlistener02xx]', platform: 'ios' }, tok(lis)));

  // ---------- listening: positions, history, listened days, queue, favourites, moments ----------
  const T = tok(lis);
  const eps = [ep1, ep2, ep3, ep4, ep5];
  for (const [i, e] of eps.entries()) {
    await call('PUT', '/v1/me/listened', { deviceId: 'capture-phone', days: [{ episodeId: e.episodeId, day: day(i * 2), ranges: [[0, i === 0 ? 45_000 : 30_000 + i * 5_000]] }] }, T);
  }
  await call('PUT', '/v1/me/listened', { deviceId: 'capture-phone', days: [{ episodeId: eveEp.episodeId, day: day(1), ranges: [[0, 60_000]] }] }, T);
  must(await call('PUT', '/v1/me/positions', { deviceId: 'capture-phone', observations: [
    { episodeId: ep1.episodeId, offsetMs: 45_000, finished: false, progressSeq: 1, explicitSeek: false },
    { episodeId: ep2.episodeId, offsetMs: 60_000, finished: true, progressSeq: 1, explicitSeek: false },
    { episodeId: ep3.episodeId, offsetMs: 20_000, finished: false, progressSeq: 1, explicitSeek: false },
    { episodeId: eveEp.episodeId, offsetMs: 30_000, finished: false, progressSeq: 1, explicitSeek: false },
    { episodeId: ep4.episodeId, offsetMs: 40_000, finished: false, progressSeq: 1, explicitSeek: false },
    { episodeId: ep5.episodeId, offsetMs: 60_000, finished: true, progressSeq: 1, explicitSeek: false },
  ] }, T), 'positions (they are the History page): in progress, finished, more');
  must(await call('PUT', '/v1/me/queue', { items: [ep3.episodeId, ep4.episodeId, eveEp.episodeId, ep5.episodeId], baseVersion: 0, deviceId: 'capture-phone' }, T), 'the play queue (4 episodes)');
  must(await call('PUT', '/v1/me/library', { items: [
    { kind: 'fav_episode', key: ep1.episodeId, payload: {}, updatedAt: now },
    { kind: 'fav_episode', key: eveEp.episodeId, payload: {}, updatedAt: now },
    { kind: 'moment', key: 'capture-moment-1', payload: { episodeId: ep1.episodeId, atMs: 30_000, note: 'The middle bit worth coming back to', savedAt: Date.now() }, updatedAt: now },
    { kind: 'moment', key: 'capture-moment-2', payload: { episodeId: ep2.episodeId, atMs: 12_000, note: '', savedAt: Date.now() }, updatedAt: now },
    { kind: 'search', key: 'morning', payload: {}, updatedAt: now },
    { kind: 'search', key: 'tone', payload: {}, updatedAt: now },
  ] }, T), 'favourite episodes, saved moments and search history');

  // ---------- comments, replies, threads, likes, heat curve ----------
  const postComment = async (who: string, episodeId: string, body: string, offsetMs?: number, parentId?: string): Promise<string> => {
    await call('POST', '/v1/me/rules', undefined, tok(who));
    for (let tries = 0; tries < 4; tries++) {
      const r = await call<{ comment: { id: string } }>('POST', `/v1/episodes/${episodeId}/comments`, { body, ...(offsetMs !== undefined ? { offsetMs } : {}), ...(parentId ? { parentId } : {}) }, tok(who));
      if (good(r)) { step++; return r.json.comment.id; }
      if (r.status === 429 || /locked|Too many|wait/i.test(r.text)) { await sleep(2500); continue; }
      throw new Error(`comment as ${who}: ${r.status} ${r.text.slice(0, 200)}`);
    }
    throw new Error(`comment as ${who}: kept refusing`);
  };
  const c1 = await postComment(lis, ep1.episodeId, 'The tone at 0:20 is the whole show for me.', 20_000);
  const c2 = await postComment(lis, ep1.episodeId, 'Coming back to this at the end: it holds up.', 52_000);
  const c3 = await postComment(lis, ep2.episodeId, 'Second episode, same tone, still great.', 15_000);
  const c4 = await postComment(lis, eveEp.episodeId, 'Quiet hours is a good name for this one.', 15_000);
  ok(c1 && c2 && c3 && c4, '4 comments by listener-02 at moments');
  // A thread: replies from others, one from the host, a nested level.
  await postComment(L(10).email, ep1.episodeId, 'Agreed — it never changes and that is the point.', undefined, c1);
  await postComment(L(11).email, ep1.episodeId, 'I put it on to sleep. Works.', undefined, c1);
  await postComment(lis, ep1.episodeId, 'Ha, same — thanks both.', undefined, c1); // replies are one level deep
  const replyHost = await call('POST', `/v1/studio/shows/${j.show.key}/comments/${c1}/reply`, { body: 'Thanks for listening — Journey Host' }, hostStudio, STUDIO);
  must(replyHost, 'the host replies to listener-02 in the Studio (a reply notice + a host-marked reply)');
  must(await call('PUT', `/v1/comments/${c1}/like`, undefined, tok(L(12).email)), 'listener-12 likes listener-02\'s comment');
  for (const n of [13, 15, 16, 17]) await call('PUT', `/v1/comments/${c1}/like`, undefined, tok(L(n).email));
  await call('PUT', `/v1/comments/${c2}/like`, undefined, tok(L(13).email));
  // Mention, a pinned comment (the host pins), a favourite comment.
  await postComment(L(14).email, ep1.episodeId, `@${L(2).name} did you hear the change near the end?`, 48_000);
  await maybe('the host pins listener-02\'s first comment', () => call('PUT', `/v1/comments/${c1}/pin`, undefined, hostStudio, STUDIO));
  await maybe('listener-02 favourites someone\'s comment', async () => {
    const soc = await call<{ comments: { id: string; mine?: boolean }[] }>('GET', `/v1/episodes/${ep1.episodeId}/social`, undefined, T);
    const other = soc.json.comments.find((c) => !c.mine)!;
    return call('PUT', '/v1/me/library', { items: [{ kind: 'fav_comment', key: other.id, payload: { episodeId: ep1.episodeId, body: 'saved comment', author: 'Listener', offsetMs: 10_000 }, updatedAt: now }] }, T);
  });
  // More comments on episodes 3-5 so every episode page has some.
  for (const [k, e] of [ep3, ep4, ep5].entries()) for (const n of [20 + k, 22 + k]) await postComment(L(n).email, e.episodeId, `Capture comment ${k}-${n} at a moment`, (n * 3 % 55) * 1000 + 1000);
  // The heat curve: reactions from many listeners clustered at 0:20 and 0:45 on episode 1.
  let reacted = 0;
  for (let n = 5; n <= 45; n++) {
    const hot = n % 3 === 0 ? 20_000 : n % 3 === 1 ? 45_000 : 8_000 + (n % 7) * 5_000;
    const t = tokens.get(L(n).email) ?? (await signIn(L(n).email));
    const r = await call('PUT', `/v1/episodes/${ep1.episodeId}/reactions`, { offsetMs: hot + (n % 4) * 1000 }, t);
    if (good(r)) reacted++;
  }
  for (const n of [2, 3, 4]) await call('PUT', `/v1/episodes/${ep2.episodeId}/reactions`, { offsetMs: 30_000 }, tok(L(n).email));
  ok(reacted >= 20, `a reaction heat curve on episode 1 (${reacted} reactions toggled on)`);
  gap('comment pictures and voice comments: the e2e server connects no image or voice store (src/app.ts takes them as dependencies), so POST /v1/comments/:id/image and /v1/episodes/:id/comments/voice answer "not switched on"');

  // ---------- likes of episodes (the Likes page and like posts) ----------
  must(await call('PUT', `/v1/episodes/${ep1.episodeId}/like`, { note: 'This one.' }, T), 'listener-02 likes episode 1 with a note');
  await call('PUT', `/v1/episodes/${eveEp.episodeId}/like`, {}, T);
  await call('PUT', `/v1/episodes/${ep1.episodeId}/like`, { note: 'Same.' }, tok(L(3).email));
  await call('PUT', `/v1/episodes/${ep2.episodeId}/like`, { note: 'Good.' }, tok(L(3).email));
  must(await call('POST', `/v1/likes/${L(2).id}/${ep1.episodeId}/comments`, { body: 'Great pick, adding it to my list.' }, tok(L(12).email)), 'a comment on listener-02\'s like post (notice: like_post_comment)');
  must(await call('PUT', `/v1/likes/${L(2).id}/${ep1.episodeId}/reactions`, { emoji: '🔥' }, tok(L(13).email)), 'a reaction on listener-02\'s like post (notice: like_post_like)');
  await call('POST', `/v1/likes/${L(3).id}/${ep1.episodeId}/comments`, { body: 'Agree!' }, T);

  // ---------- clips ----------
  const clips: string[] = [];
  for (const [i, w] of [[lis, [10_000, 25_000, 'The tone, in fifteen seconds']], [lis, [30_000, 50_000, 'The middle']], [L(3).email, [5_000, 20_000, 'Start of it']]] as [string, [number, number, string]][]) {
    const r = await call<{ clip: { id: string } }>('POST', `/v1/episodes/${ep1.episodeId}/clips`, { clientId: `capture-clip-${clips.length}`, startMs: w[0], endMs: w[1], caption: w[2] }, tok(i));
    if (good(r)) clips.push(r.json.clip.id);
  }
  ok(clips.length === 3, '3 clips on episode 1');

  // ---------- statuses (text; photo/voice when a store exists) ----------
  const status = must(await call<{ id: string }>('POST', '/v1/voice-posts', { body: 'Evening listen: Quiet hours, track two. Gentle.' }, T), 'listener-02 posts a text status');
  const st3 = await call<{ id: string }>('POST', '/v1/voice-posts', { body: 'Listener 03: five minutes to the hour, and the tone is on.' }, tok(L(3).email));
  const st4 = await call<{ id: string }>('POST', '/v1/voice-posts', { body: 'Listener 04 here. Episode three is the best.' }, tok(L(4).email));
  const st20 = await call<{ id: string }>('POST', '/v1/voice-posts', { body: 'A status from someone listener-02 follows.' }, tok(L(20).email));
  ok(good(st3) && good(st4) && good(st20), 'text statuses by listeners 03, 04, 20 (people listener-02 follows)');
  for (const [n, kind] of [[3, 1], [4, 2], [10, 3], [11, 1], [12, 4]] as [number, number][]) await call('PUT', `/v1/voice-posts/${status.id}/reaction`, { kind }, tok(L(n).email));
  must(await call('POST', `/v1/voice-posts/${status.id}/replies`, { body: 'Same here, what a calm one.' }, tok(L(3).email)), 'a text reply on listener-02\'s status (notice: status_reply)');
  await call('POST', `/v1/voice-posts/${status.id}/replies`, { body: 'Love this.' }, tok(L(4).email));
  const img = await fetch(`${API}/v1/voice-posts/images`, { method: 'POST', headers: { 'content-type': 'image/png', authorization: `Bearer ${T}` }, body: PNG });
  if (img.status >= 300) gap(`status photos: POST /v1/voice-posts/images answered ${img.status} — the e2e server connects no image store`);
  else { const k = (await img.json()) as { imageKey: string }; await maybe('a status with a photo', () => call('POST', '/v1/voice-posts', { body: 'With a photo', items: [{ imageKey: k.imageKey }] }, T)); }
  const voiceTry = await fetch(`${API}/v1/voice-posts`, { method: 'POST', headers: { 'content-type': 'audio/mp4', 'x-duration-ms': '1000', authorization: `Bearer ${T}` }, body: new Uint8Array(64) });
  if (voiceTry.status >= 300) gap(`voice statuses and voice replies: POST /v1/voice-posts with a recording answered ${voiceTry.status} — the e2e server connects no voice store (and the 48 h store needs the owner's approval by name)`);
  gap('status_milestone notice: needs 100 reactions on one status; the journey seed has 50 listeners and a reaction is one per listener');

  // ---------- notices: follow/reply/like/mention exist already; host announcement; system notice ----------
  const ann = await call('POST', `/v1/studio/shows/${j.show.key}/announcements`, { body: 'New this week: Episode 6 is on its way. Thanks for listening.' }, hostStudio, STUDIO);
  must(ann, 'the host posts an announcement (listener-02 gets a host notice)');
  await call('POST', `/v1/studio/shows/${show2.key}/announcements`, { body: 'Capture Evenings returns on Friday.' }, hostStudio, STUDIO);
  if (admin) {
    must(await adm('POST', '/notices', { title: 'Welcome to the capture build', body: 'This is a system notice from SocialNet. It shows on the System page.', link: { label: 'Open Discover', route: '/discover' }, push: false }), 'a system notice to everyone (Admin)');
    await adm('POST', '/notices', { title: 'Scheduled maintenance', body: 'We will be back shortly after a short upgrade.', push: false });
  } else gap('system notices: no admin session');

  // ---------- playlists, shared list ----------
  const pl = must(await call<{ id: string }>('POST', '/v1/me/playlists', { title: 'Evening wind-down', isPublic: true }, T), 'a public playlist');
  must(await call('PUT', `/v1/me/playlists/${pl.id}/items`, { episodeIds: [ep1.episodeId, eveEp.episodeId, ep3.episodeId] }, T), 'the playlist holds 3 episodes');
  const pl2 = await call<{ id: string }>('POST', '/v1/me/playlists', { title: 'Private picks', isPublic: false }, T);
  if (good(pl2)) await call('PUT', `/v1/me/playlists/${pl2.json.id}/items`, { episodeIds: [ep2.episodeId] }, T);
  const list = must(await call<{ id: string }>('POST', '/v1/me/shared-lists', { title: 'Two shows for the evening', feedUrls: [j.show.feedUrl, show2.feedUrl] }, T), 'a shared show list');

  // ---------- chat (needs mutual follows: 02 <-> 03, 02 <-> 04) ----------
  const chatId = L(3).id;
  must(await call('POST', `/v1/me/chats/${chatId}`, { body: 'Did you hear the new episode?' }, T), 'chat: listener-02 writes to listener-03');
  await call('POST', `/v1/me/chats/${L(2).id}`, { body: 'Just finished it — the end is lovely.' }, tok(L(3).email));
  await call('POST', `/v1/me/chats/${chatId}`, { body: 'Sending it to you.', episodeId: ep1.episodeId }, T);
  await call('POST', `/v1/me/chats/${L(2).id}`, { body: 'Thanks! Playing it now.' }, tok(L(3).email));
  await call('POST', `/v1/me/chats/${L(2).id}`, { body: 'Are you around later?' }, tok(L(4).email));
  ok((await call<{ conversations: unknown[] }>('GET', '/v1/me/chats', undefined, T)).json.conversations.length >= 2, 'two chat conversations, one with an unread message');

  // ---------- safety: blocks, mutes, reports, word filter ----------
  await call('POST', '/v1/me/blocks', { listenerId: L(49).id }, T);
  await call('PUT', `/v1/me/mutes/${L(40).id}`, undefined, T);
  const rep = async (who: string, kind: string, id: string, reason: string, note?: string) => call('POST', '/v1/reports', { targetKind: kind, targetId: id, reason, ...(note ? { note } : {}) }, tok(who));
  await maybe('a report on a status', () => rep(L(5).email, 'status', st4.json?.id ?? status.id, 'spam', 'capture: status report'));
  await maybe('a report on a clip', () => rep(L(5).email, 'clip', clips[2]!, 'harassment', 'capture: clip report'));
  await maybe('a report on a profile', () => rep(L(6).email ?? L(5).email, 'profile', L(40).id, 'spam', 'capture: profile report'));
  await maybe('a report on a list', () => rep(L(5).email, 'list', list.id, 'spam', 'capture: list report'));
  if (admin) await maybe('blocked words (Admin)', () => adm('POST', '/words', { words: ['capturebadword'] }));

  // ---------- plus ----------
  const plusId = ids.get(plusEmail)!;
  if (admin) {
    must(await adm('POST', `/users/${plusId}/plus`, { days: 90 }), 'the plus account gets 90 days of PLUS (Admin grant, recorded)');
    // listener-02 gets a redeem code's PLUS? No: they stay without PLUS so the PLUS-gated screens show their locked state.
    const code = await maybe('a redeem code (Admin)', () => adm('POST', '/redeem', { kind: 'plus', days: 30, count: 1 }));
    void code;
  } else gap('PLUS: no admin session to grant it');
  gap('wallet purchases, tips and gifts: a purchase is recorded only by POST /v1/me/purchases/google after Google Play verifies it (the e2e server has no Play client); the wallet therefore lists nothing but PLUS entitlements, and /gift/:code has no code');
  gap('weekly digest: rows are made by the hourly internal step only on Monday 12:00-12:59 local time for PLUS members, and the e2e server has no job token; /digest/<week> opens on an empty week');

  // ---------- Admin content: Academy page, topic collection, issue ----------
  let academy = 'getting-started';
  let topic = 'capture-evenings';
  let issue = '';
  if (admin) {
    const pg = await adm('PUT', `/content/academy/${academy}`, { version: 0, title: 'Getting started with SocialNet', summary: 'Your first five minutes.', tag: null, body: 'Welcome.\n\nSubscribe to a show, play an episode and leave a comment at a moment you like.', position: 0, published: true });
    if (!good(pg)) gap(`Academy page: ${pg.status} ${pg.text.slice(0, 160)}`);
    await adm('PUT', '/content/help/how-to-comment', { version: 0, title: 'How do I comment at a moment?', summary: null, tag: null, body: 'Open the player, tap the comment button and write.', position: 0, published: true });
    const col = await adm('PUT', `/collections/${topic}`, { version: 0, title: 'Evening listening', subtitle: 'Quiet shows for the end of the day', position: 0, items: [{ feedUrl: j.show.feedUrl, guid: ep1.guid, why: 'The tone that started it' }, { feedUrl: show2.feedUrl, guid: eveEp.guid, why: 'Quiet hours' }] });
    if (!good(col)) { gap(`topic collection: ${col.status} ${col.text.slice(0, 200)}`); }
    const iss = await adm('PUT', `/issues/capture-issue-1`, { version: 0, day: day(1), title: 'The quiet issue', intro: 'Two shows that make no noise.', items: [{ feedUrl: j.show.feedUrl, guid: ep1.guid, note: 'A minute of tone.' }, { feedUrl: show2.feedUrl, guid: eveEp.guid, note: 'Quiet hours.' }] });
    if (good(iss)) issue = 'capture-issue-1'; else gap(`issue: ${iss.status} ${iss.text.slice(0, 200)}`);
  } else { gap('Academy page, topic collection and issue: no admin session'); }
  const issueList = await call<{ items?: { id: string }[]; issues?: { id: string }[] }>('GET', '/v1/issues');
  if (!issue) issue = issueList.json?.items?.[0]?.id ?? issueList.json?.issues?.[0]?.id ?? '';
  const acad = await call<{ items: { slug: string }[] }>('GET', '/v1/content/academy');
  if (acad.json?.items?.[0]) academy = acad.json.items[0].slug;
  const cats = await call<{ categories: { genreId: number | string; name: string }[] }>('GET', '/v1/categories');
  const category = String(cats.json?.categories?.find((c) => /tech/i.test(c.name))?.genreId ?? cats.json?.categories?.[0]?.genreId ?? '');

  // ---------- suspended (last: the account must be made and used before it is cut off) ----------
  if (admin) must(await adm('POST', `/users/${ids.get(suspEmail)!}/suspend`), 'the suspended account is suspended through Admin');
  else gap('suspended account: made, but nothing suspended it (no admin session)');

  // ---------- notifications: what listener-02 holds now ----------
  const notes = await call<{ items: { kind: string }[] }>('GET', '/v1/me/notifications', undefined, T);
  const kinds = [...new Set((notes.json?.items ?? []).map((n) => n.kind))].sort();
  console.log(`  notification kinds held by listener-02: ${kinds.join(', ')}`);
  for (const k of ['reply', 'like', 'mention', 'follow', 'like_post_comment', 'like_post_like', 'status_reply', 'status_reaction'])
    if (!kinds.includes(k)) gap(`notification kind "${k}" is not held by listener-02 after seeding`);
  const hn = await call<{ items?: unknown[] }>('GET', '/v1/me/host-notices', undefined, T);
  ok(good(hn) && (hn.json.items?.length ?? 0) >= 1, 'listener-02 has host notices');
  const sys = await call<{ items: unknown[] }>('GET', '/v1/me/notifications/system', undefined, T);
  console.log(`  system notices visible to listener-02: ${sys.json?.items?.length ?? 0}`);

  const thread = c1;
  const week = (() => { const d = new Date(); const day0 = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day0); const y = d.getUTCFullYear(); return `${y}-W${pad(Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7))}`; })();
  const manifest = {
    show: encodeURIComponent(j.show.feedUrl),
    show2: encodeURIComponent(show2.feedUrl),
    episode: ep1.episodeId,
    episode2: ep2.episodeId,
    comment: c1,
    thread,
    user: L(3).id,
    host: j.host.id,
    playlist: pl.id,
    list: list.id,
    status: status.id,
    clip: clips[0]!,
    issue,
    chat: chatId,
    sticker: 'hour-1',
    gift: '',
    digest: week,
    month: new Date().toISOString().slice(0, 7),
    category,
    topic,
    academy,
    accounts: {
      visitor: null,
      new: { email: newEmail },
      listener: { email: lis },
      host: { email: hostEmail },
      plus: { email: plusEmail },
      moderator: { email: modEmail ?? '' },
      suspended: { email: suspEmail },
    },
    password: PASSWORD,
    gaps,
  };
  writeFileSync(OUT, JSON.stringify(manifest, null, 2));
  console.log(`capture seed done: ${OUT} (${step} checks, ${gaps.length} gaps; password for every account: ${PASSWORD})`);
}

await main();
