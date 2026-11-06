// Spec 039 Q5 (owner, 2026-11-06): Me's following/followers counts and the profile page share ONE profile request.
/**
 * Written BEFORE the change (red): Me asks for the profile (counts), then "View profile" asks again; both go through `api.profile`, so the
 * second must be answered from the first (one GET). A refresh is still real: a follow or unfollow, an edit of the profile, a sign-in or
 * out, an answer older than `PROFILE_TTL_MS`, and a failure (never kept) each send a new request. Break to watch red: drop the cache
 * lookup in `api.profile` and the first test counts two GETs.
 */
import { createApi } from '@/social/api';
import { forgetProfiles, PROFILE_TTL_MS } from '@/social/profile-cache';

const PROFILE = { id: 'me', displayName: 'Mei', following: 3, followers: 5 };
function setup(now = { t: 1_000 }) {
  let gets = 0;
  let fail = false;
  const f = (async (url: string, init: RequestInit) => {
    if ((init.method ?? 'GET') === 'GET' && String(url).endsWith('/v1/listeners/me')) {
      gets += 1;
      if (fail) return new Response('{"error":"x","message":"x"}', { status: 500, headers: { 'content-type': 'application/json' } });
      await Promise.resolve();
      return new Response(JSON.stringify({ profile: PROFILE }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const api = createApi({ baseUrl: 'https://api', fetch: f, getToken: async () => 'tok', now: () => now.t } as never);
  return { api, gets: () => gets, now, failNext: (v: boolean) => { fail = v; } };
}

describe('one profile request for Me and the profile page', () => {
  it('Me, then the profile page right after: one request (also while the first is still in flight)', async () => {
    const s = setup();
    const meCounts = s.api.profile('me'); // Me's counts
    const page = s.api.profile('me'); // "View profile" before the first answered
    expect((await meCounts).following).toBe(3);
    expect((await page).followers).toBe(5);
    s.now.t += 2_000;
    await s.api.profile('me'); // and once more, after it answered
    expect(s.gets()).toBe(1);
  });

  it('asks again once the answer is older than the time to live', async () => {
    const s = setup();
    await s.api.profile('me');
    s.now.t += PROFILE_TTL_MS + 1;
    await s.api.profile('me');
    expect(s.gets()).toBe(2);
  });

  it('asks again after a follow, an unfollow or an edit of the profile', async () => {
    const s = setup();
    await s.api.profile('me');
    await s.api.follow('other');
    await s.api.profile('me');
    expect(s.gets()).toBe(2);
    await s.api.unfollow('other');
    await s.api.profile('me');
    expect(s.gets()).toBe(3);
    forgetProfiles(); // what an edit (profile-api update, avatar) calls
    await s.api.profile('me');
    expect(s.gets()).toBe(4);
  });

  it('never keeps a failure', async () => {
    const s = setup();
    s.failNext(true);
    await expect(s.api.profile('me')).rejects.toBeDefined();
    s.failNext(false);
    expect((await s.api.profile('me')).followers).toBe(5);
    expect(s.gets()).toBe(2);
  });
});
