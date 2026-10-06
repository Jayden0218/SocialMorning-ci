// Builds the Hono app: shared setup, error handling, and every route mounted.
import { commentCounts } from './routes/social/comment-counts.ts';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import type { Db } from './db/db.ts';
import type { AuthEnv } from './auth/session.ts';
import { ApiError } from './errors.ts';
import { auth } from './routes/account/auth.ts';
import { me } from './routes/account/me.ts';
import { episodes } from './routes/library/episodes.ts';
import { comments, commentById } from './routes/social/comments.ts';
import { social } from './routes/social/social.ts';
import { reactions } from './routes/social/reactions.ts';
import { positions } from './routes/library/positions.ts';
import { subscriptions } from './routes/library/subscriptions.ts';
import { library, myCommentsRoute } from './routes/library/library.ts';
import { pushPrefs, pushTokens } from './routes/account/push.ts';
import { feedback } from './routes/account/feedback.ts';
import { creator } from './routes/creators/creator.ts';
import { clipById, episodeClips } from './routes/social/clips.ts';
import { createClipPages } from './pages/clip.ts';
import { mod } from './pages/mod.ts';
import { legal } from './pages/legal.ts';
import { hidden, reports } from './routes/safety/reports.ts';
import { blocks } from './routes/safety/blocks.ts';
import { mutes } from './routes/social/mutes.ts';
import { notifications } from './routes/social/notifications.ts';
import { follows } from './routes/social/follows.ts';
import { feed } from './routes/social/feed.ts';
import { listened, listeningRoute } from './routes/library/listened.ts';
import { stickers } from './routes/account/stickers.ts';
import { privacy, profiles } from './routes/social/profiles.ts';
import { discover } from './routes/discover/discover.ts';
import { createSearchRoute } from './routes/discover/search.ts';
import { nextup } from './routes/discover/nextup.ts';
import { foryou } from './routes/discover/foryou.ts';
import { createInternalRoute } from './routes/internal.ts';
import { recEvents } from './routes/library/rec-events.ts';
import { dismissals } from './routes/library/dismissals.ts';
import { episodeLikes, likePosts, likeTimeline, listenerLikes } from './routes/social/likes.ts';
import { listenerPlaylists, myPlaylistRoutes, playlistRoutes } from './routes/social/playlists.ts';
import { voiceComments } from './routes/social/voice-comments.ts';
import { m19Me } from './routes/account/m19.ts';
import { validateIssues, validatePicks } from '@socialmorning/social-core';
import type { Catalog, Safety } from './auth/session.ts';
import picksJson from '../picks.json' with { type: 'json' };
import collectionsJson from '../collections.json' with { type: 'json' };
import { validateCollections } from './catalog/collections.ts';
import { categories } from './routes/discover/categories.ts';
import { studio } from './routes/studio/index.ts';
import { extras } from './routes/creators/extras.ts';
import { feeds } from './routes/creators/feeds.ts';
import { covers } from './routes/creators/covers.ts';
import { showCard } from './pages/show-card.ts';
import { blobStorage } from './storage/episodes-blob.ts';
import { DEFAULT_CEILING_BYTES } from './db/repos/studio/hosted.ts';
import { live } from './routes/social/live.ts';
import { notify } from './routes/account/notify.ts';
import { wallet } from './routes/account/wallet.ts';
import { friends } from './routes/social/friends.ts';
import { issues, pastPicks } from './routes/discover/issues.ts';
import { voice } from './routes/social/voice.ts';
import { chat } from './routes/social/chat.ts';
import { share } from './routes/social/share.ts';
import { episodePages } from './pages/episode.ts';
import { voiceBlobStorage, type VoiceStorage } from './storage/voice-blob.ts';
import { imageStorageFromEnv, type ImageStorage } from './storage/image-store.ts';
import { googlePlay, type GooglePlay } from './billing/google-play.ts';
import { purchasesGoogle } from './routes/account/purchases-google.ts';
import { paid } from './routes/creators/paid.ts';
import { commentImage, COMMENT_IMAGE_MAX_BYTES } from './routes/social/comment-image.ts';
import { VOICE_MAX_BYTES } from './db/repos/social/voice-posts.ts';
import { AVATAR_MAX_BYTES } from './db/repos/account/profile.ts';
import { admin } from './routes/admin/index.ts';
import { createLaunchRoute } from './routes/discover/launch.ts';
import { seedOwnerAdmin } from './auth/admin.ts';
import { liveCatalog } from './catalog/live.ts';

export type AppDeps = {
  db: Db; pepper: string; assetLinksSha256?: string;
  /** M5: the catalogue's fetch (tests inject a fake Apple) and the raw picks file; defaults: global fetch, `picks.json`. */
  catalogFetch?: typeof fetch;
  picksRaw?: unknown;
  /** M10: the raw collections file; default `collections.json`. */
  collectionsRaw?: unknown;
  today?: () => string;
  /** M6: the one moderator and the appeals address. Missing → `/mod` answers 503 and the message names no address (degrade, never crash). */
  ownerListenerId?: string;
  appealsEmail?: string;
  /** M6: the published build's SHA-256 shown on `/get` (env RELEASE_SHA256). */
  releaseSha256?: string;
  /** M8: the scheduled rebuild's bearer token (env JOB_TOKEN). Unset → /v1/internal is closed. */
  jobToken?: string;
  /** M10b US3: the fetch used for Expo push (tests inject a fake). Default: global fetch. */
  pushFetch?: typeof fetch;
  /** M13: the store for created shows' audio (default: Vercel Blob with env EPISODES_READ_WRITE_TOKEN), the API's public address, the storage ceiling. */
  episodeStorage?: import('./storage/episodes-blob.ts').EpisodeStorage;
  publicBase?: string;
  hostedCeilingBytes?: number;
  /** Sends the sign-in code (env GMAIL_USER + GMAIL_APP_PASSWORD). Unset → the code routes answer 503. */
  mailer?: import('./mail/mailer.ts').Mailer;
  /** M12 FR-104: the voice-post store (default: Vercel Blob with env BLOB_READ_WRITE_TOKEN; unset → 503 storage_off). */
  voiceStorage?: VoiceStorage;
  /** M19 US1: where profile photos go (tests pass a fake). */
  avatarStorage?: VoiceStorage;
  /** M20 US9: where comment images go (default: Blob `socialmorning-images` via IMAGES_READ_WRITE_TOKEN, else R2 env; unset → 503). */
  imageStorage?: ImageStorage;
  /** M20 US9: the total the image store may hold (env IMAGE_CEILING_BYTES; default 500 MB — half of Blob Hobby's 1 GB, shared). */
  imageCeilingBytes?: number;
  /** M20 US6: Google Play (default: from env GOOGLE_PLAY_*; unset → purchases "not available yet"). */
  play?: GooglePlay;
  /** M12 FR-034: the fetch the share card uses for artwork. Default: global fetch. */
  imageFetch?: typeof fetch;
};

/**
 * The one Hono app. `src/server.ts` serves it locally; `api/index.ts` is the Vercel entry.
 * Every error leaves as `{ error, message }` (contracts/api.md); zod failures become 422.
 */
export function createApp(deps: AppDeps) {
  const app = new Hono<AuthEnv>();

  app.use('*', requestId());
  // M10b US6: feedback carries up to 3 images (≤ 250 000 bytes each, base64); every other route stays at 16 KB.
  const small = bodyLimit({ maxSize: 16 * 1024 });
  const feedbackLimit = bodyLimit({ maxSize: 1_100_000 });
  // M12 FR-104: a voice post is the raw recording, ≤ 600 000 bytes — only on that one route.
  const voiceLimit = bodyLimit({ maxSize: VOICE_MAX_BYTES, onError: (c) => c.json(new ApiError('too_large', 'A voice post is at most 600 000 bytes.').body(), 413) });
  // M15 T027: a bulk account list (≤ 50 rows of name + bio + email) can pass 16 KB.
  const adminBulkLimit = bodyLimit({ maxSize: 64 * 1024 });
  // M19 US1: a profile photo is at most 200 KB (constitution v2.6.0).
  const avatarLimit = bodyLimit({ maxSize: AVATAR_MAX_BYTES, onError: (c) => c.json(new ApiError('too_large', 'A profile photo is at most 200 KB.').body(), 413) });
  // M20 US9: a comment image is at most 1 000 000 bytes after the phone shrinks it.
  const imageLimit = bodyLimit({ maxSize: COMMENT_IMAGE_MAX_BYTES, onError: (c) => c.json(new ApiError('too_large', 'An image is at most 1 MB.').body(), 413) });
  app.use('*', (c, next) => (c.req.path === '/v1/feedback' ? feedbackLimit(c, next)
    : c.req.method === 'POST' && /^\/v1\/comments\/[^/]+\/image$/.test(c.req.path) ? imageLimit(c, next)
    : c.req.path === '/v1/admin/accounts' ? adminBulkLimit(c, next)
    : c.req.path === '/v1/me/avatar' && c.req.method === 'PUT' ? avatarLimit(c, next)
    : c.req.method === 'POST' && (c.req.path === '/v1/voice-posts' || /^\/v1\/episodes\/[^/]+\/comments\/voice$/.test(c.req.path)) ? voiceLimit(c, next) : small(c, next)));
  // M5: the picks file is validated once; every bad entry is a warning, never a crash (G1).
  const { picks, warnings } = validatePicks(deps.picksRaw ?? picksJson);
  for (const w of warnings) console.warn(`[picks] ${w}`);
  // M10: collections are validated the same way — a bad one is a warning, never a crash.
  const cols = validateCollections(deps.collectionsRaw ?? collectionsJson);
  for (const w of cols.warnings) console.warn(`[collections] ${w}`);
  // M12 FR-101: the same file's `issues` key, validated the same way.
  const iss = validateIssues(deps.picksRaw ?? picksJson);
  for (const w of iss.warnings) console.warn(`[issues] ${w}`);
  const catalog: Catalog = { pushFetch: deps.pushFetch ?? fetch, fetch: deps.catalogFetch ?? fetch, picks, collections: cols.collections, issues: iss.issues, today: deps.today ?? (() => new Date().toISOString().slice(0, 10)) };

  // M15 T004: the owner is the first admin (FR-002). Also done lazily by every admin check, so a
  // start before migration 014 only warns.
  if (deps.ownerListenerId) seedOwnerAdmin(deps.db, deps.ownerListenerId).catch((e: unknown) => console.warn(`[admin] seed skipped: ${e instanceof Error ? e.message : String(e)}`));

  if (!deps.ownerListenerId || !deps.appealsEmail) console.warn('[safety] OWNER_LISTENER_ID / APPEALS_EMAIL not set: /mod is off, messages name no address');
  const safety: Safety = { ownerListenerId: deps.ownerListenerId, appealsEmail: deps.appealsEmail, releaseSha256: deps.releaseSha256 };

  // M13: an unconnected store is not an error — creating a show still works; uploads say why not.
  const storage = deps.episodeStorage ?? blobStorage(process.env['EPISODES_READ_WRITE_TOKEN']);
  const voiceStorage = deps.voiceStorage ?? voiceBlobStorage(process.env['BLOB_READ_WRITE_TOKEN']);
  // M19 US1: photos go to the launch-image store (constitution v2.6.0), put by the server like voice posts.
  const avatarStorage = deps.avatarStorage ?? voiceBlobStorage(process.env['EPISODES_READ_WRITE_TOKEN']);
  const imageFetch = deps.imageFetch ?? fetch;
  const imageStorage = deps.imageStorage ?? imageStorageFromEnv(process.env);
  const play = deps.play ?? googlePlay(process.env);
  const imageCeilingBytes = deps.imageCeilingBytes ?? (Number(process.env['IMAGE_CEILING_BYTES']) || 500_000_000);
  const publicBase = deps.publicBase ?? process.env['PUBLIC_API_URL'] ?? 'https://socialmorning-api.vercel.app';

  app.use('*', async (c, next) => {
    c.set('db', deps.db);
    c.set('pepper', deps.pepper);
    // M15 T013: picks, issues and collections from the admin tables first, the files second (60 s memo).
    c.set('catalog', await liveCatalog(deps.db, catalog));
    c.set('safety', safety);
    if (deps.mailer) c.set('mailer', deps.mailer);
    c.set('storage', storage);
    c.set('publicBase', publicBase);
    c.set('hostedCeilingBytes', deps.hostedCeilingBytes ?? DEFAULT_CEILING_BYTES);
    c.set('voice', voiceStorage);
    c.set('avatars', avatarStorage);
    c.set('images', imageStorage);
    c.set('imageCeilingBytes', imageCeilingBytes);
    c.set('play', play);
    c.set('imageFetch', imageFetch);
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json(err.body(), err.status as 422);
    if (err instanceof Error && /reply_depth/.test(err.message)) {
      return c.json(new ApiError('reply_depth', 'You can reply to a comment, not to a reply.').body(), 422);
    }
    console.error(c.get('requestId'), err);
    return c.json({ error: 'internal', message: 'Something went wrong on our side.' }, 500);
  });
  app.notFound((c) => c.json({ error: 'not_found', message: 'No such route.' }, 404));

  app.get('/v1/health', (c) => c.json({ ok: true }));
  // M6 (FR-027): the appeals address the app shows — never hard-coded in a build.
  app.get('/v1/meta', (c) => c.json({ ...(safety.appealsEmail ? { appealsEmail: safety.appealsEmail } : {}) }));
  app.route('/v1/auth', auth);
  app.route('/v1/me', me);
  app.route('/v1/me/positions', positions);
  app.route('/v1/me/subscriptions', subscriptions);
  app.route('/v1/me/library', library);
  app.route('/v1/me/comments', myCommentsRoute);
  app.route('/v1/me/push-tokens', pushTokens);
  app.route('/v1/me/push-prefs', pushPrefs);
  app.route('/v1/feedback', feedback);
  app.route('/v1/creator', creator);
  // M11 — the Studio (specs/011-m11-studio). Its env adds `show`; the shared variables are the same.
  app.route('/v1/studio', studio as unknown as Hono<AuthEnv>);
  // M15 — Admin (specs/015-m15-admin): owner-only, every route behind `adminOnly` (guard G-A1).
  app.route('/v1/admin', admin as unknown as Hono<AuthEnv>);
  app.route('/v1/launch', createLaunchRoute());
  app.route('/v1', extras);
  app.route('/feeds', feeds);
  app.route('/covers', covers);
  app.route('/show', showCard);
  app.route('/v1/me/rec-events', recEvents);
  // M19 US2, US3
  app.route('/v1/me/dismissals', dismissals);
  app.route('/v1/me/likes', likeTimeline);
  // M21 US7 (T081): like posts — comments and reactions on one like.
  app.route('/v1/likes', likePosts);
  app.route('/v1/me/playlists', myPlaylistRoutes);
  app.route('/v1/me', m19Me);
  app.route('/v1/playlists', playlistRoutes);
  // M12 (specs/012-m12-the-finish/contracts/api.md)
  app.route('/v1/me/notify', notify);
  app.route('/v1/me', wallet);
  app.route('/v1/me', purchasesGoogle);
  app.route('/v1/hosted', paid);
  app.route('/v1/me', friends);
  app.route('/v1/picks', pastPicks);
  app.route('/v1/issues', issues);
  app.route('/v1/voice-posts', voice);
  app.route('/v1/share', share);
  app.route('/v1/episodes', episodeLikes);
  app.route('/v1/episodes', voiceComments);
  app.route('/v1/episodes', live);
  app.route('/v1/episodes', commentCounts);
  // Chat (owner, 2026-10-04): one-to-one messages between people who follow each other.
  app.route('/v1/me/chats', chat);
  app.route('/v1/me/feed', feed);
  app.route('/v1/me/listened', listened);
  app.route('/v1/me/listening', listeningRoute); // M21 US9
  app.route('/v1/me/stickers', stickers); // M21 US9
  app.route('/v1/me/privacy', privacy);
  app.route('/v1/me/blocks', blocks);
  app.route('/v1/me/mutes', mutes); // M21 US6
  app.route('/v1/me/notifications', notifications); // M21 US10
  app.route('/v1/me/hidden', hidden);
  app.route('/v1/reports', reports);
  app.route('/v1/listeners', listenerLikes);
  app.route('/v1/listeners', listenerPlaylists);
  app.route('/v1/listeners', follows);
  app.route('/v1/listeners', profiles);
  app.route('/v1/discover', discover);
  app.route('/v1/categories', categories);
  app.route('/v1/for-you', foryou);
  app.route('/v1/internal', createInternalRoute(deps.jobToken));
  app.route('/v1/search', createSearchRoute());
  app.route('/v1/episodes', nextup);
  app.route('/v1/episodes', episodes);
  app.route('/v1/episodes', comments);
  app.route('/v1/episodes', social);
  app.route('/v1/episodes', reactions);
  // M20 US9: before commentById, so GET /v1/comments/images is not read as a comment id.
  app.route('/v1/comments', commentImage);
  app.route('/v1/comments', commentById);
  app.route('/v1/episodes', episodeClips);
  app.route('/v1/clips', clipById);
  app.route('/mod', mod);
  app.route('/', legal);
  app.route('/', episodePages);
  app.route('/', createClipPages({ ...(deps.assetLinksSha256 !== undefined ? { assetLinksSha256: deps.assetLinksSha256 } : {}) }));

  return app;
}

