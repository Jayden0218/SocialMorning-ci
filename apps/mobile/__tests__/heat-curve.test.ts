import { EMPTY_STATES } from '@socialmorning/social-core';
import { heatMessage } from '../src/ui/HeatCurve';

it('SC-004: every empty state has a plain message; a real curve has none', () => {
  expect(heatMessage(undefined)).toMatch(/isn't available/);
  expect(heatMessage({ available: false })).toMatch(/isn't available/);
  // M6 (FR-019): the flat line carries the action too.
  expect(heatMessage({ available: true, buckets: new Array(100).fill(0) })).toBe(EMPTY_STATES.heat.sentence);
  const b = new Array(100).fill(0); b[30] = 1;
  expect(heatMessage({ available: true, buckets: b })).toBeUndefined();
});
