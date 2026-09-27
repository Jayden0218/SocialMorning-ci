/**
 * Same reference test as apps/mobile/__tests__/hash-reference.test.ts, run under
 * node:test: the hash produces episode ids compared ACROSS DEVICES in M3, so it is
 * checked against an independent BigInt FNV-1a 64, not against itself.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a64, hash } from '../src/hash.ts';

const MASK = (1n << 64n) - 1n;
const PRIME = 0x100000001b3n;

function reference(input: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h = ((h ^ BigInt(code & 0xff)) * PRIME) & MASK;
    h = ((h ^ BigInt((code >>> 8) & 0xff)) * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

test('matches a BigInt FNV-1a 64 reference, including outside Latin-1', () => {
  const samples = ['', 'a', 'https://feeds.example.com/x.xml\u0001guid-1', '小宇宙', '🎧 episode 189', 'x'.repeat(1000)];
  for (const s of samples) assert.equal(fnv1a64(s), reference(s), JSON.stringify(s));
  assert.equal(hash, fnv1a64);
});
