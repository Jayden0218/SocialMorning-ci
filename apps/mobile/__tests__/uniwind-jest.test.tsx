// Checks that style classes become real styles in tests, so style tests mean something.
/**
 * M9 guard G8 (research R1): classes compile to REAL styles under Jest. If the UniWind setup
 * (jest.uniwind.*) is skipped, `className` does nothing and every style-reading test passes
 * on `{}` — M7's black-on-black text went green exactly that way. Watched red on the spike
 * (run 36283855577) and again here.
 */
import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '@/design/tokens';

/** `#rrggbb` → the three channels, so the check holds whether UniWind emits hex or rgb(). */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channelsOf = (value: unknown) => (String(value).match(/\d+/g) ?? []).slice(0, 3).map(Number);

it('G8: bg-accent and w-full reach the native View as real styles', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(View, { className: 'bg-accent w-full', testID: 'probe' })); });
  const host = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'probe');
  expect(host).toHaveLength(1);
  const style = (StyleSheet.flatten(host[0]!.props['style']) ?? {}) as Record<string, unknown>;
  const bg = String(style['backgroundColor']);
  expect(bg.startsWith('#') ? rgb(bg) : channelsOf(bg)).toEqual(rgb(colour.accent));
  expect(style['width']).toBe('100%');
});
