// Keeps the teen-mode passcode as a salted SHA-256 hash, and counts wrong tries (5 → 15 minutes).
/**
 * M19 T090 (US9, FR-061, research R12): teen mode (the Minor mode switch) can only be turned off
 * with the 4-digit passcode set when it was turned on. Kept on this phone only, in the settings
 * table: never the digits, only `sha256(salt + ":" + digits)` in hex, with a random salt per
 * passcode.
 *
 * Why this hash: there is no crypto package in the app (no `expo-crypto`; owner rule: no new
 * dependencies), and `fnv1a64` in social-core is explicitly not a cryptographic hash. So SHA-256
 * is written out here (FIPS 180-4, on UTF-16 code units < 128 — the input is digits, a colon and
 * a hex salt), checked against the standard test vector in __tests__/m19-teen-passcode.test.ts.
 * The salt comes from `crypto.getRandomValues` when the runtime has it, else `Math.random`: it
 * only has to differ between phones, not be secret.
 *
 * Honest limit: 4 digits are 10 000 choices, so the hash stops a glance at the settings table,
 * not a determined attack on a phone already in hand. The real lock is the wait: 5 wrong tries
 * in a row → no more tries for 15 minutes. "Forgot passcode?" resets it with a code emailed to
 * the account (POST /v1/me/teen-reset/start + /check).
 */
import type { SettingsStore } from '@/storage/types';

const HASH = 'teen.passHash';
const SALT = 'teen.passSalt';
const FAILS = 'teen.fails';
const UNTIL = 'teen.lockedUntil';

export const PASSCODE_LENGTH = 4;
export const MAX_TRIES = 5;
export const LOCK_MS = 15 * 60_000;

/** Exactly four digits. */
export const isPasscode = (s: string): boolean => /^\d{4}$/.test(s);

export function hasPasscode(s: Pick<SettingsStore, 'get'>): boolean {
  return (s.get(HASH) ?? '') !== '';
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function setPasscode(s: SettingsStore, digits: string): void {
  const salt = randomSalt();
  s.set(SALT, salt);
  s.set(HASH, sha256(`${salt}:${digits}`));
  s.set(FAILS, '0');
  s.set(UNTIL, '0');
}

export function clearPasscode(s: SettingsStore): void {
  s.set(HASH, '');
  s.set(SALT, '');
  s.set(FAILS, '0');
  s.set(UNTIL, '0');
}

/** When tries open again (epoch ms), or undefined if they are open now. */
export function lockedUntil(s: Pick<SettingsStore, 'get'>, now: number): number | undefined {
  const until = Number(s.get(UNTIL) ?? '0');
  return until > now ? until : undefined;
}

export type CheckResult = { kind: 'ok' } | { kind: 'wrong'; left: number } | { kind: 'locked'; until: number };

/** Check a try. A right one resets the count; the 5th wrong one in a row locks for 15 minutes. */
export function checkPasscode(s: SettingsStore, digits: string, now: number): CheckResult {
  const until = lockedUntil(s, now);
  if (until !== undefined) return { kind: 'locked', until };
  const salt = s.get(SALT) ?? '';
  if (sha256(`${salt}:${digits}`) === s.get(HASH)) {
    s.set(FAILS, '0');
    return { kind: 'ok' };
  }
  const fails = Number(s.get(FAILS) ?? '0') + 1;
  if (fails >= MAX_TRIES) {
    s.set(FAILS, '0');
    s.set(UNTIL, String(now + LOCK_MS));
    return { kind: 'locked', until: now + LOCK_MS };
  }
  s.set(FAILS, String(fails));
  return { kind: 'wrong', left: MAX_TRIES - fails };
}

// --- SHA-256 (FIPS 180-4) ----------------------------------------------------------------------

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** UTF-8 bytes of a string (the inputs here are ASCII; anything else is still encoded properly). */
function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

/** SHA-256 of a string's UTF-8 bytes, as 64 hex characters. */
export function sha256(text: string): string {
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // The length as a 64-bit big-endian number (the high word is 0 for anything under 512 MB).
  const hi = Math.floor(bitLength / 0x1_0000_0000);
  for (const word of [hi, bitLength >>> 0]) bytes.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);

  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((bytes[j]! << 24) | (bytes[j + 1]! << 16) | (bytes[j + 2]! << 8) | bytes[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0; h[1] = (h[1]! + b) >>> 0; h[2] = (h[2]! + c) >>> 0; h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0; h[5] = (h[5]! + f) >>> 0; h[6] = (h[6]! + g) >>> 0; h[7] = (h[7]! + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}
