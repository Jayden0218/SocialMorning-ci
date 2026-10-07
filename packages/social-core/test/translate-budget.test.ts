// Tests the Groq budget (90 % of every free limit) and the transcript chunker.
/**
 * M22 US13 — guard G-M22-6: the server never spends more than 90 % of a Groq free limit, and asks
 * for nothing once the budget is spent. Break: in src/translate-budget.ts set BUDGET_SHARE to 1
 * (or make `within` compare against the full limit) — the "never above 90 %" tests go red.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUDGET_SHARE, CHUNK_MAX_TOKENS, GROQ_LIMITS, PROMPT_TOKENS, TRANSLATOR, WHISPER,
  budgetOf, canSpend, chunkLines, estimateTokens, fitsEver, translationCost,
} from '../src/translate-budget.ts';

test('the limits are the free tier read in research R1, and the share is 90 %', () => {
  assert.deepEqual(GROQ_LIMITS[WHISPER], { rpm: 20, rpd: 2_000, audioSPerHour: 7_200, audioSPerDay: 28_800 });
  assert.deepEqual(GROQ_LIMITS[TRANSLATOR], { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 });
  assert.equal(BUDGET_SHARE, 0.9);
  assert.deepEqual([budgetOf(28_800), budgetOf(200_000), budgetOf(8_000), budgetOf(7_200), budgetOf(2_000), budgetOf(1_000)], [25_920, 180_000, 7_200, 6_480, 1_800, 900]);
});

test('G-M22-6: speech-to-text stops at 25,920 audio-seconds a day — never 100 %', () => {
  assert.equal(canSpend({ requests: 0, audioS: 25_920 - 3_600 }, WHISPER, { audioS: 3_600 }), true);
  assert.equal(canSpend({ requests: 0, audioS: 25_920 - 3_599 }, WHISPER, { audioS: 3_600 }), false);
  // Spend hour-long episodes until refused: the total never passes 90 % of the day's limit.
  let used = 0;
  let calls = 0;
  while (canSpend({ requests: calls, audioS: used }, WHISPER, { audioS: 3_600 })) { used += 3_600; calls++; }
  assert.ok(used <= 0.9 * 28_800, `spent ${used}`);
  assert.equal(calls, 7);
  assert.equal(canSpend({ requests: calls, audioS: used }, WHISPER, { audioS: 1 }), true, 'small calls still fit under the cap');
  assert.equal(canSpend({ requests: 0, audioS: 25_920 }, WHISPER, { audioS: 1 }), false, 'a spent budget asks for nothing');
});

test('G-M22-6: translation stops at 180,000 tokens a day and 7,200 a minute', () => {
  assert.equal(canSpend({ requests: 0, tokens: 175_000 }, TRANSLATOR, { tokens: 5_000 }), true);
  assert.equal(canSpend({ requests: 0, tokens: 175_001 }, TRANSLATOR, { tokens: 5_000 }), false);
  assert.equal(canSpend({ requests: 0 }, TRANSLATOR, { tokens: 7_200 }), true);
  assert.equal(canSpend({ requests: 0 }, TRANSLATOR, { tokens: 7_201 }), false, 'one call over the minute budget');
  assert.equal(canSpend({ requests: 0, tokensLastMinute: 7_000 }, TRANSLATOR, { tokens: 201 }), false);
  assert.equal(canSpend({ requests: 0, tokensLastMinute: 7_000 }, TRANSLATOR, { tokens: 200 }), true);
});

test('requests per day and per minute stop at 90 % too; one request is the default', () => {
  assert.equal(canSpend({ requests: 1_799 }, WHISPER, {}), true);
  assert.equal(canSpend({ requests: 1_800 }, WHISPER, {}), false);
  assert.equal(canSpend({ requests: 899 }, TRANSLATOR, { tokens: 10 }), true);
  assert.equal(canSpend({ requests: 900 }, TRANSLATOR, { tokens: 10 }), false);
  assert.equal(canSpend({ requests: 0, requestsLastMinute: 17 }, WHISPER, { audioS: 10 }), true);
  assert.equal(canSpend({ requests: 0, requestsLastMinute: 18 }, WHISPER, { audioS: 10 }), false);
  assert.equal(canSpend({ requests: 0 }, WHISPER, { requests: 19 }), false, 'more than 18 a minute at once');
});

test('audio per hour: 6,480 seconds', () => {
  assert.equal(canSpend({ requests: 0 }, WHISPER, { audioS: 6_480 }), true);
  assert.equal(canSpend({ requests: 0 }, WHISPER, { audioS: 6_481 }), false);
  assert.equal(canSpend({ requests: 0, audioSLastHour: 6_000 }, WHISPER, { audioS: 481 }), false);
});

test('a negative need is refused (never a way to un-spend)', () => {
  assert.equal(canSpend({ requests: 0 }, WHISPER, { requests: -1 }), false);
  assert.equal(canSpend({ requests: 0 }, WHISPER, { audioS: -1 }), false);
  assert.equal(canSpend({ requests: 0 }, TRANSLATOR, { tokens: -1 }), false);
});

test('limits a model does not have are not checked (no audio limit on the translator)', () => {
  assert.equal(canSpend({ requests: 0 }, TRANSLATOR, { audioS: 1_000_000 }), true);
  assert.equal(canSpend({ requests: 0 }, WHISPER, { tokens: 1_000_000 }), true);
});

test('fitsEver: an episode longer than the hourly audio budget can never be sent', () => {
  assert.equal(fitsEver(WHISPER, { audioS: 3_600 }), true);
  assert.equal(fitsEver(WHISPER, { audioS: 7_200 }), false);
  assert.equal(fitsEver(TRANSLATOR, { tokens: translationCost(CHUNK_MAX_TOKENS) }), true, 'a full chunk always fits a minute');
});

test('estimateTokens over-counts: one per CJK character, one per 3 others, 4 for the frame', () => {
  assert.equal(estimateTokens(''), 4);
  assert.equal(estimateTokens('abc'), 5);
  assert.equal(estimateTokens('abcd'), 6);
  assert.equal(estimateTokens('你好'), 6);
  assert.equal(estimateTokens('你好 abc'), 2 + 2 + 4);
});

test('chunkLines: in order, each chunk ≤ the limit, an oversize line alone, input untouched', () => {
  assert.deepEqual(chunkLines([]), []);
  const lines = [{ id: 0, text: 'a'.repeat(30) }, { id: 1, text: 'b'.repeat(30) }, { id: 2, text: 'c'.repeat(300) }, { id: 3, text: 'd' }];
  const copy = lines.map((l) => ({ ...l }));
  const chunks = chunkLines(lines, 40);
  assert.deepEqual(chunks.map((c) => c.map((l) => l.id)), [[0, 1], [2], [3]]);
  assert.deepEqual(lines, copy);
  for (const c of chunks.filter((x) => x.length > 1)) assert.ok(c.reduce((s, l) => s + estimateTokens(l.text), 0) <= 40);
  // Default limit: 2,500 tokens.
  const many = Array.from({ length: 1_000 }, (_, i) => ({ id: i, text: 'x'.repeat(27) })); // 13 tokens each
  const d = chunkLines(many);
  assert.equal(d.flat().length, 1_000);
  for (const c of d) assert.ok(c.reduce((s, l) => s + estimateTokens(l.text), 0) <= CHUNK_MAX_TOKENS);
  assert.equal(d[0]!.length, Math.floor(CHUNK_MAX_TOKENS / 13));
});

test('translationCost: the chunk in, about as much out, and the prompt', () => {
  assert.equal(translationCost(1_000), 2_000 + PROMPT_TOKENS);
});
