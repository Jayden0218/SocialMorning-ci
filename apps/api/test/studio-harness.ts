/**
 * M11 — helpers for the Studio's tests: sign in the way the Studio does (auth with
 * `deviceLabel: 'studio-web'`, then trade the token for the cookie), prove a claim, and seed a
 * show with known numbers.
 */
import { signUp, type TestDb } from './harness.ts';
import { showKey } from '../src/db/repos/studio-roles.ts';

export type StudioUser = { id: string; cookie: string; token: string };

export async function studioLogin(t: TestDb, email: string, name: string, password = 'correct horse'): Promise<StudioUser> {
  const { id } = await signUp(t, email, name, password);
  const signIn = await t.call('POST', '/v1/auth/sign-in', { email, password, deviceLabel: 'studio-web' });
  if (signIn.status !== 200) throw new Error(`studio sign-in failed: ${signIn.status}`);
  const { token } = (await signIn.json()) as { token: string };
  const res = await t.call('POST', '/v1/studio/session', undefined, token, { 'x-studio': '1' });
  if (res.status !== 200) throw new Error(`studio session failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  return { id, cookie, token };
}

/** A Studio request as the browser makes it: the cookie, and `X-Studio: 1` on writes. */
export function sCall(t: TestDb, method: string, path: string, who?: StudioUser, body?: unknown, extra: Record<string, string> = {}) {
  return t.call(method, path, body, undefined, {
    ...(who ? { cookie: who.cookie } : {}),
    ...(method === 'GET' ? {} : { 'x-studio': '1' }),
    ...extra,
  });
}

export async function proveClaim(t: TestDb, listenerId: string, feedUrl: string, provenAt = new Date().toISOString()) {
  await t.q(
    "INSERT INTO creator_claims (listener_id, feed_url, code, status, proven_at) VALUES ($1, $2, $3, 'proven', $4)",
    [listenerId, feedUrl, `socialnet-verify-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`, provenAt],
  );
  return showKey(feedUrl);
}

export async function addEpisode(t: TestDb, feedUrl: string, id: string, title: string, durationMs: number | null, publishedAt: string | null = null) {
  await t.q(
    'INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, duration_ms, published_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, feedUrl, id, title, 'The Show', `https://cdn.example.com/${id}.mp3`, durationMs, publishedAt],
  );
}

/** YYYY-MM-DD, `n` days before today in UTC. */
export function day(n = 0): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
export const noon = (n = 0) => `${day(n)}T12:00:00Z`;
