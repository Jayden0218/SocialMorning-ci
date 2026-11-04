// The font load leaves one line in the app's console, so a simulator run can say why Unbounded was or was not drawn (038 M0, FR-002).
/**
 * Run 41838290318 drew every title in the system font and its app log (`log show --predicate 'process == "SocialNet"'`)
 * had no line from `loadFonts`: the cause could not be read. `console.error` is used because a Release build forwards
 * only errors from JS to the system log.
 * The break that turns it red: remove the `report(...)` calls in `loadFonts`.
 */
import { loadFonts, resetFontsForTest } from '@/design/fonts';

let spy: jest.SpyInstance;
beforeEach(() => { resetFontsForTest(); spy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => spy.mockRestore());
const lines = (): string[] => spy.mock.calls.map((c) => String(c[0]));

it('a load that works logs "[fonts] loaded"', async () => {
  await loadFonts(async () => undefined, 1000);
  expect(lines()).toEqual([expect.stringMatching(/^\[fonts\] loaded in \d+ ms$/)]);
});

it('a load that fails logs the reason', async () => {
  await loadFonts(async () => { throw new Error('no such asset'); }, 1000);
  expect(lines()).toEqual(['[fonts] failed: no such asset']);
});

it('a load that is too slow logs "late", then "loaded late" when it arrives', async () => {
  let done!: () => void;
  const pending = loadFonts(() => new Promise<void>((res) => { done = res; }), 5);
  await expect(pending).resolves.toBe(false);
  expect(lines()).toEqual([expect.stringMatching(/^\[fonts\] not in after 5 ms/)]);
  done();
  await new Promise((r) => setTimeout(r, 0));
  expect(lines()[1]).toMatch(/^\[fonts\] loaded late, after \d+ ms$/);
});
