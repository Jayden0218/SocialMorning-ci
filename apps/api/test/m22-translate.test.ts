// Tests the translated transcript with a fake Groq: PLUS and allow-list only, one call per run, never past 90 % of a free limit.
/**
 * M22 US13 (FR-038–FR-041; contracts/api.md "Translation"). Guards:
 * - G-M22-6: no Groq call when it would pass 90 % of a free limit; the ledger records every call.
 *   Break: set BUDGET_SHARE to 1 in packages/social-core/src/translate-budget.ts → the "spent" case
 *   below calls Groq and goes red (the pure cases are in social-core's translate-budget.test.ts).
 * - G-M22-7: translation is offered only to PLUS members, only on allow-listed shows.
 *   Break: drop the `hasPlus` line in gate() in src/translate/routes.ts → the 403 case goes red.
 * The real Groq is NEVER called here: every request goes to the fake below.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminSetup, aCall } from './admin-harness.ts';
import { signUp, TEST_PEPPER, type TestDb } from './harness.ts';
import { createApp } from '../src/app.ts';
import { retryAfterSeconds } from '../src/translate/groq.ts';
import { parseTimedTranscript } from '../src/translate/job.ts';

test('a publisher\'s own transcript (SRT, VTT, JSON) becomes segments — then no speech-to-text is needed', () => {
  const srt = '1\n00:00:01,500 --> 00:00:04,000\nBonjour\n\n2\n00:00:04,000 --> 00:00:06,250\n<i>à tous</i>\n';
  assert.deepEqual(parseTimedTranscript(srt, 'application/srt'), [{ start: 1.5, end: 4, text: 'Bonjour' }, { start: 4, end: 6.25, text: 'à tous' }]);
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.500\nSalut\n';
  assert.deepEqual(parseTimedTranscript(vtt, 'text/vtt'), [{ start: 1, end: 2.5, text: 'Salut' }]);
  const json = JSON.stringify({ segments: [{ startTime: 0, endTime: 2, body: 'Un' }, { startTime: 2, body: 'Deux' }, { startTime: 3, body: ' ' }] });
  assert.deepEqual(parseTimedTranscript(json, 'application/json'), [{ start: 0, end: 2, text: 'Un' }, { start: 2, end: 7, text: 'Deux' }]);
  assert.deepEqual(parseTimedTranscript('not json', 'application/json'), []);
});

const JOB = 'job-token-not-secret';
const FEED = 'https://foreign.example.com/feed.xml';
const OTHER = 'https://other.example.com/feed.xml';

type Call = { url: string; model: string; audioUrl?: string; lines?: { id: number; text: string }[] };

function fakeGroq(o: { status?: number } = {}) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.groq.com/')) throw new Error(`unexpected fetch ${url}`);
    if (o.status) return new Response('slow down', { status: o.status, headers: { 'retry-after': '120' } });
    if (url.endsWith('/audio/transcriptions')) {
      const form = init!.body as FormData;
      calls.push({ url, model: String(form.get('model')), audioUrl: String(form.get('url')) });
      assert.equal(form.get('response_format'), 'verbose_json');
      assert.equal(form.get('timestamp_granularities[]'), 'segment');
      return Response.json({ duration: 600, segments: [{ start: 0, end: 4.5, text: 'Bonjour à tous' }, { start: 4.5, end: 9, text: 'Bienvenue' }, { start: 9, end: 12, text: 'À bientôt' }] });
    }
    const body = JSON.parse(String(init!.body)) as { model: string; response_format: { type: string; json_schema: { strict: boolean } }; messages: { content: string }[] };
    assert.deepEqual([body.response_format.type, body.response_format.json_schema.strict], ['json_schema', true]);
    const lines = (JSON.parse(body.messages[1]!.content) as { lines: { id: number; text: string }[] }).lines;
    calls.push({ url, model: body.model, lines });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ lines: lines.map((l) => ({ id: l.id, text: `EN ${l.text}` })) }) } }], usage: { total_tokens: 321 } });
  }) as typeof fetch;
  return { f, calls };
}

async function episode(t: TestDb, id: string, feedUrl: string, durationMs: number | null = 600_000) {
  await t.q('INSERT INTO episodes (id, feed_url, guid, title, show_title, enclosure_url, duration_ms) VALUES ($1, $2, $1, $3, $4, $5, $6)',
    [id, feedUrl, `Episode ${id}`, 'Le Show', `https://cdn.example.com/${id}.mp3`, durationMs]);
}
const plus = (t: TestDb, id: string) => t.q("INSERT INTO entitlements (listener_id, kind, ref, until) VALUES ($1, 'plus', '', '2099-01-01')", [id]);
const step = async (t: TestDb) => ((await (await t.call('POST', '/v1/internal/rebuild', { step: 'translate' }, undefined, { authorization: `Bearer ${JOB}` })).json()) as { counts: Record<string, number> }).counts;

test('G-M22-7: offered only on allow-listed shows (set in /mod) and only to PLUS', async () => {
  const g = fakeGroq();
  const { t, owner, other } = await adminSetup({ jobToken: JOB, groqFetch: g.f, groqKey: 'test-key' });
  await episode(t, 'e1', FEED);
  await episode(t, 'x1', OTHER);
  const p = await signUp(t, 'p@example.com', 'Plus');
  const n = await signUp(t, 'n@example.com', 'Free');
  await plus(t, p.id);

  assert.equal((await t.call('GET', '/v1/episodes/e1/translation?lang=en', undefined, p.token)).status, 404, 'not on the allow-list yet');
  assert.equal((await aCall(t, 'PUT', `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`, other)).status, 403, 'not an admin');
  assert.equal((await aCall(t, 'PUT', `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`, owner)).status, 204);
  const list = (await (await aCall(t, 'GET', '/v1/mod/translation-shows', owner)).json()) as { items: { feedUrl: string }[] };
  assert.deepEqual(list.items.map((i) => i.feedUrl), [FEED]);

  const free = await t.call('GET', '/v1/episodes/e1/translation?lang=en', undefined, n.token);
  assert.equal(free.status, 403);
  assert.equal(((await free.json()) as { error: string }).error, 'plus_required');
  assert.equal((await t.call('POST', '/v1/episodes/e1/translation', { lang: 'en' }, n.token)).status, 403);
  assert.equal((await t.q('SELECT 1 FROM translation_jobs')).length, 0, 'nothing queued for a free listener');
  const notOffered = await t.call('POST', '/v1/episodes/x1/translation', { lang: 'en' }, p.token);
  assert.equal(notOffered.status, 404);
  assert.equal(((await notOffered.json()) as { error: string }).error, 'not_offered');
  assert.equal((await t.call('GET', '/v1/episodes/e1/translation?lang=en')).status, 401);
  assert.equal((await t.call('GET', '/v1/episodes/e1/translation?lang=fr', undefined, p.token)).status, 422);
  assert.equal(g.calls.length, 0);
  await t.close();
});

test('a PLUS request: queued (202 + etaHours), speech-to-text by URL, then translation; stored once and shared', async () => {
  const g = fakeGroq();
  const { t, owner } = await adminSetup({ jobToken: JOB, groqFetch: g.f, groqKey: 'test-key' });
  await episode(t, 'e1', FEED);
  await aCall(t, 'PUT', `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`, owner);
  const p = await signUp(t, 'p@example.com', 'Plus');
  const q = await signUp(t, 'q@example.com', 'Plus Two');
  await plus(t, p.id);
  await plus(t, q.id);

  assert.deepEqual(await (await t.call('GET', '/v1/episodes/e1/translation?lang=en', undefined, p.token)).json(), { state: 'none' });
  const asked = await t.call('POST', '/v1/episodes/e1/translation', { lang: 'en' }, p.token);
  assert.equal(asked.status, 202);
  const a = (await asked.json()) as { state: string; etaHours: number };
  assert.equal(a.state, 'queued');
  assert.ok(a.etaHours >= 1);
  assert.equal((await t.call('POST', '/v1/episodes/e1/translation', { lang: 'en' }, q.token)).status, 202, 'idempotent');
  assert.equal((await t.q('SELECT 1 FROM translation_jobs')).length, 1);

  assert.deepEqual(await step(t), { transcribed: 1 });
  assert.deepEqual(g.calls.map((c) => [c.model, c.audioUrl]), [['whisper-large-v3', 'https://cdn.example.com/e1.mp3']], 'Groq fetches the publisher\'s audio; we never download it');
  assert.equal((await t.call('GET', '/v1/episodes/e1/translation?lang=en', undefined, p.token)).status, 202);
  assert.deepEqual(await step(t), { done: 1 });
  assert.equal(g.calls[1]!.model, 'openai/gpt-oss-120b');
  assert.deepEqual(g.calls[1]!.lines!.map((l) => l.id), [0, 1, 2]);

  const done = (await (await t.call('GET', '/v1/episodes/e1/translation?lang=en', undefined, q.token)).json()) as { state: string; lines: { s: number; e: number; o: string; t: string }[] };
  assert.equal(done.state, 'done');
  assert.deepEqual(done.lines[0], { s: 0, e: 4500, o: 'Bonjour à tous', t: 'EN Bonjour à tous' });
  assert.equal(done.lines.length, 3);
  const usage = await t.q<{ model: string; requests: number; audio_s: number; tokens: number }>('SELECT model, requests, audio_s, tokens FROM groq_usage ORDER BY model');
  assert.deepEqual(usage.map((u) => [u.model, u.requests, u.audio_s, u.tokens]), [['openai/gpt-oss-120b', 1, 0, 321], ['whisper-large-v3', 1, 600, 0]]);
  const mod = (await (await aCall(t, 'GET', '/v1/mod/translation-usage', owner)).json()) as { models: { model: string; audioS: number; budget: { audioS?: number } }[] };
  assert.deepEqual(mod.models.find((m) => m.model === 'whisper-large-v3'), { model: 'whisper-large-v3', requests: 1, audioS: 600, tokens: 0, budget: { requests: 1_800, audioS: 25_920 } });
  assert.deepEqual(await step(t), { nothing: 1 }, 'nothing left: no call');
  assert.equal(g.calls.length, 2);
  await t.close();
});

test('G-M22-6: with the day\'s budget spent there is no Groq call; a 429 parks the job; no key keeps jobs queued', async () => {
  const g = fakeGroq();
  const { t, owner } = await adminSetup({ jobToken: JOB, groqFetch: g.f, groqKey: 'test-key' });
  await episode(t, 'e1', FEED, 3_600_000);
  await aCall(t, 'PUT', `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`, owner);
  const p = await signUp(t, 'p@example.com', 'Plus');
  await plus(t, p.id);
  await t.call('POST', '/v1/episodes/e1/translation', { lang: 'en' }, p.token);
  // 25,920 is 90 % of 28,800 audio-seconds: an hour more would pass it.
  await t.q("INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ((now() AT TIME ZONE 'UTC')::date, 'whisper-large-v3', 5, 23_000, 0)");
  assert.deepEqual(await step(t), { waiting: 1 });
  assert.equal(g.calls.length, 0, 'no call when the budget is spent');
  const [j] = await t.q<{ state: string }>('SELECT state FROM translation_jobs');
  assert.equal(j!.state, 'queued');
  // The next day (a fresh ledger row), it goes.
  await t.q('DELETE FROM groq_usage');
  assert.deepEqual(await step(t), { transcribed: 1 });
  // The translator's day spent too.
  await t.q("INSERT INTO groq_usage (day, model, requests, audio_s, tokens) VALUES ((now() AT TIME ZONE 'UTC')::date, 'openai/gpt-oss-120b', 1, 0, 179_900)");
  assert.deepEqual(await step(t), { waiting: 1 });
  assert.equal(g.calls.length, 1);
  await t.close();

  // A 429: Groq's retry-after is honoured.
  const slow = fakeGroq({ status: 429 });
  const s = await adminSetup({ jobToken: JOB, groqFetch: slow.f, groqKey: 'test-key' });
  await episode(s.t, 'e1', FEED);
  await aCall(s.t, 'PUT', `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`, s.owner);
  const sp = await signUp(s.t, 'p@example.com', 'Plus');
  await plus(s.t, sp.id);
  await s.t.call('POST', '/v1/episodes/e1/translation', { lang: 'en' }, sp.token);
  assert.deepEqual(await step(s.t), { rate_limited: 1 });
  const [parked] = await s.t.q<{ wait: number }>('SELECT extract(epoch FROM not_before - now())::int AS wait FROM translation_jobs');
  assert.ok(parked!.wait > 100 && parked!.wait <= 120, `parked ${parked!.wait} s`);
  assert.deepEqual(await step(s.t), { nothing: 1 }, 'parked jobs are not picked');
  assert.deepEqual([retryAfterSeconds(null), retryAfterSeconds('7'), retryAfterSeconds('soon')], [60, 7, 60]);

  // No GROQ_API_KEY: nothing is called and the job stays queued.
  const keyless = createApp({ db: s.t.db, pepper: TEST_PEPPER, jobToken: JOB, groqFetch: slow.f, groqKey: '' });
  const r = await keyless.request('/v1/internal/rebuild', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${JOB}` }, body: JSON.stringify({ step: 'translate' }) });
  assert.deepEqual(((await r.json()) as { counts: unknown }).counts, { no_key: 1 });
  await s.t.close();
});
