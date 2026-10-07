// Tests M22's small server items: tell the editors, shared show lists, and the often-listened row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { freshDb, signUp, type TestDb } from './harness.ts';

const noCatalog = (async () => new Response('nope', { status: 404 })) as typeof fetch;
const A = 'https://feeds.example.com/a.xml';
const B = 'https://feeds.example.com/b.xml';

async function episode(t: TestDb, feed: string, guid: string, showTitle: string): Promise<string> {
  const id = fnv1a64(`${feed}\u0001${guid}`);
  await t.q(
    `INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, now()) ON CONFLICT (id) DO NOTHING`,
    [id, feed, guid, `Ep ${guid}`, showTitle, `https://cdn.example.com/${guid}.mp3`]);
  return id;
}

test('tell the editors: words are stored once a day per caller, and only the owner reads the list', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const owner = await signUp(t, 'o@example.com', 'Owner');
  const a = await signUp(t, 'a@example.com', 'Alex');
  t.setOwner!(owner.id);
  assert.equal((await t.call('POST', '/v1/search-requests', { q: '  rare show  ' }, a.token)).status, 204);
  assert.equal((await t.call('POST', '/v1/search-requests', { q: 'Rare Show' }, a.token)).status, 204);
  assert.equal((await t.call('POST', '/v1/search-requests', { q: 'rare show' })).status, 204, 'signed out works too');
  assert.equal((await t.call('POST', '/v1/search-requests', { q: '' })).status, 422);
  assert.equal((await t.call('POST', '/v1/search-requests', { q: 'x'.repeat(201) })).status, 422);
  assert.equal((await t.q('SELECT 1 FROM search_requests')).length, 2);
  assert.equal((await t.call('GET', '/v1/mod/search-requests', undefined, a.token)).status, 403);
  const res = await t.call('GET', '/v1/mod/search-requests', undefined, owner.token);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: { q: string; n: number }[] };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0]!.n, 2);
  assert.equal((await t.call('GET', '/mod/search-requests')).status, 403, 'the HTML page needs the owner cookie');
  await t.close();
});

test('shared lists: 2–100 shows and a title ≤ 60; JSON and the public page read it back', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const a = await signUp(t, 'a@example.com', 'Alex');
  await episode(t, A, 'a1', 'Show A');
  assert.equal((await t.call('POST', '/v1/me/shared-lists', { title: 'Mine', feedUrls: [A] }, a.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/me/shared-lists', { title: 'x'.repeat(61), feedUrls: [A, B] }, a.token)).status, 422);
  assert.equal((await t.call('POST', '/v1/me/shared-lists', { title: 'Mine', feedUrls: [A, B] })).status, 401);
  const made = await t.call('POST', '/v1/me/shared-lists', { title: 'My <favourites>', feedUrls: [A, B] }, a.token);
  assert.equal(made.status, 200);
  const { id, url } = (await made.json()) as { id: string; url: string };
  assert.match(id, /^[A-Za-z0-9]{10}$/);
  assert.ok(url.endsWith(`/l/${id}`));

  const list = (await (await t.call('GET', `/v1/lists/${id}`)).json()) as { title: string; owner: { displayName: string }; shows: { feedUrl: string; title: string }[] };
  assert.equal(list.title, 'My <favourites>');
  assert.equal(list.owner.displayName, 'Alex');
  assert.deepEqual(list.shows.map((s) => [s.feedUrl, s.title]), [[A, 'Show A'], [B, 'feeds.example.com']]);

  const html = await (await t.call('GET', `/l/${id}`)).text();
  assert.ok(html.includes('My &lt;favourites&gt;'), 'the title is escaped');
  assert.ok(html.includes(`socialmorning://show/${encodeURIComponent(A)}`));
  assert.equal((await t.call('GET', '/l/nope')).status, 404);
  assert.equal((await t.call('GET', '/v1/lists/AAAAAAAAAA')).status, 404);
  await t.close();
});

test('often listened: top shows of the last 90 days on the profile, hidden by the Privacy switch except to yourself', async () => {
  const t = await freshDb({ catalogFetch: noCatalog, picksRaw: [] });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const epA = await episode(t, A, 'a1', 'Show A');
  const epB = await episode(t, B, 'b1', 'Show B');
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  await t.q(`INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, 'p', '[[0, 600000]]'::jsonb)`, [a.id, epA, today]);
  await t.q(`INSERT INTO listened_ranges (listener_id, episode_id, day, device_id, ranges) VALUES ($1, $2, $3, 'p', '[[0, 900000]]'::jsonb)`, [a.id, epB, old]);

  type P = { profile: { oftenListened: { feedUrl: string; title: string }[]; hideOftenListened?: boolean } };
  const read = async (token?: string) => ((await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, token)).json()) as P).profile;
  let p = await read(b.token);
  assert.deepEqual(p.oftenListened.map((s) => s.title), ['Show A'], 'only the last 90 days count');
  assert.equal(p.hideOftenListened, undefined, 'the switch is never shown to others');

  assert.equal((await t.call('PUT', '/v1/me/privacy', { hideOftenListened: true }, a.token)).status, 200);
  p = await read(b.token);
  assert.deepEqual(p.oftenListened, []);
  p = await read(a.token);
  assert.equal(p.oftenListened.length, 1, 'you still see your own');
  assert.equal(p.hideOftenListened, true);
  assert.equal((await t.call('PUT', '/v1/me/privacy', {}, a.token)).status, 422);
  await t.close();
});
