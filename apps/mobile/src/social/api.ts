// Typed client for every server call, with clear error types.
/**
 * Typed client for contracts/api.md. No React in here: it takes a `fetch`, a
 * base URL and a token provider, so the tests hand it fakes and the app hands it
 * the real ones (`createApiClient` below).
 *
 * Every non-2xx answer becomes an `ApiError` carrying the server's `{ error,
 * message }`; a network failure becomes `ApiError('network')` so callers can
 * tell "the server said no" from "we could not reach the server" (FR-032).
 */

export type ErrorCode =
  | 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'locked'
  | 'duration_unknown' | 'reply_depth' | 'self_follow' | 'unavailable' | 'internal' | 'network'
  | 'suspended' | 'blocked' | 'removed'
  // M11: the show's host turned off comments for this listener on that show.
  | 'muted_on_show'
  // M21 US6: a first comment waits for the community rules (428).
  | 'rules_required'
  // M24 US2: the words hold one the admin blocked (422); US4: the server is under maintenance (503).
  | 'blocked_word' | 'maintenance';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get retryAfterSeconds(): number | undefined {
    const v = this.extra['retryAfterSeconds'];
    return typeof v === 'number' ? v : undefined;
  }
}

export type Listener = {
  id: string; email: string; displayName: string; createdAt: string; privateListening?: boolean;
  /** M19 US1 (contracts/api.md GET/PATCH /v1/me): all optional, so an older server still parses. */
  avatarUrl?: string; bio?: string; ageRange?: string | null; gender?: string | null; likesPublic?: boolean;
  /** M20 US6: PLUS now (the badge, the app icons); computed by the server. */
  plus?: boolean;
  /** M21 US8: private — returned to the owner alone. M21 US10: the privacy switches. */
  birthday?: string; industry?: string;
  hideBadge?: boolean; hideStickers?: boolean; hideDecorations?: boolean; privateSubscriptions?: boolean;
};
export type EpisodeRegistration = {
  feedUrl: string; guid: string; title: string; showTitle?: string; enclosureUrl: string; imageUrl?: string; durationMs?: number;
  /** M8: ISO-8601, the PUBLISHER's date. */
  publishedAt?: string;
  /** M8: the show's `<itunes:category>` values; the server maps them to a genre id. */
  categories?: string[];
};
export type Comment = {
  id: string; authorId: string | null; displayName: string | null; body: string | null; offsetMs: number | null;
  parentId: string | null; createdAt: string; deleted: boolean; mine?: boolean; replies?: Comment[];
  /** M6: taken down by moderation (a placeholder for all; the author sees why). */
  removed?: boolean;
  /** M6: a reply by someone the viewer blocked (a placeholder so the thread keeps its shape). */
  blocked?: boolean;
  /** M6 (FR-002): this viewer reported it — "You reported this". */
  reported?: boolean;
  /** M10b US8: written by the show's proven creator. */
  host?: true;
  /** M11: the host hid it. Others get a placeholder; the author still reads it, marked. */
  hiddenByHost?: true;
  /** M12 FR-022/023: public like count; whether this viewer liked it; the avatar's letter. */
  likeCount?: number;
  likedByMe?: boolean;
  initials?: string | null;
  /** M19 US1: the author's photo, when they set one (absent on an older server). */
  avatarUrl?: string;
};
export type Social = {
  serverTime: string;
  episode: { id: string; durationMs: number | null };
  comments: Comment[];
  heat: { available: true; buckets: number[] } | { available: false };
  myReactionBuckets?: number[];
};
export type PositionObsIn = { episodeId: string; offsetMs: number; finished: boolean; progressSeq: number; explicitSeek: boolean };
export type PositionRowOut = PositionObsIn & { receivedAt: string; deviceId: string };

export type SocialResult = { status: 200; etag?: string; body: Social } | { status: 304 };

// ---- M4 (specs/004-m4-the-graph/contracts/api.md) ----
export type ClipAuthor = { id: string; displayName: string | null; /** M19 US1 */ avatarUrl?: string; /** M21 US8: follow lists only — the one-line bio, and whether I follow them (signed in). */ bio?: string; youFollow?: boolean };
export type Clip = { id: string; author: ClipAuthor; episodeId: string; startMs: number; endMs: number; caption: string; createdAt: string; deleted: boolean; removed?: boolean; reported?: boolean };
export type EpisodeRecord = { id: string; feedUrl: string; guid: string; title: string; showTitle: string | null; enclosureUrl: string; imageUrl: string | null; durationMs: number | null };
export type ProfileStats = { listenedMs: number; finished: number; topShows: { feedUrl: string; showTitle?: string; listenedMs: number }[] };
export type FeedItem = {
  id: number; kind: 'listened' | 'clipped' | 'commented'; actor: ClipAuthor;
  episode: { id: string; title: string; showTitle: string | null; imageUrl: string | null };
  momentMs: number | null; refId: string | null; createdAt: string;
};
export type Profile = {
  id: string; displayName: string; followers: number; following: number; isFollowing: boolean;
  stats: { last7: ProfileStats; all: ProfileStats } | null; recent: FeedItem[];
  suspended?: boolean; blockedByMe?: boolean;
  /** M20 US6: a PLUS member — the badge beside the name (public, like the name). */
  plus?: boolean;
  /** M10b US7: two-letter country from the listener's last sign-in ("IP location"), public. */
  country?: string;
  /** M19 US1: the listener's photo and short bio, when set (absent on an older server). */
  avatarUrl?: string;
  bio?: string;
  /** M21 US8: shows they are a verified host of; how many episodes they liked (absent while private); subscriptions kept private. */
  hostOf?: { feedUrl: string; title: string }[];
  likesCount?: number;
  privateSubscriptions?: boolean;
};
export type FeedResult = { status: 200; etag?: string; body: { items: FeedItem[]; next?: string; serverTime: string } } | { status: 304 };
export type ListenedDay = { episodeId: string; day: string; ranges: [number, number][] };

// ---- M5 (specs/005-m5-discovery/contracts/api.md) ----
export type EpisodeCard = { id: string; feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string; durationMs?: number; publishedAt?: string; enclosureUrl: string };
export type DiscoverItem = { kind: 'pick' | 'talkedAbout' | 'trending'; key: string; episode: EpisodeCard; why?: string; reason?: string; score?: number; date?: string; /** M10: counts only, never names (G6). */ stats?: { listeners: number; comments: number } };
/**
 * M10 (2026-09-27): the redesigned Discover's extra sections. All optional — an older
 * server, or one that could not build a section, leaves it out and the screen skips it.
 */
export type FollowedShow = { feedUrl: string; title: string; imageUrl?: string; author?: string; followers: number };
export type SaidItem = { commentId: string; authorId: string; body: string; createdAt: string; episode: EpisodeCard };
export type Collection = { id: string; title: string; subtitle?: string; items: DiscoverItem[] };
export type Discover = {
  date?: string; picks: DiscoverItem[]; talkedAbout: DiscoverItem[]; trending: DiscoverItem[]; stale: boolean; serverTime: string;
  shows?: ShowCard[];
  newShows?: { show: ShowCard; episode: EpisodeCard }[];
  followedHere?: { total: number; shows: FollowedShow[] };
  said?: SaidItem[];
  collections?: Collection[];
  /** M10b US5: video episodes, newest first (≤ 10). */
  video?: DiscoverItem[];
  /** Owner, 2026-10-05: "Premium picks" — the chart's next six shows. No price; nothing is sold. */
  premium?: ShowCard[];
  /** Owner, 2026-10-05: "New arrivals" — shows created in the Studio, newest first, each with its newest episode. */
  newArrivals?: { show: ShowCard; episode: EpisodeCard }[];
  /**
   * M15 US5 (contracts/admin-api.md): the owner's section order and hidden sections, by the
   * phone's section ids (`src/discover/sections.ts` `SECTION_IDS`). Absent → today's order.
   */
  layout?: { order: string[]; hidden: string[] };
};
export type LibraryItem = { kind: 'fav_episode' | 'fav_comment' | 'moment' | 'search'; key: string; payload?: Record<string, unknown>; updatedAt: string; deletedAt?: string };
/** M10b US8: a claim on a feed the listener publishes; `code` goes anywhere in the feed. */
export type CreatorClaim = { id: string; feedUrl: string; code: string; status: 'pending' | 'proven' | 'revoked'; provenAt?: string };
export type ShowStats = { listeners: number; comments: number; episodes: number; topMoments: { episodeId: string; title: string; offsetMs: number; comments: number }[] };
export type MyComment = { id: string; body: string | null; deleted: boolean; removed: boolean; hiddenByHost?: true; offsetMs: number | null; createdAt: string; episode: EpisodeCard };
/** `hasMore` (owner, 2026-10-05): another page follows — `?page=N`, 20 at a time. Missing on lists kept before it. */
export type CategoryShows = { genreId: number; name: string; shows: ShowCard[]; stale?: boolean; hasMore?: boolean };
export type DiscoverResult = { status: 200; etag?: string; body: Discover } | { status: 304 };
export type ShowCard = { appleId?: number; feedUrl: string; title: string; author: string; imageUrl?: string; genres: string[]; episodeCount?: number; /** M12 FR-072: only on a category chart. */ latestEpisode?: { title: string; publishedAt?: string } };
export type SearchResult = { shows: ShowCard[]; episodes: EpisodeCard[]; episodeSearch: 'ok' | 'unavailable'; source: { shows: 'apple' } };
export type NextUpItem = { episode: EpisodeCard; reason: 'alsoListened' | 'talkedAboutOnShow' | 'newOnShow' | 'trendingInCategory'; label: string };

// ---- M8 (specs/008-m8-for-you/contracts/api.md) ----
export type ForYouChannel = 'sub-new' | 'showcf' | 'social' | 'genre' | 'talked' | 'pick' | 'chart';
export type ForYouItem = { episode: EpisodeCard & { id: string }; channel: ForYouChannel; reason: string; score: number };
export type ForYou = { items: ForYouItem[]; computedAt: string; stale: boolean; similarityAge: number | null; serverTime: string };
export type ForYouResult = { status: 200; etag?: string; body: ForYou } | { status: 304 };
export type RecEventIn = { episodeId: string; channel: ForYouChannel; rank: number; kind: 'impression' | 'open' | 'play' | 'finish'; at: string };

// ---- M6 (specs/006-m6-fit-to-ship/contracts/api.md) ----
/** M24 US1: also a status, a chat message (its number) and a shared list. */
export type ReportKind = 'comment' | 'clip' | 'profile' | 'show' | 'episode' | 'status' | 'chat_message' | 'list';
export type HiddenOut = { reported: { kind: ReportKind; id: string }[]; blocked: { id: string; displayName: string }[]; hiddenFeeds: string[] };
export type Meta = { appealsEmail?: string };

/** M8 US1 — the wire shape of one subscription. `deletedAt` present ⇒ unsubscribed. */
export type SubscriptionOut = { feedUrl: string; createdAt: string; deletedAt?: string; starred: boolean; starredAt?: string };

export type ApiClient = {
  signUp(email: string, password: string, displayName: string): Promise<{ token: string; listener: Listener }>;
  signIn(email: string, password: string, deviceLabel?: string): Promise<{ token: string; listener: Listener }>;
  signOut(): Promise<void>;
  /** Owner, 2026-09-27: sign in and sign up with a code sent by email; no password. */
  requestCode(email: string): Promise<{ sent: true; resendAfterSeconds: number }>;
  verifyCode(email: string, code: string, displayName?: string): Promise<{ token: string; listener: Listener } | { needsName: true }>;
  deleteMeWithCode(code: string): Promise<void>;
  me(): Promise<Listener>;
  deleteMe(password: string): Promise<void>;
  registerEpisode(id: string, e: EpisodeRegistration): Promise<void>;
  social(episodeId: string, ifNoneMatch?: string): Promise<SocialResult>;
  postComment(episodeId: string, c: { body: string; offsetMs?: number; parentId?: string; durationMs?: number }): Promise<Comment>;
  deleteComment(id: string): Promise<{ placeholder: boolean }>;
  react(episodeId: string, offsetMs: number, durationMs?: number): Promise<{ reacted: boolean; bucket: number }>;
  putPositions(deviceId: string, observations: PositionObsIn[]): Promise<PositionRowOut[]>;
  getPositions(since?: string): Promise<{ positions: PositionRowOut[]; serverTime: string }>;
  // M4
  postClip(episodeId: string, c: { clientId: string; startMs: number; endMs: number; caption: string }): Promise<Clip>;
  getClip(id: string): Promise<{ clip: Clip; episode: EpisodeRecord }>;
  deleteClip(id: string): Promise<void>;
  episodeClips(episodeId: string, before?: string): Promise<{ clips: Clip[]; next?: string }>;
  follow(listenerId: string): Promise<void>;
  unfollow(listenerId: string): Promise<void>;
  profile(listenerId: string): Promise<Profile>;
  followers(listenerId: string, before?: string): Promise<{ listeners: ClipAuthor[]; next?: string }>;
  following(listenerId: string, before?: string): Promise<{ listeners: ClipAuthor[]; next?: string }>;
  setPrivacy(privateListening: boolean): Promise<{ privateListening: boolean }>;
  // M8 — subscriptions belong to the account, not to this phone (US1)
  getSubscriptions(): Promise<{ items: SubscriptionOut[]; serverTime: string }>;
  putSubscriptions(items: SubscriptionOut[]): Promise<{ items: SubscriptionOut[]; serverTime: string }>;
  forYou(ifNoneMatch?: string): Promise<ForYouResult>;
  postRecEvents(events: RecEventIn[]): Promise<void>;
  feed(before?: string, ifNoneMatch?: string): Promise<FeedResult>;
  putListened(deviceId: string, days: ListenedDay[]): Promise<{ accepted: number }>;
  // M5
  discover(ifNoneMatch?: string): Promise<DiscoverResult>;
  search(q: string): Promise<SearchResult>;
  /** Owner, 2026-10-01: listeners by display name (the Search page's People tab), at most 20. */
  searchPeople(q: string): Promise<{ id: string; displayName: string }[]>;
  /** M10b US2: the account's library (favourites, moments, searches, favourite comments), merged. */
  libraryPut(items: LibraryItem[]): Promise<{ items: LibraryItem[] }>;
  /** M10b US3: this device's push address, and the two notification switches. */
  pushTokenAdd(token: string, platform: 'ios' | 'android'): Promise<void>;
  pushTokenRemove(token: string): Promise<void>;
  pushPrefs(p: { newEpisodes: boolean; popular: boolean }): Promise<void>;
  /** M10b US6: feedback, with up to 3 small JPEGs (base64). */
  sendFeedback(f: { kind: string; body: string; appVersion?: string; images?: { mime: 'image/jpeg'; base64: string }[]; /** M23 US8: the phone's last errors (≤ 20 lines), only when the listener agreed. */ errors?: string[] }): Promise<{ id: string }>;
  /** M10b US2: your own comments with their text. */
  myComments(before?: string): Promise<{ items: MyComment[]; next?: string }>;
  /** M10b US8: the creator centre. `creatorVerify` answers 'taken' when someone else proved the feed first. */
  creatorClaims(): Promise<CreatorClaim[]>;
  creatorClaim(feedUrl: string): Promise<CreatorClaim>;
  creatorVerify(id: string): Promise<{ status: CreatorClaim['status'] } | 'taken'>;
  creatorStats(feedUrl: string): Promise<ShowStats>;
  /** M10: one Apple genre's top shows (the genre list itself is `src/discover/genres.ts`). */
  category(genreId: number, page?: number): Promise<CategoryShows>;
  nextUp(episodeId: string): Promise<{ items: NextUpItem[]; computedAt: string }>;
  // M6
  report(kind: ReportKind, targetId: string, reason: string, note?: string): Promise<{ id: string; duplicate: boolean; closed?: string }>;
  /** M21 US2: a wrong transcript line and the right words; it reaches the show's host in the Studio. */
  reportTranscript(r: { episodeId: string; offsetMs: number; original: string; suggested: string }): Promise<{ id: string; duplicate: boolean }>;
  block(listenerId: string): Promise<void>;
  unblock(listenerId: string): Promise<void>;
  hidden(): Promise<HiddenOut>;
  meta(): Promise<Meta>;
  // M11 — a creator's announcements, polls and display settings for a show; share events
  /** M21: `image` is the feed's show cover the page draws, `episodeImage` an episode page's own art (→ `episodeTint`). */
  showExtras(feedUrl: string, images?: { image?: string | undefined; episodeImage?: string | undefined }): Promise<ShowExtras>;
  /** M21 US5 (FR-041): who stands behind the show, for the Show info page. */
  showInfo(feedUrl: string): Promise<ShowInfo>;
  votePoll(pollId: string, optionIdx: number): Promise<ShowPoll>;
  recordShare(s: { targetKind: 'episode' | 'clip' | 'show'; targetId: string; feedUrl: string }): Promise<void>;
};

/** M11 (specs/011-m11-studio/contracts/studio-api.md, "App-facing"). */
export type ShowPoll = {
  id: string; question: string; episodeId: string | null; endsAt: string; closedAt: string | null; open: boolean;
  total: number; options: { idx: number; label: string; votes: number }[]; myVote?: number | null;
};
export type ShowExtras = {
  overrides: {
    title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null;
    milestoneMessage: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null;
    /** M14 US3: typed contacts, each checked by the server for its type. */
    contacts?: { type: string; value: string }[] | null;
  } | null;
  announcements: { id: string; body: string; createdAt: string; edited: boolean }[];
  polls: ShowPoll[];
  /**
   * M15 US4 (D3): the admin-made account that shares this external show — shown as
   * "Shared by <name>", never as its host (guard G-C1). Absent on an older server.
   */
  curator?: { id: string; displayName: string } | null;
  /** M14: the host switched tips on in the Studio (M20 US6: the Tip button shows only then). */
  tipsEnabled?: boolean;
  /** M21 US4/US5: the cover's average colour (`#rrggbb`), null while the server first works it out. Absent on an older server. */
  tint?: string | null;
  /** M21 US4: the episode art's colour, when `episodeImage` was sent. */
  episodeTint?: string | null;
  /** M21 US5: our own subscriber count (0 for a hidden feed). */
  subscribers?: number;
  /** M21 US5: the verified owner first, then invited hosts, with faces. */
  hosts?: { id: string; name: string; avatarUrl: string | null }[];
  /** M21 US5: the episodes the host marked in the Studio, in order. */
  hostPicks?: string[];
};

/** M21 US5: GET /v1/shows/info. */
export type ShowInfo = { ownerType: 'claimed' | 'studio' | 'feed'; ownerCountry: string | null; feedUrl: string; claimedAt: string | null };

export type ApiDeps = {
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => Promise<string | undefined>;
  timeoutMs?: number;
  /** M6 (FR-015): the server said this account is suspended — the app signs out locally and keeps the message. */
  onSuspended?: (message: string, appeals: string | undefined, appealToken?: string) => void;
};

/**
 * M22 US17: one listener for "the server is under maintenance" — any call answered 503 whose body
 * carries `maintenance` (or `error: 'maintenance'`). The start-up code (src/ui/shell/startupExtras.ts)
 * sets it to open app/maintenance.tsx; the call still fails with its ApiError as before.
 */
let maintenanceListener: ((body: Record<string, unknown>) => void) | undefined;
export function setMaintenanceListener(listener: ((body: Record<string, unknown>) => void) | undefined): void {
  maintenanceListener = listener;
}
/** True for a 503 body that names maintenance. */
export function isMaintenanceBody(status: number, body: unknown): body is Record<string, unknown> {
  if (status !== 503 || body === null || typeof body !== 'object') return false;
  const b = body as { maintenance?: unknown; error?: unknown };
  return b.maintenance !== undefined || b.error === 'maintenance';
}

/** The one way this app talks to the server: JSON in and out, the session token, a timeout, typed errors. */
export function requester(deps: ApiDeps) {
  const timeoutMs = deps.timeoutMs ?? 10_000;
  async function send<T>(method: string, path: string, init: { body?: BodyInit; headers: Record<string, string> }, waitMs: number): Promise<{ status: number; headers: Headers; json: T }> {
    const token = await deps.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), waitMs);
    let res: Response;
    let text: string;
    try {
      res = await deps.fetch(deps.baseUrl + path, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
        body: init.body,
        signal: controller.signal,
      });
      // M23 US9: the timeout covers the answer's body too — a stalled body no longer hangs the call.
      text = res.status === 304 ? '' : await res.text();
    } catch (e) {
      throw new ApiError('network', "Couldn't reach the server.", 0, { cause: String(e) });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304) return { status: 304, headers: res.headers, json: undefined as T };
    let json: unknown = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body: handled below */ }
    if (!res.ok) {
      if (isMaintenanceBody(res.status, json)) maintenanceListener?.(json);
      const err = (json ?? {}) as { error?: string; message?: string } & Record<string, unknown>;
      const { error, message, ...extra } = err;
      // M24 US6: the refusal may carry `appealToken`, which lets the Appeal page work without a session.
      if (error === 'suspended') deps.onSuspended?.(message ?? 'This account is suspended.', typeof extra['appeals'] === 'string' ? (extra['appeals'] as string) : undefined, typeof extra['appealToken'] === 'string' ? (extra['appealToken'] as string) : undefined);
      throw new ApiError((error as ErrorCode) ?? 'internal', message ?? `Server answered ${res.status}.`, res.status, extra);
    }
    return { status: res.status, headers: res.headers, json: json as T };
  }
  function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; headers: Headers; json: T }> {
    return send<T>(method, path, {
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    }, timeoutMs);
  }
  /**
   * M23 US9 (FR-014): a raw upload (a recording or a picture) through the same path as JSON — the
   * session token, a timeout (60 s by default: uploads are bigger), typed errors, and the
   * suspended / maintenance handling the hand-written uploads used to skip.
   */
  call.raw = function raw<T>(method: string, path: string, body: Blob, headers: Record<string, string>, waitMs = UPLOAD_TIMEOUT_MS): Promise<{ status: number; headers: Headers; json: T }> {
    return send<T>(method, path, { body, headers }, waitMs);
  };
  return call;
}

/** M23 US9: how long an upload may take before it fails as "Couldn't reach the server". */
export const UPLOAD_TIMEOUT_MS = 60_000;

export function createApi(deps: ApiDeps): ApiClient {
  const call = requester(deps);
  return {
    signUp: async (email, password, displayName) => (await call<{ token: string; listener: Listener }>('POST', '/v1/auth/sign-up', { email, password, displayName })).json,
    signIn: async (email, password, deviceLabel) => (await call<{ token: string; listener: Listener }>('POST', '/v1/auth/sign-in', { email, password, deviceLabel })).json,
    signOut: async () => { await call('POST', '/v1/auth/sign-out'); },
    requestCode: async (email) => (await call<{ sent: true; resendAfterSeconds: number }>('POST', '/v1/auth/code', { email })).json,
    verifyCode: async (email, code, displayName) => (await call<{ token: string; listener: Listener } | { needsName: true }>('POST', '/v1/auth/code/verify', { email, code, ...(displayName ? { displayName } : {}) })).json,
    deleteMeWithCode: async (code) => { await call('DELETE', '/v1/me', { code }); },
    me: async () => (await call<{ listener: Listener }>('GET', '/v1/me')).json.listener,
    deleteMe: async (password) => { await call('DELETE', '/v1/me', { password }); },
    registerEpisode: async (id, e) => { await call('PUT', `/v1/episodes/${id}`, e); },
    social: async (episodeId, ifNoneMatch) => {
      const r = await call<Social>('GET', `/v1/episodes/${episodeId}/social`, undefined, ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {});
      if (r.status === 304) return { status: 304 };
      const etag = r.headers.get('etag') ?? undefined;
      return { status: 200, ...(etag ? { etag } : {}), body: r.json };
    },
    postComment: async (episodeId, c) => (await call<{ comment: Comment }>('POST', `/v1/episodes/${episodeId}/comments`, c)).json.comment,
    deleteComment: async (id) => (await call<{ placeholder: boolean }>('DELETE', `/v1/comments/${id}`)).json,
    react: async (episodeId, offsetMs, durationMs) => (await call<{ reacted: boolean; bucket: number }>('PUT', `/v1/episodes/${episodeId}/reactions`, { offsetMs, durationMs })).json,
    putPositions: async (deviceId, observations) => (await call<{ positions: PositionRowOut[] }>('PUT', '/v1/me/positions', { deviceId, observations })).json.positions,
    getPositions: async (since) => (await call<{ positions: PositionRowOut[]; serverTime: string }>('GET', `/v1/me/positions${since ? `?since=${encodeURIComponent(since)}` : ''}`)).json,
    // M4
    postClip: async (episodeId, c) => (await call<{ clip: Clip }>('POST', `/v1/episodes/${episodeId}/clips`, c)).json.clip,
    getClip: async (id) => (await call<{ clip: Clip; episode: EpisodeRecord }>('GET', `/v1/clips/${id}`)).json,
    deleteClip: async (id) => { await call('DELETE', `/v1/clips/${id}`); },
    episodeClips: async (episodeId, before) => (await call<{ clips: Clip[]; next?: string }>('GET', `/v1/episodes/${episodeId}/clips${before ? `?before=${encodeURIComponent(before)}` : ''}`)).json,
    follow: async (id) => { await call('PUT', `/v1/listeners/${id}/follow`); },
    unfollow: async (id) => { await call('DELETE', `/v1/listeners/${id}/follow`); },
    profile: async (id) => (await call<{ profile: Profile }>('GET', `/v1/listeners/${id}`)).json.profile,
    followers: async (id, before) => (await call<{ listeners: ClipAuthor[]; next?: string }>('GET', `/v1/listeners/${id}/followers${before ? `?before=${encodeURIComponent(before)}` : ''}`)).json,
    following: async (id, before) => (await call<{ listeners: ClipAuthor[]; next?: string }>('GET', `/v1/listeners/${id}/following${before ? `?before=${encodeURIComponent(before)}` : ''}`)).json,
    setPrivacy: async (privateListening) => (await call<{ privateListening: boolean }>('PUT', '/v1/me/privacy', { privateListening })).json,
    getSubscriptions: async () => (await call<{ items: SubscriptionOut[]; serverTime: string }>('GET', '/v1/me/subscriptions')).json,
    putSubscriptions: async (items) => (await call<{ items: SubscriptionOut[]; serverTime: string }>('PUT', '/v1/me/subscriptions', { items })).json,
    forYou: async (ifNoneMatch) => {
      const r = await call<ForYou>('GET', '/v1/for-you', undefined, ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {});
      if (r.status === 304) return { status: 304 };
      const etag = r.headers.get('etag') ?? undefined;
      return { status: 200, ...(etag ? { etag } : {}), body: r.json };
    },
    postRecEvents: async (events) => { await call('POST', '/v1/me/rec-events', { events }); },
    feed: async (before, ifNoneMatch) => {
      const r = await call<{ items: FeedItem[]; next?: string; serverTime: string }>('GET', `/v1/me/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`, undefined, ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {});
      if (r.status === 304) return { status: 304 };
      const etag = r.headers.get('etag') ?? undefined;
      return { status: 200, ...(etag ? { etag } : {}), body: r.json };
    },
    putListened: async (deviceId, days) => (await call<{ accepted: number }>('PUT', '/v1/me/listened', { deviceId, days })).json,
    // M5
    discover: async (ifNoneMatch) => {
      const r = await call<Discover>('GET', '/v1/discover', undefined, ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {});
      if (r.status === 304) return { status: 304 };
      const etag = r.headers.get('etag') ?? undefined;
      return { status: 200, ...(etag ? { etag } : {}), body: r.json };
    },
    search: async (q) => (await call<SearchResult>('GET', `/v1/search?q=${encodeURIComponent(q)}`)).json,
    searchPeople: async (q) => (await call<{ listeners: { id: string; displayName: string }[] }>('GET', `/v1/search/people?q=${encodeURIComponent(q)}`)).json.listeners,
    pushTokenAdd: async (token, platform) => { await call('POST', '/v1/me/push-tokens', { token, platform }); },
    pushTokenRemove: async (token) => { await call('DELETE', `/v1/me/push-tokens/${encodeURIComponent(token)}`); },
    pushPrefs: async (p) => { await call('PUT', '/v1/me/push-prefs', p); },
    sendFeedback: async (f) => (await call<{ id: string }>('POST', '/v1/feedback', f)).json,
    libraryPut: async (items) => (await call<{ items: LibraryItem[] }>('PUT', '/v1/me/library', { items })).json,
    myComments: async (before) => (await call<{ items: MyComment[]; next?: string }>('GET', `/v1/me/comments${before ? `?before=${encodeURIComponent(before)}` : ''}`)).json,
    showExtras: async (feedUrl, images) => {
      const extra = [['image', images?.image], ['episodeImage', images?.episodeImage]].filter((p): p is [string, string] => typeof p[1] === 'string' && p[1] !== '')
        .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
      return (await call<ShowExtras>('GET', `/v1/shows/extras?feedUrl=${encodeURIComponent(feedUrl)}${extra}`)).json;
    },
    showInfo: async (feedUrl) => (await call<ShowInfo>('GET', `/v1/shows/info?feedUrl=${encodeURIComponent(feedUrl)}`)).json,
    votePoll: async (pollId, optionIdx) => (await call<{ poll: ShowPoll }>('POST', `/v1/polls/${pollId}/vote`, { optionIdx })).json.poll,
    recordShare: async (s) => { await call('POST', '/v1/shares', s); },
    creatorClaims: async () => (await call<{ claims: CreatorClaim[] }>('GET', '/v1/creator/claims')).json.claims,
    creatorClaim: async (feedUrl) => (await call<CreatorClaim>('POST', '/v1/creator/claims', { feedUrl })).json,
    creatorVerify: async (id) => {
      try { return (await call<{ status: CreatorClaim['status'] }>('POST', `/v1/creator/claims/${encodeURIComponent(id)}/verify`)).json; }
      catch (e) { if (e instanceof ApiError && e.status === 409) return 'taken'; throw e; }
    },
    creatorStats: async (feedUrl) => (await call<ShowStats>('GET', `/v1/creator/shows/stats?feedUrl=${encodeURIComponent(feedUrl)}`)).json,
    category: async (genreId, page) => (await call<CategoryShows>('GET', `/v1/categories/${genreId}${page ? `?page=${page}` : ''}`)).json,
    nextUp: async (episodeId) => (await call<{ items: NextUpItem[]; computedAt: string }>('GET', `/v1/episodes/${episodeId}/next-up`)).json,
    // M6
    report: async (kind, targetId, reason, note) => (await call<{ id: string; duplicate: boolean; closed?: string }>('POST', '/v1/reports', { targetKind: kind, targetId, reason, ...(note ? { note } : {}) })).json,
    reportTranscript: async (r) => (await call<{ id: string; duplicate: boolean }>('POST', '/v1/reports', { targetKind: 'transcript', targetId: `${r.episodeId}#${r.offsetMs}`, reason: 'other', detail: { offsetMs: r.offsetMs, original: r.original, suggested: r.suggested } })).json,
    block: async (listenerId) => { await call('POST', '/v1/me/blocks', { listenerId }); },
    unblock: async (listenerId) => { await call('DELETE', `/v1/me/blocks/${listenerId}`); },
    hidden: async () => (await call<HiddenOut>('GET', '/v1/me/hidden')).json,
    meta: async () => (await call<Meta>('GET', '/v1/meta')).json,
  };
}
