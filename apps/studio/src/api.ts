// Sends every Studio request to the server and handles sign-in and errors.
/**
 * Every request the Studio makes. The browser only ever talks to its own host: `/api/*` is
 * rewritten to the API (research R1), so the session cookie is first-party.
 *
 * Fallback (R1, NOT VERIFIED until quickstart B1): if the proxy drops `Set-Cookie`, sign-in
 * notices the cookie did not stick and keeps the token in `sessionStorage` for this tab,
 * sending it as a Bearer header instead.
 */
const BASE = '/api';
/** The API's own address, for public pages a listener opens without the Studio (the show card). */
export const PUBLIC_API = 'https://socialmorning-api.vercel.app';
const BEARER_KEY = 'sm_studio_bearer';

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export const bearer = {
  get: (): string | null => storage()?.getItem(BEARER_KEY) ?? null,
  set: (t: string | null) => {
    const s = storage();
    if (!s) return;
    if (t) s.setItem(BEARER_KEY, t);
    else s.removeItem(BEARER_KEY);
  },
};

let onSignedOut: (() => void) | null = null;
export const whenSignedOut = (fn: () => void) => { onSignedOut = fn; };

/** M23 T042: signing out in one tab signs out every open Studio tab (they hear the `storage` event). */
export const SIGNED_OUT_KEY = 'sm_studio_signed_out';
export function tellOtherTabs(): void {
  try { localStorage.setItem(SIGNED_OUT_KEY, String(Date.now())); } catch { /* storage blocked: this tab only */ }
}

/**
 * M15 T010: an Admin session older than 12 h answers 401 `reauth`. The page says
 * "Sign in again to use Admin" and goes to `/sign-in?next=` (the Admin layout sets the handler).
 */
export const REAUTH_MESSAGE = 'Sign in again to use Admin';
let onReauth: (() => void) | null = null;
export const whenReauth = (fn: (() => void) | null) => { onReauth = fn; };
export const reauthPath = (next: string) => `/sign-in?reason=reauth&next=${encodeURIComponent(next)}`;

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const token = opts.token ?? bearer.get();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-studio'] = '1';
  if (token) headers['authorization'] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, credentials: 'same-origin', ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  } catch {
    throw new HttpError(0, 'offline', 'Could not reach SocialMorning. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/v1/studio') && !opts.token) onSignedOut?.();
    if (res.status === 401 && path.startsWith('/v1/admin')) {
      if (data.error === 'reauth') {
        if (onReauth) onReauth();
        else if (typeof window !== 'undefined') window.location.assign(reauthPath(window.location.pathname));
      } else onSignedOut?.();
    }
    throw new HttpError(res.status, data.error ?? 'error', data.message ?? 'Something went wrong.');
  }
  return data as T;
}

export type Me = { id: string; email: string; displayName: string };
/** M15: who an admin is acting as, if anyone (display only — the server decides everything). */
export type ActingAs = { id: string; displayName: string } | null;
export type StudioMe = { me: Me; shows: Show[]; isAdmin?: boolean; actingAs?: ActingAs };
export type Show = { key: string; feedUrl: string; title: string | null; image: string | null; role: 'owner' | 'operator'; hosted?: boolean };

/**
 * Sign in the way the whole product does (`/v1/auth`, labelled `studio-web`), then trade the
 * token for the Studio's cookie. Returns who and which shows.
 */
export async function startSession(token: string): Promise<StudioMe> {
  const s = await api<StudioMe>('/v1/studio/session', { method: 'POST', token });
  bearer.set(null);
  try {
    await api('/v1/studio/me', { token: '' });
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) bearer.set(token); // the cookie did not stick
    else throw e;
  }
  return s;
}

/** Downloads a CSV through `api`'s auth (cookie or the Bearer fallback), then saves it. */
export async function downloadCsv(path: string, fallbackName: string): Promise<void> {
  const token = bearer.get();
  const res = await fetch(BASE + path, { credentials: 'same-origin', ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) });
  if (res.status === 401) { onSignedOut?.(); throw new HttpError(401, 'unauthorized', 'You were signed out. Sign in again to export.'); }
  if (!res.ok) throw new HttpError(res.status, 'export', 'The export did not work. Try again.');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
