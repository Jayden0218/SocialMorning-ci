/**
 * The Loader's animation stops when it leaves the screen. Its loop never ends on its own,
 * so a Loader that does not stop on unmount keeps timers alive after its screen (or
 * test) is gone — seen as "Cannot log after tests are done" in run 36295287109.
 *
 * The break that turns this red: delete the effect's cleanup
 * (`return () => loops.forEach((l) => l.stop())`) in `src/ui/Loader.tsx`.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { Loader } from '@/ui/Loader';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('animates while shown and leaves no timer behind once unmounted', async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(Loader)); });
  act(() => { jest.advanceTimersByTime(50); });
  expect(jest.getTimerCount()).toBeGreaterThan(0);
  act(() => { r.unmount(); });
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(jest.getTimerCount()).toBe(0);
});
