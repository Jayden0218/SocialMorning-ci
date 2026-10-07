// Keeps Groq calls under 90 % of the free limits and cuts a transcript into chunks for translation.
/**
 * M22 US13 (research R1, constitution 3.3.0, guard G-M22-6). Groq's free tier is shared by the
 * whole organisation, so the server keeps its own ledger (`groq_usage`, one row per UTC day and
 * model) and never asks for more than 90 % of any limit. Nothing here does I/O: the caller reads
 * the ledger, asks `canSpend`, and only then calls Groq.
 *
 * Limits read on console.groq.com/docs/rate-limits (2026-10-07):
 *  - whisper-large-v3:     20 requests/min, 2,000 requests/day, 7,200 audio-s/hour, 28,800 audio-s/day
 *  - openai/gpt-oss-120b:  30 requests/min, 1,000 requests/day, 8,000 tokens/min, 200,000 tokens/day
 */
export const WHISPER = 'whisper-large-v3';
export const TRANSLATOR = 'openai/gpt-oss-120b';
export type GroqModel = typeof WHISPER | typeof TRANSLATOR;

export type GroqLimits = { rpm: number; rpd: number; audioSPerHour?: number; audioSPerDay?: number; tpm?: number; tpd?: number };

export const GROQ_LIMITS: Record<GroqModel, GroqLimits> = {
  [WHISPER]: { rpm: 20, rpd: 2_000, audioSPerHour: 7_200, audioSPerDay: 28_800 },
  [TRANSLATOR]: { rpm: 30, rpd: 1_000, tpm: 8_000, tpd: 200_000 },
};

/** The share of every free limit the server allows itself (G-M22-6: never 100 %). */
export const BUDGET_SHARE = 0.9;

/** One chunk of transcript lines sent for translation stays at or under this many tokens. */
export const CHUNK_MAX_TOKENS = 2_500;

/** 90 % of a limit, rounded down: 28,800 → 25,920; 200,000 → 180,000; 8,000 → 7,200. */
export const budgetOf = (limit: number): number => Math.floor(limit * BUDGET_SHARE);

/**
 * What has been spent. `requests`, `audioS`, `tokens` are today's (UTC) totals from the ledger;
 * the window fields are the last minute / hour when the caller knows them (default 0 — the job
 * takes at most one step per hourly run, so a single call is the whole window).
 */
export type GroqUsage = { requests: number; audioS?: number; tokens?: number; requestsLastMinute?: number; audioSLastHour?: number; tokensLastMinute?: number };

/** What the next call will cost: one request by default, plus its audio seconds or tokens. */
export type GroqNeed = { requests?: number; audioS?: number; tokens?: number };

const within = (used: number, need: number, limit: number | undefined): boolean =>
  limit === undefined || used + need <= budgetOf(limit);

/** True only when this call keeps every limit of this model at or under 90 %. */
export function canSpend(usage: GroqUsage, model: GroqModel, need: GroqNeed): boolean {
  const l = GROQ_LIMITS[model];
  const req = need.requests ?? 1;
  const audio = need.audioS ?? 0;
  const tokens = need.tokens ?? 0;
  if (req < 0 || audio < 0 || tokens < 0) return false;
  return within(usage.requests, req, l.rpd)
    && within(usage.requestsLastMinute ?? 0, req, l.rpm)
    && within(usage.audioS ?? 0, audio, l.audioSPerDay)
    && within(usage.audioSLastHour ?? 0, audio, l.audioSPerHour)
    && within(usage.tokens ?? 0, tokens, l.tpd)
    && within(usage.tokensLastMinute ?? 0, tokens, l.tpm);
}

/** Whether a call this big could pass on an empty ledger — if not, waiting never helps (e.g. a 3-hour episode). */
export function fitsEver(model: GroqModel, need: GroqNeed): boolean {
  return canSpend({ requests: 0 }, model, need);
}

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;

/**
 * A safe over-estimate of tokens: one per CJK character, one per 3 other characters, plus 4 for
 * the line's id and JSON punctuation. Over-counting only makes chunks smaller.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 3) + 4;
}

/**
 * Cuts lines, in order, into chunks of at most `maxTokens` estimated tokens. A line bigger than
 * the limit on its own goes alone (its timing is never split). Never mutates its input.
 */
export function chunkLines<T extends { text: string }>(lines: readonly T[], maxTokens: number = CHUNK_MAX_TOKENS): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const line of lines) {
    const t = estimateTokens(line.text);
    if (cur.length > 0 && size + t > maxTokens) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(line);
    size += t;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * Tokens one translation call is charged for: the chunk in, about the same out, and the prompt.
 * Groq counts input and output against the same per-minute and per-day limits.
 */
export const PROMPT_TOKENS = 200;
export function translationCost(chunkTokens: number): number {
  return 2 * chunkTokens + PROMPT_TOKENS;
}
