/**
 * The device-side hash has to agree with itself forever: it produces episode
 * ids and `contentHash` values that are compared across polls and, in M3,
 * across devices. A hash that drifts re-imports every episode as new.
 *
 * So it is checked against an independent BigInt implementation rather than
 * against itself. That was not ceremony: the first version of `multiply` in
 * `src/feeds/hash.ts` used 16-bit lanes and disagreed with this reference on
 * the very first sample. This test is why that shipped as a bug fix instead
 * of as a silent wrong answer.
 */
import { fnv1a64, hash } from '../src/feeds/hash';

const MASK = (1n << 64n) - 1n;
const PRIME = 0x100000001b3n;

/** FNV-1a 64 over the same byte sequence: each code unit low byte, then high. */
function reference(input: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h = ((h ^ BigInt(code & 0xff)) * PRIME) & MASK;
    h = ((h ^ BigInt((code >>> 8) & 0xff)) * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

it('matches a BigInt FNV-1a 64 reference, including outside Latin-1', () => {
  const samples = [
    '',
    'a',
    'hello world',
    '小宇宙',
    '\u0000',
    'https://example.com/feed.xml\u0001ep-1',
    'https://example.com/feed.xml\u00010123',
  ];
  for (let i = 0; i < 3_000; i++) {
    samples.push(`s-${i}-${String.fromCharCode((i * 97) % 65_535)}`);
  }
  for (const sample of samples) {
    expect(fnv1a64(sample)).toBe(reference(sample));
  }
});

it('is 16 hex characters and does not collide over 20 000 episode ids', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) {
    const digest = hash(`https://example.com/feed.xml\u0001episode-guid-${i}`);
    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    seen.add(digest);
  }
  expect(seen.size).toBe(20_000);
});

it('is deterministic and separates the feed url from the guid', () => {
  expect(hash('abc')).toBe(hash('abc'));
  // Without the U+0001 separator these two would be the same string.
  expect(hash('ab\u0001c')).not.toBe(hash('a\u0001bc'));
});
