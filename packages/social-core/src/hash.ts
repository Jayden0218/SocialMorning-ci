/**
 * A deterministic string hash that runs on the phone (research R6).
 *
 * `parseFeed` needs a digest for `contentHash` and for episode ids, and
 * `node:crypto` does not exist in React Native. Rather than add a crypto
 * dependency for a non-security purpose, this is FNV-1a 64 computed in two
 * 32-bit lanes — JavaScript's bitwise operators are 32-bit, so a naive
 * 64-bit FNV written with `*` silently loses precision above 2^53 and stops
 * being FNV at all.
 *
 * This is NOT a cryptographic hash and must never be used as one. Its job is
 * to answer "did this episode change since the last poll", where a collision
 * costs one missed update, not a security property.
 */
const OFFSET_HI = 0xcbf2_9ce4;
const OFFSET_LO = 0x84222325;
const PRIME_LO = 0x1b3;
const PRIME_HI = 0x100;

export function fnv1a64(input: string): string {
  let hi = OFFSET_HI >>> 0;
  let lo = OFFSET_LO >>> 0;

  for (let i = 0; i < input.length; i++) {
    // UTF-16 code units, folded a byte at a time so that a character outside
    // Latin-1 changes the digest rather than being truncated into a clash.
    const code = input.charCodeAt(i);
    lo = (lo ^ (code & 0xff)) >>> 0;
    [hi, lo] = multiply(hi, lo);
    const high = (code >>> 8) & 0xff;
    lo = (lo ^ high) >>> 0;
    [hi, lo] = multiply(hi, lo);
  }

  return hex(hi) + hex(lo);
}

/**
 * (hi:lo) * (PRIME_HI:PRIME_LO) mod 2^64.
 *
 * Since PRIME_HI*2^32 * hi*2^32 overflows past 2^64 and vanishes, the whole
 * product is `2^32 * (hi*PRIME_LO + lo*PRIME_HI + carry) + (lo*PRIME_LO mod 2^32)`.
 * Every intermediate here is below 2^42, so each one is an EXACT integer in a
 * double — which is the part a hand-rolled version gets wrong. An earlier
 * 16-bit-lane attempt in this file mismatched a BigInt reference on the very
 * first sample; `__tests__/hash-reference.test.ts` is what caught it and is
 * why it stays in the suite.
 */
function multiply(hi: number, lo: number): [number, number] {
  const loProduct = lo * PRIME_LO;
  const carry = Math.floor(loProduct / 0x1_0000_0000);
  return [(hi * PRIME_LO + lo * PRIME_HI + carry) >>> 0, loProduct >>> 0];
}

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

/** The digest `parseFeed` and the stores are given. 16 hex characters. */
export const hash = fnv1a64;
