// Tests M22 statuses: replies only owner and author see, six reactions, the 100 milestone, suggestions, items, and full deletion.
/**
 * M22 US2 and US6 (specs/023-m22-the-xiaoyuzhou-gaps-2, T017–T020, T023, T024).
 *
 * G-M22-2 — an expired status leaves no reply recording, no photo and no reaction behind: the
 *   sweep deletes each file from its store before the rows go.
 *   The break that turns it red: in `src/db/repos/social/voice-posts.ts` `removeAttachments`, skip
 *   the reply-file delete (drop the `storage.remove(r.audio_url)` line) — the rows still cascade
 *   away, but the recording is never removed from the store.
 *
 * G-M22-12 — a status holds at most 10 items, and a status photo is at most 1 000 000 bytes.
 *   The break that turns it red: raise `STATUS_ITEMS_MAX` in `src/db/repos/social/status-items.ts`
 *   to 11 (the 11-item post answers 201), or `STATUS_PHOTO_MAX_BYTES` and the image body limit.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64 } from '@socialmorning/social-core';
import { ageStatusPhotos, countOf, expireStatuses, seedStatusReactions, voicePostIds } from './sc-neutral.ts';
import { freshDb, signUp, type TestDb } from './harness.ts';
import { putEpisode } from './put-episode.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';
import type { ImageStorage } from '../src/storage/image-store.ts';

const JOB = 'job-token-not-secret';
const ep = { feedUrl: 'https://feeds.example.com/s.xml', guid: 's1', title: 'Ep S', showTitle: 'Show S', enclosureUrl: 'https://cdn/s.mp3' };
const EP = fnv1a64(ep.feedUrl + '\u0001' + ep.guid);

function stores() {
  const voiceRemoved: string[] = [];
  const imageRemoved: string[] = [];
  const state = { failImage: false };
  const voice: VoiceStorage = {
    ready: true,
    put: async (path) => ({ url: `https://blob.example/${path}`, pathname: path }),
    remove: async (url) => { voiceRemoved.push(url); },
  };
  const images: ImageStorage = {
    ready: true,
    put: async (path) => ({ url: `https://pub.example/${path}`, pathname: path }),
    remove: async (path) => { if (state.failImage) throw new Error('store down'); imageRemoved.push(path); },
  };
  return { voice, images, voiceRemoved, imageRemoved, state };
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
/** A minimal M4A: ftyp + moov/mvhd (version 0) — all the server reads. */
function m4a(ms: number, timescale = 44_100): Uint8Array {
  const dur = Math.round((ms * timescale) / 1000);
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(dur), ...new Array(80).fill(0)]);
  return new Uint8Array([...box('ftyp', [...'M4A '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0])), ...box('moov', mvhd)]);
}
const jpeg = (n: number) => { const b = new Uint8Array(n); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };

const raw = (t: TestDb, path: string, token: string, bytes: Uint8Array, headers: Record<string, string>) =>
  t.app.request(path, { method: 'POST', body: bytes as unknown as BodyInit, headers: { authorization: `Bearer ${token}`, ...headers } });
const postVoice = async (t: TestDb, token: string, extra: Record<string, string> = {}) => {
  const r = await raw(t, '/v1/voice-posts', token, m4a(8_000), { 'content-type': 'audio/mp4', 'x-duration-ms': '8000', ...extra });
  assert.equal(r.status, 201, await r.clone().text());
  return ((await r.json()) as { id: string; url: string });
};
const voiceReply = async (t: TestDb, token: string, postId: string) => {
  const r = await raw(t, `/v1/voice-posts/${postId}/replies`, token, m4a(5_000), { 'content-type': 'audio/mp4', 'x-duration-ms': '5000' });
  assert.equal(r.status, 201, await r.clone().text());
  return ((await r.json()) as { id: string; url: string });
};
const photo = async (t: TestDb, token: string, n = 2_000) => raw(t, '/v1/voice-posts/images', token, jpeg(n), { 'content-type': 'image/jpeg' });
const rebuild = (t: TestDb) => t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, { authorization: `Bearer ${JOB}` });

type Listed = { id: string; suggested: boolean; items: unknown[]; reactions: { kind: number; count: number }[]; myReaction: number | null; replyCount?: number; reactedBy?: { name: string; kind: number }[] };
const list = async (t: TestDb, token: string, q = '') => ((await (await t.call('GET', `/v1/voice-posts${q}`, undefined, token)).json()) as { items: Listed[] }).items;

async function setup() {
  const s = stores();
  const t = await freshDb({ voiceStorage: s.voice, imageStorage: s.images, jobToken: JOB });
  await putEpisode(t, `${EP}`, { ...ep, durationMs: 2_000_000 });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bea');
  const c = await signUp(t, 'c@example.com', 'Cy');
  return { t, s, a, b, c };
}

test('T017: replies are seen by the owner and their author only; one reaction each; the owner sees counts and names', async () => {
  const { t, s, a, b, c } = await setup();
  await t.call('PUT', `/v1/listeners/${c.id}/follow`, undefined, a.token);
  const post = await postVoice(t, c.token);
  const text = await t.call('POST', `/v1/voice-posts/${post.id}/replies`, { body: 'Nice one' }, a.token);
  assert.equal(text.status, 201);
  assert.equal((await t.call('POST', `/v1/voice-posts/${post.id}/replies`, { body: 'x'.repeat(141) }, a.token)).status, 422); // M23 US6: bad input is 422 `validation` (the old code is `reason`)
  const v = await voiceReply(t, b.token, post.id);

  const replies = async (token: string) => ((await (await t.call('GET', `/v1/voice-posts/${post.id}/replies`, undefined, token)).json()) as { items: { author: { name: string }; body?: string; url?: string }[] }).items;
  assert.deepEqual((await replies(c.token)).map((r) => [r.author.name, r.body ?? r.url]), [['Alex', 'Nice one'], ['Bea', v.url]], 'the owner sees every reply');
  assert.deepEqual((await replies(a.token)).map((r) => r.author.name), ['Alex'], 'others see only their own');
  assert.deepEqual((await replies(b.token)).map((r) => r.author.name), ['Bea']);

  assert.equal((await t.call('PUT', `/v1/voice-posts/${post.id}/reaction`, { kind: 9 }, a.token)).status, 422);
  assert.equal((await t.call('PUT', `/v1/voice-posts/${post.id}/reaction`, { kind: 3 }, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/voice-posts/${post.id}/reaction`, { kind: 5 }, b.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/voice-posts/${post.id}/reaction`, { kind: 3 }, b.token)).status, 204, 'a new kind replaces the old');
  const mine = (await list(t, c.token)).find((p) => p.id === post.id)!;
  assert.deepEqual(mine.reactions, [{ kind: 3, count: 2 }]);
  assert.equal(mine.replyCount, 2);
  assert.deepEqual(mine.reactedBy?.map((r) => r.name).sort(), ['Alex', 'Bea']);
  const theirs = (await list(t, a.token)).find((p) => p.id === post.id)!;
  assert.equal(theirs.myReaction, 3);
  assert.equal(theirs.replyCount, undefined, 'only the owner gets the reply count');
  assert.equal((await t.call('DELETE', `/v1/voice-posts/${post.id}/reaction`, undefined, a.token)).status, 204);
  assert.equal((await list(t, a.token)).find((p) => p.id === post.id)!.myReaction, null);

  // Delete: not someone else's reply (404); the owner deletes any, and its recording goes.
  const bReply = v.id;
  assert.equal((await t.call('DELETE', `/v1/voice-posts/${post.id}/replies/${bReply}`, undefined, a.token)).status, 404);
  assert.equal((await t.call('DELETE', `/v1/voice-posts/${post.id}/replies/${bReply}`, undefined, c.token)).status, 204);
  assert.ok(s.voiceRemoved.includes(v.url), 'the reply recording was removed from the store');

  const kinds = ((await (await t.call('GET', '/v1/me/notifications', undefined, c.token)).json()) as { items: { kind: string }[] }).items.map((n) => n.kind);
  assert.deepEqual(kinds.filter((k) => k.startsWith('status_')).sort(), ['status_reaction', 'status_reaction', 'status_reply', 'status_reply']);
  await t.close();
});

test('T017 (US2 scenario 5): the owner is told once when a status reaches 100 reactions', async () => {
  const { t, a, b, c } = await setup();
  const r = await t.call('POST', '/v1/voice-posts', { body: 'Count me' }, c.token);
  const id = ((await r.json()) as { id: string }).id;
  await seedStatusReactions(t, id, 99);
  assert.equal((await t.call('PUT', `/v1/voice-posts/${id}/reaction`, { kind: 2 }, a.token)).status, 204);
  assert.equal((await t.call('PUT', `/v1/voice-posts/${id}/reaction`, { kind: 2 }, b.token)).status, 204);
  const kinds = ((await (await t.call('GET', '/v1/me/notifications', undefined, c.token)).json()) as { items: { kind: string }[] }).items.map((n) => n.kind);
  assert.equal(kinds.filter((k) => k === 'status_milestone').length, 1, 'once, not again at 101');
  await t.close();
});

test('T020 (FR-010): ?suggested=1 adds up to 5 public statuses from people I do not follow — never muted or blocked ones', async () => {
  const { t, a, b, c } = await setup();
  await t.call('PUT', `/v1/listeners/${c.id}/follow`, undefined, a.token);
  const cPost = ((await (await t.call('POST', '/v1/voice-posts', { body: 'From Cy' }, c.token)).json()) as { id: string }).id;
  const bPost = ((await (await t.call('POST', '/v1/voice-posts', { body: 'From Bea' }, b.token)).json()) as { id: string }).id;
  assert.deepEqual((await list(t, a.token)).map((p) => p.id), [cPost], 'no suggestions unless asked');
  assert.deepEqual((await list(t, a.token, '?suggested=1')).map((p) => [p.id, p.suggested]), [[cPost, false], [bPost, true]]);
  for (let i = 0; i < 6; i++) {
    const x = await signUp(t, `x${i}@example.com`, `X${i}`);
    await t.call('POST', '/v1/voice-posts', { body: `Hi ${i}` }, x.token);
  }
  assert.equal((await list(t, a.token, '?suggested=1')).filter((p) => p.suggested).length, 5, 'at most 5');
  await t.call('PUT', `/v1/me/mutes/${b.id}`, undefined, a.token);
  await t.call('POST', '/v1/me/blocks', { listenerId: b.id }, a.token);
  assert.ok(!(await list(t, a.token, '?suggested=1')).some((p) => p.id === bPost), 'muted or blocked → never suggested');
  assert.equal((await t.call('GET', `/v1/voice-posts/${cPost}`, undefined, a.token)).status, 200);
  assert.equal((await t.call('GET', `/v1/voice-posts/${bPost}`, undefined, a.token)).status, 404, 'a blocked author’s status is not found');
  await t.close();
});

test('G-M22-12 (T023, T024): up to 10 items — the 11th is refused; a photo over 1 000 000 bytes is 413; a photo is your own upload', async () => {
  const { t, a, b } = await setup();
  const up = await photo(t, a.token);
  assert.equal(up.status, 201, await up.clone().text());
  const { imageKey, url } = (await up.json()) as { imageKey: string; url: string };
  assert.match(imageKey, new RegExp(`^statuses/${a.id}/[0-9a-f-]{36}\\.jpg$`));
  assert.equal((await photo(t, a.token, 1_000_001)).status, 413);
  assert.equal((await photo(t, a.token, 1_000_000)).status, 201, 'exactly 1 000 000 bytes is allowed');

  const epItem = { kind: 'episode', episodeId: EP };
  const eleven = await t.call('POST', '/v1/voice-posts', { body: 'Too many', items: Array.from({ length: 11 }, () => epItem) }, a.token);
  assert.equal(eleven.status, 422); // M23 US6: bad input is 422 `validation` (the old code is `reason`)
  assert.equal(((await eleven.json()) as { reason: string }).reason, 'too_many_items');
  assert.equal((await t.call('POST', '/v1/voice-posts', { body: 'Not mine', items: [{ kind: 'photo', imageKey }] }, b.token)).status, 422, 'someone else’s photo');

  const ok = await t.call('POST', '/v1/voice-posts', { body: 'Ten', items: [...Array.from({ length: 9 }, () => epItem), { kind: 'photo', imageKey }] }, a.token);
  assert.equal(ok.status, 201, await ok.clone().text());
  const id = ((await ok.json()) as { id: string }).id;
  const one = (await (await t.call('GET', `/v1/voice-posts/${id}`, undefined, a.token)).json()) as { items: { kind: string; title?: string; url?: string }[] };
  assert.equal(one.items.length, 10);
  assert.equal(one.items[0]!.title, 'Ep S');
  assert.equal(one.items[9]!.url, url);

  // A recording carries its items in the URI-encoded `x-items` header; 11 there is refused too.
  const over = await raw(t, '/v1/voice-posts', a.token, m4a(3_000), { 'content-type': 'audio/mp4', 'x-duration-ms': '3000', 'x-items': encodeURIComponent(JSON.stringify(Array.from({ length: 11 }, () => epItem))) });
  assert.equal(over.status, 422);
  await t.close();
});

test('G-M22-2 (T018, T019): an expired status leaves no reply recording, photo or reaction — each file is deleted first', async () => {
  const { t, s, a, b, c } = await setup();
  const up = (await (await photo(t, c.token)).json()) as { imageKey: string };
  const post = await postVoice(t, c.token, { 'x-items': encodeURIComponent(JSON.stringify([{ kind: 'photo', imageKey: up.imageKey }, { kind: 'episode', episodeId: EP }])) });
  const r1 = await voiceReply(t, a.token, post.id);
  const r2 = await voiceReply(t, b.token, post.id);
  await t.call('POST', `/v1/voice-posts/${post.id}/replies`, { body: 'And text' }, a.token);
  await t.call('PUT', `/v1/voice-posts/${post.id}/reaction`, { kind: 1 }, a.token);
  // A text status with a photo, too: it has no recording of its own, but its photo must go.
  const up2 = (await (await photo(t, a.token)).json()) as { imageKey: string };
  await t.call('POST', '/v1/voice-posts', { body: 'Text with a photo', items: [{ kind: 'photo', imageKey: up2.imageKey }] }, a.token);

  await expireStatuses(t, 60_000);
  s.state.failImage = true;
  await rebuild(t);
  assert.equal((await voicePostIds(t)).length, 2, 'a photo that could not be deleted keeps its status for the next cycle');

  s.state.failImage = false;
  assert.equal((await rebuild(t)).status, 200);
  assert.deepEqual(await voicePostIds(t), []);
  assert.equal(await countOf(t, 'status_replies'), 0, '0 reply rows');
  assert.equal(await countOf(t, 'status_reactions'), 0, '0 reactions');
  assert.equal(await countOf(t, 'status_items'), 0, '0 items');
  for (const u of [r1.url, r2.url, post.url]) assert.ok(s.voiceRemoved.includes(u), `removed from the voice store: ${u}`);
  assert.deepEqual(s.imageRemoved.sort(), [up.imageKey, up2.imageKey].sort(), 'both photos removed from the image store');
  assert.equal(await countOf(t, 'status_photos'), 0, 'the upload records are gone');
  await t.close();
});

test('T023: a photo uploaded but never posted is deleted after 2 hours', async () => {
  const { t, s, a } = await setup();
  const up = (await (await photo(t, a.token)).json()) as { imageKey: string };
  await rebuild(t);
  assert.deepEqual(s.imageRemoved, [], 'a fresh upload is kept (it may be posted yet)');
  await ageStatusPhotos(t, 3 * 3_600_000);
  await rebuild(t);
  assert.deepEqual(s.imageRemoved, [up.imageKey]);
  await t.close();
});
