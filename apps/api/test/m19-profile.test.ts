// Tests editing my profile: name, bio, age range and gender rules, and the profile photo store.
/**
 * M19 US1 (quickstart A2). Guard G-M19-1: age range and gender never leave the account — not on
 * the public profile, not on a comment. The break: add `age_range` to the `look` object in
 * src/db/repos/social/profiles.ts; the "never public" test goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';

function fakeStore() {
  const puts: { path: string; bytes: number; type: string }[] = [];
  const removed: string[] = [];
  const store: VoiceStorage = {
    ready: true,
    put: async (path, bytes, type) => { puts.push({ path, bytes: bytes.length, type }); return { url: `https://blob.example/${path}`, pathname: path }; },
    remove: async (url) => { removed.push(url); },
  };
  return { store, puts, removed };
}

const JPEG = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(Math.max(0, n - 4)).fill(1)]);
const putAvatar = (t: TestDb, token: string, bytes: Uint8Array, type = 'image/jpeg') =>
  t.app.request('/v1/me/avatar', { method: 'PUT', body: bytes as unknown as BodyInit, headers: { 'content-type': type, authorization: `Bearer ${token}` } });

test('PATCH /v1/me: name 1–30, bio ≤ 160, age range and gender from their lists or null', async () => {
  const t = await freshDb();
  const a = await signUp(t);
  const ok = await t.call('PATCH', '/v1/me', { displayName: '  Sam  ', bio: 'I listen on the bus.', ageRange: '25-34', gender: 'unsaid', likesPublic: false }, a.token);
  assert.equal(ok.status, 200);
  const j = (await ok.json()) as { listener: { displayName: string; bio: string; ageRange: string; gender: string; likesPublic: boolean } };
  assert.equal(j.listener.displayName, 'Sam');
  assert.equal(j.listener.bio, 'I listen on the bus.');
  assert.equal(j.listener.ageRange, '25-34');
  assert.equal(j.listener.likesPublic, false);
  for (const bad of [{ displayName: '' }, { displayName: 'x'.repeat(31) }, { bio: 'x'.repeat(161) }, { ageRange: '30' }, { gender: 'robot' }]) {
    assert.equal((await t.call('PATCH', '/v1/me', bad, a.token)).status, 422, JSON.stringify(bad));
  }
  const cleared = (await (await t.call('PATCH', '/v1/me', { ageRange: null, gender: null, bio: '' }, a.token)).json()) as { listener: Record<string, unknown> };
  assert.equal(cleared.listener['ageRange'], undefined);
  assert.equal(cleared.listener['gender'], undefined);
  assert.equal(cleared.listener['bio'], undefined);
  assert.equal((await t.call('PATCH', '/v1/me', { bio: 'x' })).status, 401);
  await t.close();
});

test('G-M19-1: age range and gender are never public', async () => {
  const t = await freshDb();
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.call('PATCH', '/v1/me', { ageRange: '18-24', gender: 'woman', bio: 'Hello' }, a.token);
  const p = await (await t.call('GET', `/v1/listeners/${a.id}`, undefined, b.token)).text();
  assert.ok(p.includes('Hello'), 'the bio is public');
  assert.ok(!p.includes('18-24') && !p.includes('woman'), `age/gender leaked: ${p}`);
  await t.close();
});

test('avatar: JPEG ≤ 200 KB is stored, the old one removed, a non-image refused, DELETE clears it', async () => {
  const f = fakeStore();
  const t = await freshDb({ avatarStorage: f.store });
  const a = await signUp(t);
  const r1 = await putAvatar(t, a.token, JPEG(1000));
  assert.equal(r1.status, 200);
  const u1 = ((await r1.json()) as { avatarUrl: string }).avatarUrl;
  assert.ok(u1.startsWith(`https://blob.example/avatars/${a.id}/`));
  const r2 = await putAvatar(t, a.token, JPEG(2000));
  const u2 = ((await r2.json()) as { avatarUrl: string }).avatarUrl;
  assert.notEqual(u1, u2);
  assert.deepEqual(f.removed, [u1], 'the old photo leaves the store');
  assert.equal((await putAvatar(t, a.token, new Uint8Array([1, 2, 3, 4, 5]))).status, 422, 'not an image');
  assert.equal((await putAvatar(t, a.token, JPEG(204_801))).status, 413, 'over 200 KB');
  const me = (await (await t.call('GET', '/v1/me', undefined, a.token)).json()) as { listener: { avatarUrl?: string } };
  assert.equal(me.listener.avatarUrl, u2);
  const [row] = await t.q<{ avatar_bytes: number }>('SELECT avatar_bytes FROM listeners WHERE id = $1', [a.id]);
  assert.equal(row!.avatar_bytes, 2000);
  assert.equal((await t.call('DELETE', '/v1/me/avatar', undefined, a.token)).status, 204);
  assert.deepEqual(f.removed, [u1, u2]);
  await t.close();
});

test('avatar: a comment carries its author\'s photo', async () => {
  const f = fakeStore();
  const t = await freshDb({ avatarStorage: f.store });
  const a = await signUp(t);
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://cdn/x.mp3')");
  const url = ((await (await putAvatar(t, a.token, JPEG(500))).json()) as { avatarUrl: string }).avatarUrl;
  await t.q("INSERT INTO comments (episode_id, author_id, body, offset_ms) VALUES ('e1', $1, 'hi', 1000)", [a.id]);
  const body = await (await t.call('GET', '/v1/episodes/e1/comments')).text();
  assert.ok(body.includes(url), body);
  await t.close();
});
