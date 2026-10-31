/**
 * M32 L2 guards. G-M32-D11: the Blob tokens are read at each use (a rotated secret applies without a cold start).
 * Break: in src/storage/episodes-blob.ts make `ready` read a token captured when the store was built.
 * G-M32-D15a/b/c: the logger's JSON shape, level filter and redaction. Break: remove the SECRET_KEY check / the threshold test in src/log.ts.
 * G-M32-D15d: a swallowed failure leaves a warn line (break: make `swallow` not call log.warn).
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { blobStorage } from '../src/storage/episodes-blob.ts';
import { voiceBlobStorage } from '../src/storage/voice-blob.ts';
import { alertEmail, episodesBlobToken, voiceBlobToken, studioUrl } from '../src/config.ts';
import { log, sink, swallow } from '../src/log.ts';

const KEEP = { e: process.env['EPISODES_READ_WRITE_TOKEN'], v: process.env['BLOB_READ_WRITE_TOKEN'], l: process.env['LOG_LEVEL'], a: process.env['ALERT_EMAIL'] };
const realWrite = sink.write;
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
afterEach(() => {
  restore('EPISODES_READ_WRITE_TOKEN', KEEP.e); restore('BLOB_READ_WRITE_TOKEN', KEEP.v); restore('LOG_LEVEL', KEEP.l); restore('ALERT_EMAIL', KEEP.a);
  sink.write = realWrite;
});
const capture = () => { const lines: Array<{ level: string; obj: Record<string, unknown>; raw: string }> = []; sink.write = (level, raw) => { lines.push({ level, raw, obj: JSON.parse(raw) }); }; return lines; };

test('G-M32-D11 config getters read the environment at each call', () => {
  process.env['ALERT_EMAIL'] = 'a@example.com';
  assert.equal(alertEmail(), 'a@example.com');
  process.env['ALERT_EMAIL'] = 'b@example.com';
  assert.equal(alertEmail(), 'b@example.com');
  process.env['EPISODES_READ_WRITE_TOKEN'] = 't1'; assert.equal(episodesBlobToken(), 't1');
  process.env['EPISODES_READ_WRITE_TOKEN'] = 't2'; assert.equal(episodesBlobToken(), 't2');
  process.env['BLOB_READ_WRITE_TOKEN'] = 'v1'; assert.equal(voiceBlobToken(), 'v1');
  assert.match(studioUrl(), /^https:/);
});

test('G-M32-D11 the episode and voice stores follow a rotated token without being rebuilt', async () => {
  delete process.env['EPISODES_READ_WRITE_TOKEN']; delete process.env['BLOB_READ_WRITE_TOKEN'];
  const ep = blobStorage(), voice = voiceBlobStorage();
  assert.equal(ep.ready, false); assert.equal(voice.ready, false);
  process.env['EPISODES_READ_WRITE_TOKEN'] = 'vercel_blob_rw_abc_def'; process.env['BLOB_READ_WRITE_TOKEN'] = 'vercel_blob_rw_abc_def';
  assert.equal(ep.ready, true, 'the store built before the token existed sees it now');
  assert.equal(voice.ready, true);
  delete process.env['EPISODES_READ_WRITE_TOKEN'];
  assert.equal(ep.ready, false);
  await assert.rejects(ep.uploadToken('x.mp3', { maxBytes: 1, types: ['audio/mpeg'] }), /not connected/);
  // an explicit string still behaves as before
  assert.equal(blobStorage('fixed').ready, true);
});

test('G-M32-D15a one JSON line with level, event, time, requestId and fields', () => {
  delete process.env['LOG_LEVEL']; const lines = capture();
  log.info('thing_happened', { requestId: 'r-1', count: 3 });
  log.warn('w'); log.error('e');
  assert.equal(lines.length, 3);
  const o = lines[0]!.obj;
  assert.equal(o['level'], 'info'); assert.equal(o['event'], 'thing_happened'); assert.equal(o['requestId'], 'r-1'); assert.equal(o['count'], 3);
  assert.ok(!Number.isNaN(Date.parse(String(o['time']))));
  assert.deepEqual(lines.map((l) => l.level), ['info', 'warn', 'error']);
});

test('G-M32-D15b LOG_LEVEL filters; default is info', () => {
  const lines = capture();
  delete process.env['LOG_LEVEL']; log.debug('d'); assert.equal(lines.length, 0);
  process.env['LOG_LEVEL'] = 'error'; log.info('i'); log.warn('w'); log.error('e');
  assert.deepEqual(lines.map((l) => l.obj['event']), ['e']);
  process.env['LOG_LEVEL'] = 'debug'; log.debug('d2'); assert.equal(lines.at(-1)!.obj['event'], 'd2');
});

test('G-M32-D15c tokens, bearer text and secret-named fields are not printed', () => {
  const lines = capture();
  log.error('x', { authorization: 'Bearer abc.def', token: 'sekret-value', password: 'pw', note: 'sent Bearer topsecret123 to a@b.com', nested: { apiKey: 'k' }, error: new Error('failed for a@b.com') });
  const raw = lines[0]!.raw;
  for (const bad of ['abc.def', 'sekret-value', 'pw"', 'topsecret123', 'a@b.com', '"k"']) assert.ok(!raw.includes(bad), `${bad} leaked: ${raw}`);
});

test('G-M32-D15d swallow() keeps going and leaves a warn line', async () => {
  const lines = capture();
  const r = await Promise.reject(new Error('boom')).catch(swallow('some_cleanup', { requestId: 'r-2' }));
  assert.equal(r, undefined);
  assert.equal(lines[0]!.level, 'warn'); assert.equal(lines[0]!.obj['event'], 'some_cleanup'); assert.equal(lines[0]!.obj['requestId'], 'r-2');
  assert.match(String(lines[0]!.obj['error']), /boom/);
});
