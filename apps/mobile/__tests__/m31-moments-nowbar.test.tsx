// Checks that the now bar hides while Home shows the Moments feed and comes back otherwise.
/**
 * M31 integration (L5): `useMomentsNowBar` joins L3's `useMomentsOnScreen` to L2's `moments` now bar
 * signal, and Home calls it. The break that turns it red: remove the `useMomentsNowBar()` call from
 * app/(tabs)/index.tsx (the source check), or the `useNowBarSignal('moments', on)` line in the hook.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { chooseHomeView, resetHomeViewForTest, setHomeFocused } from '@/ui/discover/homeView';
import { useMomentsNowBar } from '@/ui/discover/useMomentsNowBar';
import { nowBarMode } from '@/ui/kit/NowBar';
import { resetNowBarSignals, useNowBarSignals } from '@/ui/player/nowbar-signals';

const settings = { get: () => undefined, set: () => undefined };
let seen: ReturnType<typeof useNowBarSignals>;
function Probe(): null { useMomentsNowBar(); seen = useNowBarSignals(); return null; }

beforeEach(() => { resetHomeViewForTest(); resetNowBarSignals(); });

it('Moments in front: the moments signal is up and the bar mode is hidden', () => {
  chooseHomeView(settings, 'moments');
  let r!: ReturnType<typeof create>;
  act(() => { r = create(createElement(Probe)); });
  expect(seen.moments).toBe(false); // Home not in front yet
  act(() => setHomeFocused(true));
  expect(seen.moments).toBe(true);
  expect(nowBarMode({ moments: seen.moments, keyboard: false, sheetOpen: false, shrunk: false })).toBe('hidden');
  act(() => r.unmount());
});

it('Discover, or Home out of front, or Home gone: the bar is not hidden', () => {
  chooseHomeView(settings, 'moments');
  setHomeFocused(true);
  let r!: ReturnType<typeof create>;
  act(() => { r = create(createElement(Probe)); });
  expect(seen.moments).toBe(true);
  act(() => chooseHomeView(settings, 'discover'));
  expect(seen.moments).toBe(false);
  act(() => chooseHomeView(settings, 'moments'));
  expect(seen.moments).toBe(true);
  act(() => setHomeFocused(false));
  expect(seen.moments).toBe(false);
  act(() => setHomeFocused(true));
  act(() => r.unmount());
  let r2!: ReturnType<typeof create>;
  act(() => { r2 = create(createElement(() => { seen = useNowBarSignals(); return null; })); });
  expect(seen.moments).toBe(false); // unmounted Home lowered it
  act(() => r2.unmount());
});

it('Home calls the hook', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
  expect(src).toMatch(/^\s*useMomentsNowBar\(\)/m);
});
