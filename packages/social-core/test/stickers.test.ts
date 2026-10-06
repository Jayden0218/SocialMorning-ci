// Tests the sticker catalogue, the placement rules and the day each listening sticker was earned.
/**
 * M21 US9. The break that turns it red: in src/stickers.ts change `items.length > PLACEMENT_MAX`
 * to `>=`, or drop the `isStickerId` check — the first test fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlacements, isStickerId, listeningStickerDays, PLACEMENT_MAX, STICKER_IDS, type Placement } from '../src/stickers.ts';
import type { ListenedRow } from '../src/stats.ts';

const p = (stickerId: string, extra: Partial<Placement> = {}): Placement => ({ stickerId, x: 0.5, y: 0.5, scale: 1, rot: 0, z: 0, ...extra });
const H = 3_600_000;

test('the catalogue has the eight stickers the phone shows, ids unique', () => {
  assert.deepEqual([...STICKER_IDS], ['hour-1', 'hour-10', 'hour-42', 'hour-100', 'finish-1', 'finish-25', 'moment-1', 'comment-1']);
  assert.equal(new Set(STICKER_IDS).size, STICKER_IDS.length);
  assert.equal(isStickerId('hour-1'), true);
  assert.equal(isStickerId('made-up'), false);
});

test('at most 10 placements; unknown and repeated stickers are refused', () => {
  assert.equal(PLACEMENT_MAX, 10);
  assert.equal(checkPlacements([]), 'ok');
  // Only 8 stickers exist, so 11 placements are refused for their number before anything else.
  assert.equal(checkPlacements(Array.from({ length: 11 }, () => p('hour-1'))), 'too_many');
  assert.equal(checkPlacements(STICKER_IDS.map((id, i) => p(id, { z: i }))), 'ok');
  assert.equal(checkPlacements([p('made-up')]), 'unknown_sticker');
  assert.equal(checkPlacements([p('hour-1'), p('hour-1')]), 'duplicate');
});

test('every bound: x, y in [0,1]; scale in [0.5,2.5]; turn within ±2π; z a whole number 0..9', () => {
  assert.equal(checkPlacements([p('hour-1', { x: 0, y: 1, scale: 0.5, rot: -2 * Math.PI, z: 9 })]), 'ok');
  assert.equal(checkPlacements([p('hour-1', { x: 1, y: 0, scale: 2.5, rot: 2 * Math.PI, z: 0 })]), 'ok');
  // 6.2832 is refused: stored as a real it reads 6.28320026…, over the column's CHECK.
  for (const bad of [{ x: -0.01 }, { x: 1.01 }, { x: Number.NaN }, { y: 1.5 }, { scale: 0.4 }, { scale: 2.6 }, { rot: 6.2832 }, { rot: -6.2832 }, { z: 1.5 }, { z: 10 }, { z: -1 }]) {
    assert.equal(checkPlacements([p('hour-1', bad)]), 'out_of_bounds', JSON.stringify(bad));
  }
});

test('the day each hours sticker was earned is the day the running total first reached it', () => {
  const rows: ListenedRow[] = [
    { episodeId: 'b', day: '2026-09-03', unionMs: 9 * H, finished: false },
    { episodeId: 'a', day: '2026-09-01', unionMs: 0.5 * H, finished: false },
    { episodeId: 'c', day: '2026-09-02', unionMs: 0.5 * H, finished: false },
  ];
  // 0.5 h on the 1st, 1 h on the 2nd (First hour), 10 h on the 3rd (10 hours).
  assert.deepEqual(listeningStickerDays(rows), { 'hour-1': '2026-09-02', 'hour-10': '2026-09-03' });
  assert.deepEqual(listeningStickerDays([]), {});
});
