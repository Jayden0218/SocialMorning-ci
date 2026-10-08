// Server calls for Interactions (replies, likes, mentions, follows), and where each notice opens.
/**
 * M21 US10 (specs/022-m21-the-xiaoyuzhou-gaps/contracts/api.md, "Notifications"):
 *  - GET /v1/me/notifications?cursor= → { items: { id, kind, actor, ref, createdAt, unread }[], next }
 *  - POST /v1/me/notifications/seen → 204
 * In its own client like comment-extras-api.ts, so the test fakes of `ApiClient` need no new
 * methods. The pure helpers say what a row reads and where it opens, so they are tested alone.
 *
 * System notices (M24 US3): GET /v1/me/notifications/system → { items } — written in Admin, or
 * sent by the server to one listener ("your comment was removed"). `systemAction` is the rule a
 * system card's one button follows — only a path inside the app (it starts with "/", no scheme,
 * no "//"), never a web address.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export type NoticeKind = 'reply' | 'like' | 'mention' | 'follow';
export type Notice = {
  id: string;
  kind: NoticeKind;
  actor: { id: string; name: string; avatarUrl: string | null };
  ref: { commentId?: string; parentId?: string; episodeId?: string; excerpt?: string; episodeTitle?: string };
  createdAt: string;
  unread: boolean;
};
export type NoticePage = { items: Notice[]; next: string | null };

/** What a row says after the actor's name. */
export function noticeVerb(kind: NoticeKind): string {
  if (kind === 'reply') return 'replied to your comment';
  if (kind === 'like') return 'liked your comment';
  if (kind === 'mention') return 'mentioned you';
  return 'started following you';
}

export type NoticeTarget =
  | { pathname: '/comments/thread/[commentId]'; params: { commentId: string } }
  | { pathname: '/profile/[id]'; params: { id: string } }
  | { pathname: '/episode/[id]'; params: { id: string } };

/**
 * Where a row opens: a follow → the follower's profile; a reply, like or mention → the thread
 * the comment is in (its parent's when it is a reply); with no comment, the episode; else the
 * actor's profile.
 */
export function noticeTarget(n: Pick<Notice, 'kind' | 'actor' | 'ref'>): NoticeTarget {
  if (n.kind !== 'follow') {
    const thread = n.ref.parentId ?? n.ref.commentId;
    if (thread) return { pathname: '/comments/thread/[commentId]', params: { commentId: thread } };
    if (n.ref.episodeId) return { pathname: '/episode/[id]', params: { id: n.ref.episodeId } };
  }
  return { pathname: '/profile/[id]', params: { id: n.actor.id } };
}

/** A system card's one button: `{ label, route }` from the notice's payload. */
export type SystemAction = { label: string; route: string };
export type SystemNotice = { id: string; title: string; body: string; createdAt: string; action?: SystemAction };

/** The button's route when it is a path inside the app; anything else (a web address, "//x") → undefined. */
export function systemAction(payload: unknown): SystemAction | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as { label?: unknown; route?: unknown };
  if (typeof p.label !== 'string' || p.label.trim() === '' || typeof p.route !== 'string') return undefined;
  const route = p.route.trim();
  if (!route.startsWith('/') || route.startsWith('//') || /[\s\\]/.test(route) || route.includes(':')) return undefined;
  return { label: p.label.trim().slice(0, 40), route };
}

/** M24 US3: the server's list → cards; a row missing its id, title, body or time is dropped, the button checked by `systemAction`. */
export function parseSystemNotices(body: unknown): SystemNotice[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: SystemNotice[] = [];
  for (const raw of items) {
    const n = raw as { id?: unknown; title?: unknown; body?: unknown; createdAt?: unknown; action?: unknown } | null;
    if (!n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.body !== 'string' || typeof n.createdAt !== 'string') continue;
    const action = systemAction(n.action);
    out.push({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, ...(action ? { action } : {}) });
  }
  return out;
}

export type NotificationsApi = ReturnType<typeof createNotificationsApi>;

export function createNotificationsApi(deps: ApiDeps) {
  const call = requester(deps);
  return {
    list: async (cursor?: string): Promise<NoticePage> => {
      const j = (await call<Partial<NoticePage>>('GET', `/v1/me/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)).json;
      return { items: Array.isArray(j.items) ? j.items : [], next: typeof j.next === 'string' ? j.next : null };
    },
    markSeen: async () => { await call('POST', '/v1/me/notifications/seen'); },
    system: async (): Promise<SystemNotice[]> => parseSystemNotices((await call<unknown>('GET', '/v1/me/notifications/system')).json),
  };
}

export function useNotificationsApi(): NotificationsApi {
  return useMemo(() => createNotificationsApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get }), []);
}
