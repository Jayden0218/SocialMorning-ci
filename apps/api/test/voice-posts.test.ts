/**
 * M12 FR-104 — voice status posts (constitution 2.2.0: ≤ 60 s, deleted by the server at 48 h).
 * Guard G-V1: an expired post's blob delete is called AND its row is gone — not merely hidden.
 * The break: filter on read only (make `sweepExpired` in src/db/repos/social/voice-posts.ts delete
 * nothing); the reads still hide the post, and this file goes red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';
import { audioDurationMs } from '../src/voice/duration.ts';

const JOB = 'job-token-not-secret';

function fakeStore(ready = true) {
  const puts: { path: string; bytes: number; type: string }[] = [];
  const removed: string[] = [];
  const state = { failRemove: false };
  const store: VoiceStorage = {
    ready,
    put: async (path, bytes, type) => { puts.push({ path, bytes: bytes.length, type }); return { url: `https://blob.example/${path}`, pathname: path }; },
    remove: async (url) => { if (state.failRemove) throw new Error('store down'); removed.push(url); },
  };
  return { store, puts, removed, state };
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
/** A minimal M4A: ftyp + moov/mvhd (version 0) — all the server reads. */
function m4a(ms: number, timescale = 44_100): Uint8Array {
  const dur = Math.round((ms * timescale) / 1000);
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(dur), ...new Array(80).fill(0)]);
  return new Uint8Array([...box('ftyp', [...'M4A '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0])), ...box('moov', mvhd)]);
}
/** Raw AAC: `frames` ADTS frames at 44.1 kHz (1024 samples each), each 7 + 9 bytes. */
function adts(frames: number, id3 = false): Uint8Array {
  const len = 16;
  const frame = [0xff, 0xf1, 0x50, 0x40 | (len >> 11), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc, ...new Array(9).fill(0)];
  const tag = id3 ? [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0, 0] : [];
  return new Uint8Array([...tag, ...Array.from({ length: frames }, () => frame).flat()]);
}

const post = (t: TestDb, token: string | undefined, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  t.app.request('/v1/voice-posts', { method: 'POST', body: bytes as unknown as BodyInit, headers: { 'content-type': 'audio/mp4', 'x-duration-ms': '5000', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
type Items = { items: { id: string; url: string; durationMs: number; author: { name: string; initials: string }; mine: boolean }[] };
const feed = async (t: TestDb, token: string) => (await (await t.call('GET', '/v1/voice-posts?from=following', undefined, token)).json()) as Items;
const rebuild = (t: TestDb) => t.call('POST', '/v1/internal/rebuild', { step: 'feeds' }, undefined, { authorization: `Bearer ${JOB}` });

test('G-V1: an expired post is never read, and the cron deletes its blob AND its row', async () => {
  const v = fakeStore();
  const t = await freshDb({ voiceStorage: v.store, jobToken: JOB });
  const a = await signUp(t, 'a@example.com', 'alex');
  const r = await post(t, a.token, m4a(12_000));
  assert.equal(r.status, 201);
  const made = (await r.json()) as { id: string; url: string; expiresAt: string };
  assert.match(v.puts[0]!.path, new RegExp(`^voice/${a.id}/${made.id}\\.m4a$`));
  const hours = (new Date(made.expiresAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 47.9 && hours <= 48, `expires 48 h after creation (${hours})`);
  assert.deepEqual((await feed(t, a.token)).items.map((i) => [i.id, i.durationMs, i.author.initials, i.mine]), [[made.id, 12_000, 'A', true]]);

  await t.q("UPDATE voice_posts SET expires_at = now() - interval '1 minute'");
  assert.deepEqual((await feed(t, a.token)).items, [], 'an expired row is never returned');

  v.state.failRemove = true;
  await rebuild(t);
  assert.equal((await t.q('SELECT id FROM voice_posts')).length, 1, 'a blob that could not be deleted keeps its row for the next cycle');

  v.state.failRemove = false;
  const res = (await (await rebuild(t)).json()) as { counts: { voiceDeleted: number } };
  assert.equal(res.counts.voiceDeleted, 1);
  assert.deepEqual(v.removed, [made.url], 'the blob delete was called');
  assert.deepEqual(await t.q('SELECT id FROM voice_posts'), [], 'the row is gone, not just hidden');
  await t.close();
});

test('FR-104: ≤ 600 000 bytes, ≤ 60 s declared and measured, audio/mp4 or audio/aac, signed in; storage off → 503', async () => {
  const v = fakeStore();
  const t = await freshDb({ voiceStorage: v.store });
  const a = await signUp(t);
  assert.equal((await post(t, undefined, m4a(5000))).status, 401);
  assert.equal((await post(t, a.token, m4a(5000), { 'content-type': 'audio/mpeg' })).status, 422);
  assert.equal((await post(t, a.token, m4a(5000), { 'x-duration-ms': '60001' })).status, 422);
  assert.equal((await post(t, a.token, m4a(5000), { 'x-duration-ms': 'abc' })).status, 422);
  assert.equal((await post(t, a.token, new Uint8Array(0))).status, 422);
  assert.equal((await post(t, a.token, m4a(61_000))).status, 422, 'declared 5 s, measured 61 s');
  assert.equal((await post(t, a.token, new Uint8Array(1000).fill(7))).status, 422, 'not audio we can measure');
  const big = new Uint8Array(600_001);
  big.set(m4a(5000));
  const tooBig = await post(t, a.token, big);
  assert.equal(tooBig.status, 413);
  assert.equal(((await tooBig.json()) as { error: string }).error, 'too_large');
  const aac = await post(t, a.token, adts(87), { 'content-type': 'audio/aac', 'x-duration-ms': '2000' });
  assert.equal(aac.status, 201);
  assert.match(v.puts[0]!.path, /\.aac$/);
  assert.equal(v.puts.length, 1, 'nothing refused was stored');
  await t.close();

  const off = await freshDb({ voiceStorage: fakeStore(false).store });
  const b = await signUp(off);
  const r = await post(off, b.token, m4a(5000));
  assert.equal(r.status, 503);
  assert.equal(((await r.json()) as { error: string }).error, 'storage_off');
  await off.close();
});

test('FR-104: followed people and yourself only, never across a block; the author deletes (blob + row); at most 5 live at once', async () => {
  const v = fakeStore();
  const t = await freshDb({ voiceStorage: v.store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  const c = await signUp(t, 'c@example.com', 'Cy');
  await t.call('PUT', `/v1/listeners/${b.id}/follow`, undefined, a.token);
  const pb = ((await (await post(t, b.token, m4a(3000))).json()) as { id: string; url: string });
  await post(t, c.token, m4a(3000));
  assert.deepEqual((await feed(t, a.token)).items.map((i) => i.author.name), ['Bo'], 'a stranger\'s post is not in "following"');
  assert.equal((await t.call('GET', '/v1/voice-posts?from=everyone', undefined, a.token)).status, 422);

  assert.equal((await t.call('DELETE', `/v1/voice-posts/${pb.id}`, undefined, a.token)).status, 403);
  await t.call('POST', '/v1/me/blocks', { listenerId: a.id }, b.token);
  assert.deepEqual((await feed(t, a.token)).items, [], 'blocked: gone');
  assert.equal((await t.call('DELETE', `/v1/voice-posts/${pb.id}`, undefined, b.token)).status, 204);
  assert.deepEqual(v.removed, [pb.url]);
  assert.equal((await t.call('DELETE', `/v1/voice-posts/${pb.id}`, undefined, b.token)).status, 404);

  for (let i = 0; i < 5; i++) assert.equal((await post(t, a.token, m4a(1000))).status, 201);
  assert.equal((await post(t, a.token, m4a(1000))).status, 429);

  // Account deletion takes the blobs with it.
  const before = v.removed.length;
  const del = await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token);
  assert.equal(del.status, 200);
  assert.equal(v.removed.length - before, 5);
  assert.deepEqual(await t.q('SELECT id FROM voice_posts WHERE listener_id = $1', [a.id]), []);
  await t.close();
});

test('duration: mp4 v0/v1, 64-bit and to-end box sizes, ADTS with and without ID3; anything else is unreadable', () => {
  assert.equal(audioDurationMs(m4a(12_345, 1000)), 12_345);
  // version 1 mvhd, in a 64-bit-sized moov
  const v1 = box('mvhd', [1, 0, 0, 0, ...new Array(16).fill(0), ...be32(1000), ...be32(0), ...be32(30_000), ...new Array(80).fill(0)]);
  const ftyp = box('ftyp', [...'isom'].map((ch) => ch.charCodeAt(0)).concat([0, 0, 0, 0]));
  const big = [0, 0, 0, 1, ...[...'moov'].map((ch) => ch.charCodeAt(0)), ...be32(0), ...be32(16 + v1.length), ...v1];
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...big])), 30_000);
  const toEnd = [0, 0, 0, 0, ...[...'moov'].map((ch) => ch.charCodeAt(0)), ...box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(1000), ...be32(7000), ...new Array(80).fill(0)])];
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...toEnd])), 7000);
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...box('mdat', [1, 2, 3])])), undefined, 'no moov');
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...box('moov', box('trak', []))])), undefined, 'no mvhd');
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...box('moov', box('mvhd', [0, 0, 0, 0]))])), undefined, 'mvhd cut short');
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, ...box('moov', box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(0), ...be32(5), ...new Array(80).fill(0)]))])), undefined, 'timescale 0');
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, 0, 0, 0, 99, 1, 2, 3, 4])), undefined, 'a box running past the end');
  assert.equal(audioDurationMs(new Uint8Array([...ftyp, 0, 0, 0, 1, ...[...'moov'].map((ch) => ch.charCodeAt(0)), 0, 0])), undefined, 'a 64-bit size cut short');
  assert.equal(audioDurationMs(adts(87)), 2020);
  assert.equal(audioDurationMs(adts(43, true)), 998);
  assert.equal(audioDurationMs(new Uint8Array([0xff, 0xf1, 0x3c, 0x40, 0x02, 0x1f, 0xfc])), undefined, 'bad sample-rate index');
  assert.equal(audioDurationMs(new Uint8Array([0xff, 0xf1, 0x50, 0x40, 0x00, 0x1f, 0xfc])), undefined, 'frame length under 7');
  assert.equal(audioDurationMs(new Uint8Array([1, 2, 3])), undefined);
  assert.equal(audioDurationMs(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])), undefined, 'an ID3 tag and nothing else');
});
