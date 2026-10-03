// Tests subscriber stats and that muted listeners cannot comment on that show.
/**
 * M11 US4 — subscribers and mutes (FR-017..FR-019, FR-031).
 *
 * Guard G-M1: a muted listener cannot comment on that show and only that show. The break that
 * turns it red: remove the `isMutedOn` check from `src/routes/social/comments.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { proveClaim, sCall, studioLogin } from './studio-harness.ts';

const FEED = 'https://feeds.example.com/mine.xml';
const OTHER = 'https://feeds.example.com/other.xml';
const epOf = (feedUrl: string, guid: string) => ({ id: fnv1a64(feedUrl + '\u0001' + guid), body: { feedUrl, guid, title: guid, enclosureUrl: `https://cdn/${guid}.mp3` } });

const sync = (t: TestDb, token: string, items: { feedUrl: string; createdAt: string; deletedAt?: string }[]) =>
  t.call('PUT', '/v1/me/subscriptions', { items }, token);

test('subscription_events records only real flips: subscribe, resend, unsubscribe, resubscribe', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'A');
  const ev = async () => (await t.q<{ kind: string }>('SELECT kind FROM subscription_events WHERE feed_url = $1 ORDER BY id', [FEED])).map((r) => r.kind);
  assert.equal((await sync(t, a.token, [{ feedUrl: FEED, createdAt: '2026-09-01T00:00:00Z' }])).status, 200);
  await sync(t, a.token, [{ feedUrl: FEED, createdAt: '2026-09-01T00:00:00Z' }]);
  assert.deepEqual(await ev(), ['sub'], 'a re-sent row is not a new subscribe');
  await sync(t, a.token, [{ feedUrl: FEED, createdAt: '2026-09-01T00:00:00Z', deletedAt: '2026-09-02T00:00:00Z' }]);
  await sync(t, a.token, [{ feedUrl: FEED, createdAt: '2026-09-03T00:00:00Z' }]);
  assert.deepEqual(await ev(), ['sub', 'unsub', 'sub']);
  await t.close();
});

test('stats: total, a 0-filled trend, 24 hour bars, platforms; the list shows current subscribers with names', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  const [a, b, c] = await Promise.all([signUp(t, 'a@example.com', 'Ana'), signUp(t, 'b@example.com', 'Ben'), signUp(t, 'c@example.com', 'Cy')]);
  const now = new Date().toISOString();
  for (const x of [a, b, c]) await sync(t, x.token, [{ feedUrl: FEED, createdAt: now }]);
  await sync(t, c.token, [{ feedUrl: FEED, createdAt: now, deletedAt: new Date(Date.now() + 1000).toISOString() }]);
  await t.q("INSERT INTO push_tokens (token, listener_id, platform) VALUES ('t1', $1, 'ios')", [a.id]);

  const s = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/subscribers/stats?days=7&tz=UTC`, owner)).json()) as {
    total: number; trend: { sub: number; unsub: number }[]; hours: number[]; platforms: Record<string, number>; historySince: string | null;
  };
  assert.equal(s.total, 2);
  assert.equal(s.trend.length, 7);
  assert.deepEqual([s.trend.at(-1)!.sub, s.trend.at(-1)!.unsub], [3, 1]);
  assert.equal(s.hours.length, 24);
  assert.deepEqual(s.platforms, { ios: 1, android: 0, unknown: 1 });
  assert.match(s.historySince ?? '', /^\d{4}-\d{2}-\d{2}$/);

  const list = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/subscribers`, owner)).json()) as { total: number; items: { displayName: string }[] };
  assert.deepEqual([list.total, list.items.map((i) => i.displayName).sort()], [2, ['Ana', 'Ben']]);
  await t.close();
});

test('G-M1: a muted listener cannot comment on this show — and can everywhere else, and can still react', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  const mine = epOf(FEED, 'g1');
  const theirs = epOf(OTHER, 'g2');
  await t.call('PUT', `/v1/episodes/${mine.id}`, { ...mine.body, durationMs: 1_000_000 });
  await t.call('PUT', `/v1/episodes/${theirs.id}`, theirs.body);
  const l = await signUp(t, 'l@example.com', 'Troll');

  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/mutes/${l.id}`, owner)).status, 204);
  const refused = await t.call('POST', `/v1/episodes/${mine.id}/comments`, { body: 'again' }, l.token);
  assert.equal(refused.status, 403);
  assert.deepEqual(await refused.json(), { error: 'muted_on_show', message: 'The host has turned off comments for you on this show.' });
  assert.equal((await t.call('POST', `/v1/episodes/${theirs.id}/comments`, { body: 'elsewhere' }, l.token)).status, 200);
  assert.equal((await t.call('PUT', `/v1/episodes/${mine.id}/reactions`, { offsetMs: 1000 }, l.token)).status < 400, true, 'reacting is not blocked');

  const muted = (await (await sCall(t, 'GET', `/v1/studio/shows/${key}/mutes`, owner)).json()) as { items: { displayName: string }[] };
  assert.deepEqual(muted.items.map((m) => m.displayName), ['Troll']);
  assert.equal((await sCall(t, 'DELETE', `/v1/studio/shows/${key}/mutes/${l.id}`, owner)).status, 204);
  await t.q("UPDATE comments SET created_at = created_at - interval '10 seconds'");
  assert.equal((await t.call('POST', `/v1/episodes/${mine.id}/comments`, { body: 'sorry' }, l.token)).status, 200);
  await t.close();
});

test('the owner and operators cannot be muted on their own show', async () => {
  const t = await freshDb();
  const owner = await studioLogin(t, 'o@example.com', 'Owner');
  const key = await proveClaim(t, owner.id, FEED);
  const op = await signUp(t, 'op@example.com', 'Op');
  await t.q('INSERT INTO show_members (feed_url, listener_id) VALUES ($1, $2)', [FEED, op.id]);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/mutes/${owner.id}`, owner)).status, 409);
  assert.equal((await sCall(t, 'PUT', `/v1/studio/shows/${key}/mutes/${op.id}`, owner)).status, 409);
  await t.close();
});

test('FR-031: the privacy page says hosts see subscriber names, and no longer says "phone only"', async () => {
  const t = await freshDb();
  const html = await (await t.call('GET', '/privacy')).text();
  assert.match(html, /can see <b>your display name and the date you subscribed<\/b>/);
  assert.doesNotMatch(html, /subscriptions and downloads live on your phone only/i);
  await t.close();
});
