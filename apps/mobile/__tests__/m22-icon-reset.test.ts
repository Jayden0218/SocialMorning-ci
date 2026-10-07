// Tests that the app icon goes back to Default when PLUS has ended, and only then.
/**
 * M22 US17 (alternate icons): src/ui/shell/iconReset.ts. The native icon switch and the app
 * start on a phone are Tier B — NOT VERIFIED here.
 */
const mockIcons = { available: true, current: 'Ocean' as string | null, set: jest.fn(async (_name: string | null) => true) };
jest.mock('../modules/alternate-icons', () => ({
  isAvailable: () => mockIcons.available,
  currentIcon: async () => mockIcons.current,
  setIcon: (name: string | null) => mockIcons.set(name),
}));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {}, listener: undefined }) }));

import { resetIconIfPlusEnded } from '@/ui/shell/iconReset';

beforeEach(() => { mockIcons.available = true; mockIcons.current = 'Ocean'; mockIcons.set.mockClear(); });

it('PLUS over and an own icon set: back to Default', async () => {
  expect(await resetIconIfPlusEnded(async () => false)).toBe(true);
  expect(mockIcons.set).toHaveBeenCalledWith(null);
});

it('still PLUS, already Default, or no icon module: nothing changes', async () => {
  expect(await resetIconIfPlusEnded(async () => true)).toBe(false);
  mockIcons.current = null;
  expect(await resetIconIfPlusEnded(async () => false)).toBe(false);
  mockIcons.current = 'Plum';
  mockIcons.available = false;
  expect(await resetIconIfPlusEnded(async () => false)).toBe(false);
  expect(mockIcons.set).not.toHaveBeenCalled();
});

it('the server cannot be reached: the icon stays', async () => {
  await expect(resetIconIfPlusEnded(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  expect(mockIcons.set).not.toHaveBeenCalled();
});
