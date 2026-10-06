// Tests the audio-route module's JS side: no native module means no button, never a crash.
/**
 * M21 US11 (FR-100, research R3). `modules/audio-route/index.ts` is what the player's route button
 * and the settings row ask. In Jest, on the web and in a build from before M21 there is no native
 * module: every answer must then be "no picker" (the button hides), not an exception.
 * On Android a `false` from the system switcher also means "hide".
 *
 * The break that turns it red: in modules/audio-route/index.ts return `true` from
 * `showOutputSwitcher` when the native call throws.
 *
 * Whether the picker lists a Bluetooth speaker and moves the sound is NOT VERIFIED (quickstart B15).
 */
let mockNative: Record<string, unknown> | null = null;
let mockThrows = false;

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => {
    if (mockThrows) throw new Error('no JSI');
    return name === 'AudioRoute' ? mockNative : null;
  },
  requireNativeView: (name: string) => {
    const View = () => null;
    View.displayName = `Native(${name})`;
    return View;
  },
}));

import { isAvailable, routePickerView, showOutputSwitcher } from '../modules/audio-route';

beforeEach(() => { mockNative = null; mockThrows = false; });

it('without the native module there is no picker, and asking never throws', async () => {
  expect(isAvailable()).toBe(false);
  await expect(showOutputSwitcher()).resolves.toBe(false);
  mockThrows = true;
  expect(isAvailable()).toBe(false);
  await expect(showOutputSwitcher()).resolves.toBe(false);
});

it('with it: available; Android shows the switcher, and false or an error means "hide"', async () => {
  mockNative = { isAvailable: () => true, showOutputSwitcher: async () => true };
  expect(isAvailable()).toBe(true);
  await expect(showOutputSwitcher()).resolves.toBe(true);
  mockNative = { isAvailable: () => true, showOutputSwitcher: async () => false };
  await expect(showOutputSwitcher()).resolves.toBe(false);
  mockNative = { isAvailable: () => true, showOutputSwitcher: async () => { throw new Error('no activity'); } };
  await expect(showOutputSwitcher()).resolves.toBe(false);
  // iOS has no switcher function (the picker is a view).
  mockNative = { isAvailable: () => true };
  await expect(showOutputSwitcher()).resolves.toBe(false);
  mockNative = { isAvailable: () => { throw new Error('gone'); } };
  expect(isAvailable()).toBe(false);
});

it('the iOS picker view is looked up once, and only when the module exists', () => {
  jest.isolateModules(() => {
    mockNative = null;
    const m = require('../modules/audio-route') as typeof import('../modules/audio-route');
    expect(m.routePickerView()).toBeNull();
  });
  jest.isolateModules(() => {
    mockNative = { isAvailable: () => true };
    const m = require('../modules/audio-route') as typeof import('../modules/audio-route');
    const view = m.routePickerView();
    expect(view).not.toBeNull();
    expect(m.routePickerView()).toBe(view);
  });
  expect(typeof routePickerView).toBe('function');
});
