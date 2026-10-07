// Tests the Monday digest: PLUS only, noon local time, unplayed episodes from last week, once per ISO week.
/**
 * M22 US15 (FR-045, FR-046; contracts/api.md "Weekly digest"). Guard G-M22-13: a digest goes only
 * to PLUS members, at most once per ISO week. Break: in runDigests (src/db/repos/account/digest.ts)
 * drop `ON CONFLICT (listener_id, iso_week) DO NOTHING` and key the row by sent time instead (or
 * skip the `if (!row) continue`) → the second run pushes again and this test goes red.
 * Expo is faked; a real push on a phone is NOT VERIFIED here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { isoWeek, localClock, runDigests, validTz } from '../src/db/repos/account/digest.ts';

const FEED = 'https://feeds.example.com/weekly.xml';
const MONDAY_NOON_UTC = new Date('2026-10-05T12:30:00Z'); // ISO week 2026-W41
const MONDAY_NOON_KL = new Date('2026-10-05T04:30:00Z'); // 12:30 in Asia/Kuala_Lumpur

function fakeExpo() {
  const sent: { to: string; data: { href: string } }[] = [];
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    const batch = JSON.parse(String(init?.body)) as { to: string; data: { href: string } }[];
    sent.push(...batch);
    return new Response(JSON.stringify({ data: batch.map(() => ({ status: 'ok' })) }), { status: 200 });
  }) as typeof fetch;
  return { f, sent };
}

async function member(t: TestDb, email: string, o: { plus?: boolean; tz?: string | null } = {}) {
  const who = await signUp(t, email, email.split('@')[0]!);
  if (o.plus !== false) await t.q("INSERT INTO entitlements (listener_id, kind, ref, until) VALUES ($1, 'plus', '', '2099-01-01')", [who.id]);
  if (o.tz !== undefined) await t.q('UPDATE listeners SET tz = $2 WHERE id = $1', [who.id, o.tz]);
  await t.q("INSERT INTO push_tokens (token, listener_id, platform) VALUES ($1, $2, 'android')", [`tok-${who.id}`, who.id]);
  await t.call('PUT', '/v1/me/subscriptions', { items: [{ feedUrl: FEED, createdAt: '2026-09-01T00:00:00.000Z' }] }, who.token);
  return who;
}

async function episodes(t: TestDb) {
  const add = (id: string, at: string) => t.q(
    'INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, published_at) VALUES ($1, $2, $1, $3, $4, $5, $6)',
    [id, FEED, `Episode ${id}`, 'Weekly', `https://cdn.example.com/${id}.mp3`, at]);
  await add('old', '2026-09-27T10:00:00Z'); // the week before last (Sunday 18:00 in Kuala Lumpur)
  await add('e1', '2026-09-28T09:00:00Z');
  await add('e2', '2026-10-01T09:00:00Z');
  await add('e3', '2026-10-04T20:00:00Z');
  await add('now', '2026-10-05T08:00:00Z'); // this week
}

test('ISO weeks, local clocks and time zones', () => {
  assert.equal(isoWeek(2026, 10, 5), '2026-W41');
  assert.equal(isoWeek(2021, 1, 3), '2020-W53');
  assert.equal(isoWeek(2026, 1, 1), '2026-W01');
  assert.deepEqual([localClock(MONDAY_NOON_KL, 'Asia/Kuala_Lumpur').weekday, localClock(MONDAY_NOON_KL, 'Asia/Kuala_Lumpur').hour], [1, 12]);
  assert.equal(localClock(MONDAY_NOON_KL, 'UTC').hour, 4);
  assert.deepEqual([validTz('Europe/London'), validTz('Not/AZone'), validTz('')], [true, false, false]);
});

test('G-M22-13: PLUS only, Monday noon local, unplayed episodes from last week newest first, once per ISO week', async () => {
  const t = await freshDb();
  await episodes(t);
  const plus = await member(t, 'plus@example.com', { tz: 'UTC' });
  const free = await member(t, 'free@example.com', { plus: false, tz: 'UTC' });
  await t.q("INSERT INTO positions (listener_id, episode_id, offset_ms, progress_seq, device_id) VALUES ($1, 'e2', 1000, 1, 'p1')", [plus.id]);
  const expo = fakeExpo();

  const tuesday = await runDigests(t.db, expo.f, new Date('2026-10-06T12:30:00Z'));
  assert.equal(tuesday.made, 0, 'only on Monday');
  assert.equal((await runDigests(t.db, expo.f, new Date('2026-10-05T11:59:00Z'))).made, 0, 'only in the noon hour');

  const r = await runDigests(t.db, expo.f, MONDAY_NOON_UTC);
  assert.equal(r.made, 1);
  assert.deepEqual(expo.sent.map((m) => [m.to, m.data.href]), [[`tok-${plus.id}`, '/digest/2026-W41']]);
  const page = (await (await t.call('GET', '/v1/me/digests', undefined, plus.token)).json()) as { items: { isoWeek: string; episodes: { id: string; enclosureUrl: string }[] }[] };
  assert.deepEqual(page.items.map((i) => [i.isoWeek, i.episodes.map((e) => e.id)]), [['2026-W41', ['e3', 'e1']]], 'played e2, this week and the week before are left out');
  assert.equal(page.items[0]!.episodes[0]!.enclosureUrl, 'https://cdn.example.com/e3.mp3');
  assert.deepEqual(((await (await t.call('GET', '/v1/me/digests', undefined, free.token)).json()) as { items: unknown[] }).items, [], 'no PLUS, no digest');

  // The same hour again, and later the same week: nothing new, no second push.
  assert.equal((await runDigests(t.db, expo.f, new Date('2026-10-05T12:50:00Z'))).made, 0);
  assert.equal(expo.sent.length, 1);
  assert.equal((await t.q('SELECT 1 FROM weekly_digests')).length, 1);
  await t.close();
});

test('the default zone is Kuala Lumpur; nothing unplayed or the switch off → nothing; old digests are swept', async () => {
  const t = await freshDb();
  await episodes(t);
  const kl = await member(t, 'kl@example.com');
  const off = await member(t, 'off@example.com');
  await t.call('PUT', '/v1/me/push-prefs', { digest: false }, off.token);
  const done = await member(t, 'done@example.com');
  for (const id of ['e1', 'e2', 'e3']) await t.q("INSERT INTO positions (listener_id, episode_id, offset_ms, progress_seq, device_id) VALUES ($1, $2, 1, 1, 'p')", [done.id, id]);
  await t.q("INSERT INTO weekly_digests (listener_id, iso_week, episode_ids, sent_at) VALUES ($1, '2026-W30', '{e1}', now() - interval '29 days')", [kl.id]);
  const expo = fakeExpo();
  const r = await runDigests(t.db, expo.f, MONDAY_NOON_KL);
  assert.deepEqual([r.made, r.swept], [1, 1]);
  assert.deepEqual(expo.sent.map((m) => m.to), [`tok-${kl.id}`]);
  // PUT /v1/me/tz: a real zone or 422.
  assert.equal((await t.call('PUT', '/v1/me/tz', { tz: 'Europe/London' }, kl.token)).status, 204);
  assert.equal((await t.call('PUT', '/v1/me/tz', { tz: 'Mars/Olympus' }, kl.token)).status, 422);
  await t.close();
});
