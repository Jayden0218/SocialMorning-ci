// Server calls for appeals: what I may appeal, and sending one appeal — with a session or the suspension's token.
/**
 * M24 US6 (apps/api/src/routes/safety/appeals.ts):
 *  - GET  /v1/appeals → { items: Appealable[] }
 *  - POST /v1/appeals { actionId, text } → 201 { id } · 404 nothing to appeal · 409 sent already
 * Signed in, the session is enough. Suspended, the phone has forgotten its session, so the call
 * carries `x-appeal-token` — the token the `suspended` answer gave (saved by src/social/context.tsx).
 * In its own client like notifications-api.ts, so the fakes of `ApiClient` need no new methods.
 */
import { useMemo } from 'react';
import { requester, type ApiDeps } from './api';
import { apiBaseUrl } from './base-url';
import { secureToken } from './token';

export const APPEAL_TEXT_MAX = 1000;

export type AppealState = 'open' | 'accepted' | 'rejected';
export type Appealable = { actionId: string; action: 'remove' | 'suspend'; what: string; at: string; appeal: { id: string; state: AppealState; createdAt: string } | null };

/** The server's list → rows; anything malformed is dropped. */
export function parseAppealable(body: unknown): Appealable[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: Appealable[] = [];
  for (const raw of items) {
    const a = raw as { actionId?: unknown; action?: unknown; what?: unknown; at?: unknown; appeal?: unknown } | null;
    if (!a || typeof a.actionId !== 'string' || (a.action !== 'remove' && a.action !== 'suspend') || typeof a.what !== 'string' || typeof a.at !== 'string') continue;
    const ap = a.appeal as { id?: unknown; state?: unknown; createdAt?: unknown } | null | undefined;
    const appeal = ap && typeof ap.id === 'string' && (ap.state === 'open' || ap.state === 'accepted' || ap.state === 'rejected') && typeof ap.createdAt === 'string'
      ? { id: ap.id, state: ap.state, createdAt: ap.createdAt } : null;
    out.push({ actionId: a.actionId, action: a.action, what: a.what, at: a.at, appeal });
  }
  return out;
}

/** What a row says under its title: the appeal's state, or that it can still be sent. */
export function appealLine(a: Pick<Appealable, 'appeal'>): string {
  if (!a.appeal) return 'You can appeal this once.';
  if (a.appeal.state === 'open') return 'Appeal sent. We will tell you what we decide.';
  return a.appeal.state === 'accepted' ? 'Appeal accepted.' : 'Appeal not accepted.';
}

export type AppealsApi = ReturnType<typeof createAppealsApi>;

/** `appealToken()` is read on every call: the session wins when there is one, the token covers a suspended account. */
export function createAppealsApi(deps: ApiDeps & { appealToken: () => string | undefined }) {
  const call = requester(deps);
  const headers = (): Record<string, string> => {
    const t = deps.appealToken();
    return t ? { 'x-appeal-token': t } : {};
  };
  return {
    list: async (): Promise<Appealable[]> => parseAppealable((await call<unknown>('GET', '/v1/appeals', undefined, headers())).json),
    send: async (actionId: string, text: string): Promise<void> => { await call('POST', '/v1/appeals', { actionId, text: text.trim().slice(0, APPEAL_TEXT_MAX) }, headers()); },
  };
}

export function useAppealsApi(appealToken: () => string | undefined): AppealsApi {
  return useMemo(() => createAppealsApi({ baseUrl: apiBaseUrl(), fetch, getToken: secureToken.get, appealToken }), [appealToken]);
}
