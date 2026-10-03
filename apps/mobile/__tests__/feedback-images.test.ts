/**
 * M10b US6 — an image is shrunk until it fits 200 KB, trying falling qualities; one that
 * never fits is dropped rather than sent to be refused. The break that turns this red:
 * return the first encoding in `smallestFit` whatever its size.
 */
import { base64Bytes, QUALITIES, smallestFit, TARGET_BYTES } from '@/settings/feedback-shrink';

const ofBytes = (n: number) => 'A'.repeat(Math.ceil((n * 4) / 3));

it('base64Bytes is the decoded size', () => {
  expect(base64Bytes('QUJD')).toBe(3);
  expect(base64Bytes('QUI=')).toBe(2);
  expect(base64Bytes('QQ==')).toBe(1);
});

it('the first quality that fits wins; nothing fits → undefined', async () => {
  const tried: number[] = [];
  const fits = await smallestFit(async (q) => { tried.push(q); return q > 0.5 ? ofBytes(TARGET_BYTES + 10_000) : ofBytes(TARGET_BYTES - 10_000); });
  expect(fits).toBeDefined();
  expect(tried).toEqual([0.8, 0.65, 0.5]);
  expect(await smallestFit(async () => ofBytes(TARGET_BYTES * 3))).toBeUndefined();
  expect(QUALITIES[QUALITIES.length - 1]).toBe(0.2);
});
