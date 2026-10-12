// Test helpers for Studio tests: Studio sign-in, proven claims, seeded shows.
/**
 * M11 — helpers for the Studio's tests: sign in the way the Studio does (auth with
 * `deviceLabel: 'studio-web'`, then trade the token for the cookie), prove a claim, and seed a
 * show with known numbers.
 */
import { signUp, type TestDb } from './harness.ts';
import { showKey } from '../src/db/repos/studio/studio-roles.ts';

export type StudioUser = { id: string; cookie: string; token: string };

export async function studioLogin(t: TestDb, email: string, name: string, password = 'correct horse'): Promise<StudioUser> {
  const { id } = await signUp(t, email, name, password);
  const signIn = await t.call('POST', '/v1/auth/sign-in', { email, password, deviceLabel: 'studio-web' });
  if (signIn.status !== 200) throw new Error(`studio sign-in failed: ${signIn.status}`);
  const { token } = (await signIn.json()) as { token: string };
  const res = await t.call('POST', '/v1/studio/session', undefined, token, { 'x-studio': '1' });
  if (res.status !== 200) throw new Error(`studio session failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  // M25 SB: Admin also needs the emailed second factor. Every older test is about what comes after
  // it, so this session counts as having passed; test/m25-sb.test.ts checks the code itself.
  await (await import('./ac-neutral.ts')).studioFactor(t, id, true);
  return { id, cookie, token };
}

/** M25 SB: a Studio sign-in that has NOT passed the second factor (for the tests of it). */
export async function studioLoginNoFactor(t: TestDb, email: string, name: string): Promise<StudioUser> {
  const u = await studioLogin(t, email, name);
  await (await import('./ac-neutral.ts')).studioFactor(t, u.id, false);
  return u;
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
  // The claim is lane ST's items (test/fixtures.ts proveClaimItem).
  await (await import('./fixtures.ts')).proveClaimItem(t.store, listenerId, feedUrl, new Date(provenAt).toISOString());
  return showKey(feedUrl);
}

export async function addEpisode(t: TestDb, feedUrl: string, id: string, title: string, durationMs: number | null, publishedAt: string | null = null) {
  // The episode is lane LB's item, and the show's counters are touched as the feed refresh would.
  const { episodeItem } = await import('./fixtures.ts');
  await episodeItem(t.store, { id, feedUrl, title, durationMs, publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null });
  const { touchShow, episodeRow } = await import('../src/db/repos/library/ddb/episodes.ts');
  const { get } = await import('../src/db/ddb/store.ts');
  const K = await import('../src/db/ddb/keys.ts');
  await touchShow(t.store, episodeRow((await get(t.store, 'main', K.episode(id)))!));
}

/** YYYY-MM-DD, `n` days before today in UTC. */
export function day(n = 0): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
export const noon = (n = 0) => `${day(n)}T12:00:00Z`;
