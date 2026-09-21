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
  | 'duration_unknown' | 'reply_depth' | 'internal' | 'network';

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

export type Listener = { id: string; email: string; displayName: string; createdAt: string };
export type EpisodeRegistration = {
  feedUrl: string; guid: string; title: string; showTitle?: string; enclosureUrl: string; imageUrl?: string; durationMs?: number;
};
export type Comment = {
  id: string; authorId: string | null; displayName: string | null; body: string | null; offsetMs: number | null;
  parentId: string | null; createdAt: string; deleted: boolean; mine?: boolean; replies?: Comment[];
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
};

export type ApiDeps = {
  baseUrl: string;
  fetch: typeof fetch;
  getToken: () => Promise<string | undefined>;
  timeoutMs?: number;
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
  };
}
