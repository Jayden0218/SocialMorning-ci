// While the brand fonts are not loaded, a text keeps the weight its style names (038 US1, FR-001).
/**
 * 038 M1 (spec US1 scenario 2): `useFace` and `Text` used to return nothing while the fonts were not ready, so a title
 * drew in the system font at REGULAR weight (run 41838290318). The system font must keep 800 for a title, 700 for a
 * heading, 600 for `strong`, and 400 for body.
 * The break that turns it red: make the not-ready branch return `undefined` again.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { resetFontsForTest } from '@/design/fonts';
import { Type } from '@/ui/kit/Type';
import { useFace } from '@/ui/lib/text';

beforeEach(() => resetFontsForTest());

const weightOf = (step: 'hero' | 'heading' | 'row' | 'body'): unknown => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Type, { step, className: 'text-text' }, 'Words')); });
  const style = StyleSheet.flatten(r.root.findByType(require('react-native').Text).props.style);
  act(() => r.unmount());
  return style?.fontWeight;
};

it('not loaded: a title draws at 800, a heading at 700, strong at 600, body at 400', () => {
  expect(weightOf('hero')).toBe('800');
  expect(weightOf('heading')).toBe('700');
  expect(weightOf('row')).toBe('600');
  expect(weightOf('body')).toBe('400');
});

it('not loaded: useFace keeps the weight and leaves the family to the system', () => {
  let seen: ReturnType<typeof useFace>;
  const Probe = () => { seen = useFace('font-display font-extrabold text-pulse-hero'); return null; };
  act(() => { create(createElement(Probe)); });
  expect(seen).toEqual({ fontFamily: undefined, fontWeight: '800' });
});
