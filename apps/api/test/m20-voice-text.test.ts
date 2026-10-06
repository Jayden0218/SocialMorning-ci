// Tests the text of a voice comment or voice post: stored as sent, read back, refused when too long.
/**
 * M20 US3 (spec FR-006, FR-009, FR-010; contracts/api.md "Voice text"; quickstart A11). The
 * speech itself happens on the phone — quickstart B4/B5, NOT VERIFIED here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';
import { readTranscript } from '../src/voice/transcript.ts';

const store: VoiceStorage = { ready: true, put: async (path) => ({ url: `https://blob.example/${path}`, pathname: path }), remove: async () => undefined };
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
function m4a(ms: number, timescale = 44_100): Uint8Array {
  const dur = Math.round((ms * timescale) / 1000);
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(dur), ...new Array(80).fill(0)]);
  return new Uint8Array([...box('ftyp', [...'M4A '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0])), ...box('moov', mvhd)]);
}
const send = (t: TestDb, path: string, token: string, headers: Record<string, string>) =>
  t.app.request(path, { method: 'POST', body: m4a(10_000) as unknown as BodyInit, headers: { 'content-type': 'audio/mp4', 'x-duration-ms': '10000', authorization: `Bearer ${token}`, ...headers } });

test('A11: a voice comment keeps the text its author sent; others read it; a report copy carries it', async () => {
  const t = await freshDb({ voiceStorage: store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const said = '这一段 really is the best part';
  const r = await send(t, '/v1/episodes/e1/comments/voice', a.token, { 'x-offset-ms': '1000', 'x-transcript': encodeURIComponent(said) });
  assert.equal(r.status, 201, await r.clone().text());
  const made = ((await r.json()) as { comment: { id: string; voice: { text?: string } } }).comment;
  assert.equal(made.voice.text, said);
  const seen = ((await (await t.call('GET', '/v1/episodes/e1/social', undefined, b.token)).json()) as { comments: { id: string; voice?: { text?: string } }[] }).comments;
  assert.equal(seen.find((c) => c.id === made.id)!.voice!.text, said);
  const rep = await t.call('POST', '/v1/reports', { targetKind: 'comment', targetId: made.id, reason: 'spam' }, b.token);
  assert.ok(rep.status === 201 || rep.status === 200, await rep.clone().text());
  const [copy] = await t.q<{ snapshot: unknown }>('SELECT snapshot FROM reports WHERE target_id = $1', [made.id]);
  const snap = (typeof copy!.snapshot === 'string' ? JSON.parse(copy!.snapshot) : copy!.snapshot) as { voiceText?: string; voiceUrl?: string };
  assert.equal(snap.voiceText, said);
  assert.ok(snap.voiceUrl);
  await t.close();
});

test('A11: no header is no text; over 2000 characters or a broken encoding is refused before anything is stored', async () => {
  const t = await freshDb({ voiceStorage: store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const plain = await send(t, '/v1/episodes/e1/comments/voice', a.token, {});
  assert.equal(plain.status, 201);
  assert.equal(((await plain.json()) as { comment: { voice: { text?: string } } }).comment.voice.text, undefined);
  await t.q("UPDATE comments SET created_at = now() - interval '1 minute'");
  assert.equal((await send(t, '/v1/episodes/e1/comments/voice', a.token, { 'x-transcript': encodeURIComponent('x'.repeat(2001)) })).status, 422);
  assert.equal((await send(t, '/v1/episodes/e1/comments/voice', a.token, { 'x-transcript': '%E0%A4%A' })).status, 422);
  const [row] = await t.q<{ n: number }>('SELECT count(*)::int AS n FROM comments');
  assert.equal(row!.n, 1);
  await t.close();
});

test('A11: a voice post carries its text to its followers', async () => {
  const t = await freshDb({ voiceStorage: store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const r = await send(t, '/v1/voice-posts', a.token, { 'x-transcript': encodeURIComponent('Good morning') });
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal(((await r.json()) as { text?: string }).text, 'Good morning');
  const list = (await (await t.call('GET', '/v1/voice-posts?from=following', undefined, a.token)).json()) as { items: { text?: string }[] };
  assert.equal(list.items[0]!.text, 'Good morning');
  await t.close();
});

test('readTranscript folds spaces, treats blank as none', () => {
  assert.equal(readTranscript(undefined), undefined);
  assert.equal(readTranscript(encodeURIComponent('  \n ')), undefined);
  assert.equal(readTranscript(encodeURIComponent('a\n\n b')), 'a b');
});

test('iPhone walk 2026-10-06: an upload with no type (React Native Blob) is taken when its bytes are MP4; other bytes are not', async () => {
  const t = await freshDb({ voiceStorage: store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const r = await send(t, '/v1/episodes/e1/comments/voice', a.token, { 'content-type': 'application/octet-stream' });
  assert.equal(r.status, 201, await r.clone().text());
  await t.q("UPDATE comments SET created_at = now() - interval '1 minute'");
  const junk = await t.app.request('/v1/episodes/e1/comments/voice', { method: 'POST', body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) as unknown as BodyInit, headers: { 'content-type': 'application/octet-stream', 'x-duration-ms': '10000', authorization: `Bearer ${a.token}` } });
  assert.equal(junk.status, 422);
  assert.equal((await send(t, '/v1/episodes/e1/comments/voice', a.token, { 'content-type': 'audio/mpeg' })).status, 422, 'a wrong declared type is still refused');
  await t.close();
});
