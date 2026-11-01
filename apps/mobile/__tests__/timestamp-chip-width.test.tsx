// Tests that a comment time chip keeps room for its whole time at every text size.
/**
 * 035 T051 (device check L2; FR-009). The chip is a one-line pill inside a row; the row squeezed it and the time showed as "00:…"
 * (r08-01, r08-05, r13-12, r18-06). jest has no layout engine, so the guard is on the style the layout engine gets: the chip may
 * not shrink (`flexShrink: 0`) and has a `minWidth` that fits its longest clock ("00:00" / "0:00:00") in Geist Mono 12 at the text
 * scale the type cap allows, plus its padding. Tested at font scale 1 and 3.1 (the largest accessibility size).
 * Breaks that turn it red: drop the minWidth; let it shrink; compute the width without the scale.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { bars } from '@/design';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { TYPE_CAP } from '@/ui/kit/Type';

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: mockScale })) }));

const MONO_EM = 0.62; // Geist Mono's advance, in em (monospaced: every glyph the same)
let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));
const style = (text: string, onPress?: () => void): Record<string, unknown> => {
  act(() => { r = create(createElement(TimestampChip, { text, ...(onPress ? { onPress } : {}) })); });
  const host = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] !== undefined || (typeof n.type === 'string' && String(n.props['className'] ?? '').includes('rounded-chip')))[0]!;
  return (StyleSheet.flatten(host.props['style'] as never) ?? {}) as Record<string, unknown>;
};

describe.each([1, 3.1])('at font scale %s', (scale) => {
  beforeEach(() => { mockScale = scale; });
  it.each([['0:36', '00:36'], ['12:34', '12:34'], ['1:02:03', '1:02:03']])('the chip for %s is at least as wide as "%s" in mono 12', (text, shown) => {
    const need = shown.length * MONO_EM * 12 * Math.min(scale, TYPE_CAP) + bars.stampPad * 2;
    const s = style(text);
    expect(s['flexShrink']).toBe(0);
    expect(Number(s['minWidth'])).toBeGreaterThanOrEqual(Math.floor(need));
  });
  it('the pressable chip too', () => {
    const s = style('0:36', () => undefined);
    expect(s['flexShrink']).toBe(0);
    expect(Number(s['minWidth'])).toBeGreaterThan(0);
  });
});
