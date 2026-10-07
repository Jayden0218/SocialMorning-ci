// Tests voice comments: length measured by the server, kept like a comment, audio deleted with it.
/**
 * M19 US6 (quickstart A7, constitution v3.1.0). Guard G-M19-7: a recording over 60 s is refused
 * by the server's own measurement, whatever the header says; and a deleted voice comment's file
 * is removed from the store. The breaks: skip the `measured > VOICE_MAX_MS + SLACK_MS` check in
 * src/routes/social/voice-comments.ts, or the `remove` in the comment DELETE route.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, signUp, type TestDb } from './harness.ts';
import type { VoiceStorage } from '../src/storage/voice-blob.ts';

function fakeStore() {
  const puts: string[] = [];
  const removed: string[] = [];
  const store: VoiceStorage = {
    ready: true,
    put: async (path) => { puts.push(path); return { url: `https://blob.example/${path}`, pathname: path }; },
    remove: async (url) => { removed.push(url); },
  };
  return { store, puts, removed };
}

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...be32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
function m4a(ms: number, timescale = 44_100): Uint8Array {
  const dur = Math.round((ms * timescale) / 1000);
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be32(0), ...be32(0), ...be32(timescale), ...be32(dur), ...new Array(80).fill(0)]);
  return new Uint8Array([...box('ftyp', [...'M4A '].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0])), ...box('moov', mvhd)]);
}

const post = (t: TestDb, token: string, bytes: Uint8Array, headers: Record<string, string> = {}) =>
  t.app.request('/v1/episodes/e1/comments/voice', { method: 'POST', body: bytes as unknown as BodyInit, headers: { 'content-type': 'audio/mp4', 'x-duration-ms': '10000', 'x-offset-ms': '300000', authorization: `Bearer ${token}`, ...headers } });

test('G-M19-7: a 10 s voice comment posts at its moment and plays for others; over 60 s is refused', async () => {
  const f = fakeStore();
  const t = await freshDb({ voiceStorage: f.store });
  const a = await signUp(t, 'a@example.com', 'Alex');
  const b = await signUp(t, 'b@example.com', 'Bo');
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const r = await post(t, a.token, m4a(10_000));
  assert.equal(r.status, 201, await r.clone().text());
  const made = ((await r.json()) as { comment: { id: string; offsetMs: number; voice: { url: string; ms: number } } }).comment;
  assert.equal(made.offsetMs, 300_000);
  assert.equal(made.voice.ms, 10_000);
  assert.ok(f.puts[0]!.startsWith(`voice-comments/${a.id}/`));
  const seen = ((await (await t.call('GET', '/v1/episodes/e1/social', undefined, b.token)).json()) as { comments: { id: string; voice?: { url: string } }[] }).comments;
  assert.equal(seen.find((c) => c.id === made.id)!.voice!.url, made.voice.url);

  // the header lies; the server measures 75 s
  await t.q("UPDATE comments SET created_at = now() - interval '1 minute'");
  const long = await post(t, a.token, m4a(75_000), { 'x-duration-ms': '30000' });
  assert.equal(long.status, 422);
  assert.equal(f.puts.length, 1, 'nothing stored for the refused one');
  await t.close();
});

test('G-M19-7: deleting a voice comment removes its file; a removed one is swept', async () => {
  const f = fakeStore();
  const t = await freshDb({ voiceStorage: f.store, jobToken: 'job-token-not-secret' });
  const a = await signUp(t);
  await t.q("INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url) VALUES ('e1','https://f/x.xml','g','Ep','Show','https://c/x.mp3')");
  const one = ((await (await post(t, a.token, m4a(5_000))).json()) as { comment: { id: string; voice: { url: string } } }).comment;
  assert.equal((await t.call('DELETE', `/v1/comments/${one.id}`, undefined, a.token)).status, 200);
  assert.deepEqual(f.removed, [one.voice.url]);

  await t.q("UPDATE comments SET created_at = now() - interval '1 minute'");
  const two = ((await (await post(t, a.token, m4a(5_000))).json()) as { comment: { id: string; voice: { url: string } } }).comment;
  await t.q('UPDATE comments SET removed_at = now() WHERE id = $1', [two.id]);
  await t.call('POST', '/v1/internal/rebuild', { step: 'sweep' }, undefined, { authorization: 'Bearer job-token-not-secret' });
  assert.ok(f.removed.includes(two.voice.url), 'the sweep deleted the removed one');
  const [row] = await t.q<{ voice_url: string | null }>('SELECT voice_url FROM comments WHERE id = $1', [two.id]);
  assert.equal(row!.voice_url, null);
  await t.close();
});
