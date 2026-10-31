// Tests the now bar's signals: a page says Moments / scrolled / a sheet is open, and the bar listens.
/**
 * M31 T024 (index.html §Bars "Every state"): the bar is hidden on Moments, under a sheet and while a keyboard
 * is up, and shrinks to a circle while a list scrolls. Pages say so through `nowbar-signals`; the signal is
 * a count, so two pages may say it and it stays on until the last lets go or unmounts.
 *
 * The break that turns it red: make `raiseNowBarSignal` set a flag instead of counting (a second page letting
 * go would then switch the first one's signal off), or forget to undo it when a page unmounts.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { nowBarMode } from '@/ui/kit/NowBar';
import { raiseNowBarSignal, resetNowBarSignals, useNowBarSignal, useNowBarSignals } from '@/ui/player/nowbar-signals';

function Bar(): React.ReactElement {
  const s = useNowBarSignals();
  return createElement(Text, null, nowBarMode({ moments: s.moments, sheetOpen: s.sheet, shrunk: s.shrunk }));
}
function Page(props: { signal: 'moments' | 'sheet' | 'shrunk'; on: boolean }): null {
  useNowBarSignal(props.signal, props.on);
  return null;
}
const mode = (r: ReactTestRenderer): unknown => (r.toJSON() as { children: string[] }).children[0];

afterEach(() => { act(() => resetNowBarSignals()); });

it('the bar is a bar until a page says otherwise; Moments and a sheet hide it, a scroll shrinks it', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Bar)); });
  expect(mode(r)).toBe('bar');
  let off!: () => void;
  act(() => { off = raiseNowBarSignal('shrunk'); });
  expect(mode(r)).toBe('circle');
  act(() => { off(); });
  expect(mode(r)).toBe('bar');
  act(() => { off(); }); // letting go twice is harmless
  expect(mode(r)).toBe('bar');
  act(() => { off = raiseNowBarSignal('moments'); });
  expect(mode(r)).toBe('hidden');
  act(() => { off(); });
  let sheet!: () => void;
  act(() => { sheet = raiseNowBarSignal('sheet'); });
  expect(mode(r)).toBe('hidden');
  act(() => { sheet(); r.unmount(); });
});

it('two pages may say Moments: it stays on until the last lets go', () => {
  let bar!: ReactTestRenderer;
  act(() => { bar = create(createElement(Bar)); });
  let a!: ReactTestRenderer; let b!: ReactTestRenderer;
  act(() => { a = create(createElement(Page, { signal: 'moments', on: true })); b = create(createElement(Page, { signal: 'moments', on: true })); });
  expect(mode(bar)).toBe('hidden');
  act(() => { a.unmount(); });
  expect(mode(bar)).toBe('hidden');
  act(() => { b.unmount(); });
  expect(mode(bar)).toBe('bar');
  // A page that turns the signal off by prop, not by unmounting.
  let c!: ReactTestRenderer;
  act(() => { c = create(createElement(Page, { signal: 'sheet', on: true })); });
  expect(mode(bar)).toBe('hidden');
  act(() => { c.update(createElement(Page, { signal: 'sheet', on: false })); });
  expect(mode(bar)).toBe('bar');
  act(() => { c.unmount(); bar.unmount(); });
});
