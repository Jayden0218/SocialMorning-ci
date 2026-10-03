/**
 * M17 guard G-E4 (FR-003): the Editorial fonts never hold start-up hostage. `loadFonts` settles
 * whether the load works, fails or hangs; when it does not work, the system fonts stay in use.
 *
 * The break that turns it red: let `loadFonts` pass the load's rejection through (drop the
 * `() => false` handler) — start-up's task list then rejects.
 */
import { FACES, familyFor, fontsStore, loadFonts, resetFontsForTest } from '@/design/fonts';

beforeEach(() => resetFontsForTest());

it('a load that works marks the fonts ready', async () => {
  const load = jest.fn(async () => undefined);
  await expect(loadFonts(load, 1000)).resolves.toBe(true);
  expect(load).toHaveBeenCalledWith(FACES);
  expect(fontsStore.get()).toBe(true);
});

it('G-E4: a load that fails still settles, and the system fonts stay', async () => {
  await expect(loadFonts(async () => { throw new Error('no font module'); }, 1000)).resolves.toBe(false);
  expect(fontsStore.get()).toBe(false);
});

it('G-E4: a load that hangs gives up after the wait, and the system fonts stay', async () => {
  jest.useFakeTimers();
  const pending = loadFonts(() => new Promise<void>(() => undefined), 3000);
  jest.advanceTimersByTime(3000);
  await expect(pending).resolves.toBe(false);
  expect(fontsStore.get()).toBe(false);
  jest.useRealTimers();
});

it('six faces, each registered under its PostScript name', () => {
  expect(Object.keys(FACES).sort()).toEqual(['Fraunces-Bold', 'Fraunces-SemiBold', 'Manrope-Bold', 'Manrope-Medium', 'Manrope-Regular', 'Manrope-SemiBold']);
});

it('a weight class picks its face; display classes pick the serif', () => {
  expect(familyFor('text-text text-sm')).toBe('Manrope-Regular');
  expect(familyFor('text-text font-medium')).toBe('Manrope-Medium');
  expect(familyFor('text-text font-semibold')).toBe('Manrope-SemiBold');
  expect(familyFor('text-text font-bold')).toBe('Manrope-Bold');
  expect(familyFor('text-text font-extrabold')).toBe('Manrope-Bold');
  expect(familyFor('text-text font-display text-display')).toBe('Fraunces-Bold');
  expect(familyFor('text-text font-display-semibold')).toBe('Fraunces-SemiBold');
  expect(familyFor(undefined)).toBe('Manrope-Regular');
});
