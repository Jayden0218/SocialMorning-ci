// M32 T041 (review B8): a per-email daily code limit, and an alert when the global cap refuses.
/**
 * Guards G-M32-B8a/b. Break: in src/auth/rate.ts remove the per-email `limit(...)` call (a) or the console.error in the catch (b).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from 'hono';
import { freshDb } from './harness.ts';
import { setRateCount } from './ac-neutral.ts';
import { limitCodeRequest } from '../src/auth/rate.ts';

const dayStart = () => new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000);
const ctx = (email: string, ip?: string) => ({
  req: { header: (n: string) => (n === 'x-forwarded-for' ? ip : undefined), json: async () => ({ email }) },
}) as unknown as Context;

test('G-M32-B8a: one address hits its own daily limit; other addresses and the global counter are untouched', async () => {
  const t = await freshDb();
  for (let i = 0; i < 10; i++) await limitCodeRequest(t.db, ctx('Same@Example.com'));
  await assert.rejects(() => limitCodeRequest(t.db, ctx('same@example.com')), /today/);
  await limitCodeRequest(t.db, ctx('other@example.com'));
  // The per-address check comes before the global one, so the refused 11th did not use a global slot: 297 + 1 is still allowed.
  await setRateCount(t, 'code:global', 297, dayStart());
  await limitCodeRequest(t.db, ctx('third@example.com')); // 298 -> ok
  await t.close();
});

test('G-M32-B8b: hitting the global cap logs one ALERT line and refuses', async () => {
  const t = await freshDb();
  await setRateCount(t, 'code:global', 100000, dayStart());
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
  try { await assert.rejects(() => limitCodeRequest(t.db, ctx('x@example.com')), /cannot send more codes/); }
  finally { console.error = orig; }
  assert.ok(lines.some((l) => l.includes('ALERT sign-in-code global cap reached')), lines.join('|'));
  await t.close();
});
