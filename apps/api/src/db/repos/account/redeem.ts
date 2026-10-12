// Redeem codes: the owner gives PLUS days or a paid show for free; each account uses a code once.
/**
 * M24 US15 (spec 025, lane A3). A redeem code is a free grant made by the owner in Admin — never a
 * sale, so no money moves (constitution 2.1.0: paid extras are sold only through the stores).
 *
 *  - The code is 12 symbols from an alphabet with no 0/O, 1/I/L (31 symbols, about 59 bits).
 *    The phone may send it with spaces, dashes or in lower case; `normalizeCode` removes them.
 *  - Lookup is by the code hash (sha256 of the code), and the stored code is then compared with
 *    `timingSafeEqual`, so no step compares the typed code character by character.
 *  - Guard G-M24-A3-1: the use record (code, listener) is claimed with a condition, which is what makes
 *    "one use per account" true; a second use finds it and is refused. The whole redeem is one
 *    transaction: a refusal after that claim (used up, already own the show) leaves nothing
 *    behind, so the code stays usable for this account.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { viaStore } from '../../backend.ts';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REDEEM_CODE_LENGTH = 12;
export const MAX_PLUS_DAYS = 3650;

export type Grant = { kind: 'plus'; days: number } | { kind: 'show'; feedUrl: string };

export function newRedeemCode(): string {
  let out = '';
  for (let i = 0; i < REDEEM_CODE_LENGTH; i++) out += ALPHABET.charAt(randomInt(0, ALPHABET.length));
  return out;
}

/** "abcd-efgh ijkl" → "ABCDEFGHIJKL"; undefined when it cannot be a code. */
export function normalizeCode(raw: string): string | undefined {
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6,32}$/.test(code) ? code : undefined;
}

export const codeHashOf = (code: string): Buffer => createHash('sha256').update(code, 'utf8').digest();

/** Constant-time compare of two codes (lengths are not secret: the hash already matched). */
export function sameCode(stored: string, typed: string): boolean {
  const a = Buffer.from(stored.toUpperCase(), 'utf8');
  const b = Buffer.from(typed, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The grant as stored; a row that is not a valid grant is treated as no code. */
export function parseGrant(v: unknown): Grant | undefined {
  const o = typeof v === 'string' ? safeJson(v) : v;
  if (!o || typeof o !== 'object') return undefined;
  const g = o as Record<string, unknown>;
  if (g['kind'] === 'plus' && Number.isInteger(g['days']) && (g['days'] as number) >= 1 && (g['days'] as number) <= MAX_PLUS_DAYS) return { kind: 'plus', days: g['days'] as number };
  if (g['kind'] === 'show' && typeof g['feedUrl'] === 'string' && g['feedUrl'].length > 0) return { kind: 'show', feedUrl: g['feedUrl'] };
  return undefined;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

export type Redeemed = { kind: 'plus'; days: number; /** Fix F-S: when this code's days begin */ startsAt: string; until: string | null } | { kind: 'show'; feedUrl: string; title: string | null };

/** POST /v1/me/redeem — one transaction; see the file comment for the order of the checks. */
export const redeemCode = viaStore<typeof import('./paid-ddb/redeem.ts').redeemCode>('pd/redeem', 'redeemCode');

// ---- Admin ----

export type CodeInput = { grant: Grant; count: number; maxUses: number; note: string; expiresAt: string | null; createdBy: string };

/** Makes `count` new codes with the same grant; returns them in the order made. */
export const createCodes = viaStore<typeof import('./paid-ddb/redeem.ts').createCodes>('pd/redeem', 'createCodes');

export type CodeListItem = {
  code: string; kind: 'plus' | 'show'; days: number | null; feedUrl: string | null; showTitle: string | null;
  uses: number; maxUses: number; note: string; createdAt: string; expiresAt: string | null; disabled: boolean;
};

export const listCodes = viaStore<typeof import('./paid-ddb/redeem.ts').listCodes>('pd/redeem', 'listCodes');

export const codeState = viaStore<typeof import('./paid-ddb/redeem.ts').codeState>('pd/redeem', 'codeState');

/** Switches a code off; uses already made keep what they gave. False when there is no such code. */
export const disableCode = viaStore<typeof import('./paid-ddb/redeem.ts').disableCode>('pd/redeem', 'disableCode');

// M26 lane ST: the show's title (override, else Studio-made show) and the priced shows are lane ST's items (studio/ddb/hosted.ts).
export const showTitle = viaStore<typeof import('../studio/ddb/hosted.ts').codeShowTitle>('st/hosted', 'codeShowTitle');
export const paidShows = viaStore<typeof import('../studio/ddb/hosted.ts').paidShows>('st/hosted', 'paidShows');
