// Tests that the "listening now" chip shows only for two or more people.
/** M12 FR-042: the chip shows at 2 or more, never at 0, 1 or when the count is unknown (offline). */
jest.mock('@/sync/device-id', () => ({ deviceId: async () => 'install-1' }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => ({}) }));
import { liveLabel } from '@/social/live';

it('says "N listening now" only for 2 or more known listeners', () => {
  expect(liveLabel(undefined)).toBeUndefined();
  expect(liveLabel(0)).toBeUndefined();
  expect(liveLabel(1)).toBeUndefined();
  expect(liveLabel(2)).toBe('2 listening now');
  expect(liveLabel(85)).toBe('85 listening now');
});
