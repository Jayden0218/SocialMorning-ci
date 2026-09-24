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
  | 'suspended' | 'blocked' | 'removed';

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

export type Listener = { id: string; email: string; displayName: string; createdAt: string; privateListening?: boolean };
export type EpisodeRegistration = {
  feedUrl: string; guid: string; title: string; showTitle?: string; enclosureUrl: string; imageUrl?: string; durationMs?: number;
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
export type ClipAuthor = { id: string; displayName: string | null };
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
};
export type FeedResult = { status: 200; etag?: string; body: { items: FeedItem[]; next?: string; serverTime: string } } | { status: 304 };
export type ListenedDay = { episodeId: string; day: string; ranges: [number, number][] };

// ---- M5 (specs/005-m5-discovery/contracts/api.md) ----
export type EpisodeCard = { id: string; feedUrl: string; guid: string; title: string; showTitle: string; imageUrl?: string; durationMs?: number; publishedAt?: string; enclosureUrl: string };
export type DiscoverItem = { kind: 'pick' | 'talkedAbout' | 'trending'; key: string; episode: EpisodeCard; why?: string; reason?: string; score?: number; date?: string };
export type Discover = { date?: string; picks: DiscoverItem[]; talkedAbout: DiscoverItem[]; trending: DiscoverItem[]; stale: boolean; serverTime: string };
export type DiscoverResult = { status: 200; etag?: string; body: Discover } | { status: 304 };
export type ShowCard = { appleId?: number; feedUrl: string; title: string; author: string; imageUrl?: string; genres: string[] };
export type SearchResult = { shows: ShowCard[]; episodes: EpisodeCard[]; episodeSearch: 'ok' | 'unavailable'; source: { shows: 'apple' } };
export type NextUpItem = { episode: EpisodeCard; reason: 'alsoListened' | 'talkedAboutOnShow' | 'newOnShow' | 'trendingInCategory'; label: string };

// ---- M6 (specs/006-m6-fit-to-ship/contracts/api.md) ----
export type ReportKind = 'comment' | 'clip' | 'profile' | 'show';
export type HiddenOut = { reported: { kind: ReportKind; id: string }[]; blocked: { id: string; displayName: string }[]; hiddenFeeds: string[] };
export type Meta = { appealsEmail?: string };

export type ApiClient = {
  signUp(email: string, password: string, displayName: string): Promise<{ token: string; listener: Listener }>;
  signIn(email: string, password: string, deviceLabel?: string): Promise<{ token: string; listener: Listener }>;
  signOut(): Promise<void>;
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
  feed(before?: string, ifNoneMatch?: string): Promise<FeedResult>;
  putListened(deviceId: string, days: ListenedDay[]): Promise<{ accepted: number }>;
  // M5
  discover(ifNoneMatch?: string): Promise<DiscoverResult>;
  search(q: string): Promise<SearchResult>;
  nextUp(episodeId: string): Promise<{ items: NextUpItem[]; computedAt: string }>;
  // M6
  report(kind: ReportKind, targetId: string, reason: string, note?: string): Promise<{ id: string; duplicate: boolean; closed?: string }>;
  block(listenerId: string): Promise<void>;
  unblock(listenerId: string): Promise<void>;
  hidden(): Promise<HiddenOut>;
  meta(): Promise<Meta>;
};

export type ApiDeps = {
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => Promise<string | undefined>;
  timeoutMs?: number;
  /** M6 (FR-015): the server said this account is suspended — the app signs out locally and keeps the message. */
  onSuspended?: (message: string, appeals: string | undefined) => void;
};

export function createApi(deps: ApiDeps): ApiClient {
  const timeoutMs = deps.timeoutMs ?? 10_000;

  async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; headers: Headers; json: T }> {
    const token = await deps.getToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await deps.fetch(deps.baseUrl + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      throw new ApiError('network', "Couldn't reach the server.", 0, { cause: String(e) });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304) return { status: 304, headers: res.headers, json: undefined as T };
    const text = await res.text();
    let json: unknown = undefined;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON body: handled below */ }
    if (!res.ok) {
      const err = (json ?? {}) as { error?: string; message?: string } & Record<string, unknown>;
      const { error, message, ...extra } = err;
      if (error === 'suspended') deps.onSuspended?.(message ?? 'This account is suspended.', typeof extra['appeals'] === 'string' ? (extra['appeals'] as string) : undefined);
      throw new ApiError((error as ErrorCode) ?? 'internal', message ?? `Server answered ${res.status}.`, res.status, extra);
    }
    return { status: res.status, headers: res.headers, json: json as T };
  }

  return {
    signUp: async (email, password, displayName) => (await call<{ token: string; listener: Listener }>('POST', '/v1/auth/sign-up', { email, password, displayName })).json,
    signIn: async (email, password, deviceLabel) => (await call<{ token: string; listener: Listener }>('POST', '/v1/auth/sign-in', { email, password, deviceLabel })).json,
    signOut: async () => { await call('POST', '/v1/auth/sign-out'); },
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
    nextUp: async (episodeId) => (await call<{ items: NextUpItem[]; computedAt: string }>('GET', `/v1/episodes/${episodeId}/next-up`)).json,
    // M6
    report: async (kind, targetId, reason, note) => (await call<{ id: string; duplicate: boolean; closed?: string }>('POST', '/v1/reports', { targetKind: kind, targetId, reason, ...(note ? { note } : {}) })).json,
    block: async (listenerId) => { await call('POST', '/v1/me/blocks', { listenerId }); },
    unblock: async (listenerId) => { await call('DELETE', `/v1/me/blocks/${listenerId}`); },
    hidden: async () => (await call<HiddenOut>('GET', '/v1/me/hidden')).json,
    meta: async () => (await call<Meta>('GET', '/v1/meta')).json,
  };
}
