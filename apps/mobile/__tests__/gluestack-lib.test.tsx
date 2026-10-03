/**
 * M9 guard G2 (FR-005): every gluestack part that draws words gives them a TOKEN colour by
 * itself. M7's worst defect was text with no colour at all (black on the old black app), and
 * a grep cannot see a colour that lives in a component's base style — so this renders each
 * part, with the real UniWind styles (G8), and reads the colour React Native would draw.
 *
 * The break that turns it red: remove `text-text` from `src/ui/lib/text/styles.tsx`'s base.
 */
import { createElement as h, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '../src/design/tokens';
import { Text } from '../src/ui/lib/text';
import { Heading } from '../src/ui/lib/heading';
import { Button, ButtonText } from '../src/ui/lib/button';
import { Badge, BadgeText } from '../src/ui/lib/badge';
import { Image } from '../src/ui/lib/image';
import { Input, InputField } from '../src/ui/lib/input';
import { Textarea, TextareaInput } from '../src/ui/lib/textarea';

/** Every token colour as its three channels, so hex or rgb() output both compare. */
const channels = (v: string): number[] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { const n = parseInt(hex[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return (v.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
};
const TOKENS = Object.values(colour).map((v) => channels(v).join(','));

function colourOf(el: ReactElement, words: string): string {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  const host = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === words);
  expect(host.length).toBeGreaterThan(0);
  const style = (StyleSheet.flatten(host[0]!.props['style']) ?? {}) as Record<string, unknown>;
  return String(style['color']);
}

it.each([
  ['Text', () => h(Text, null, 'words')],
  ['Heading', () => h(Heading, null, 'words')],
  ['ButtonText', () => h(Button, null, h(ButtonText, null, 'words'))],
  ['BadgeText', () => h(Badge, null, h(BadgeText, null, 'words'))],
])('G2: %s draws its words in a token colour, never the default black', (_name, make) => {
  const c = colourOf(make(), 'words');
  expect(c).not.toBe('undefined');
  expect(TOKENS).toContain(channels(c).join(','));
});

/**
 * Found on the iPhone (M9 build, 2026-09-27): gluestack's Input and Textarea default
 * aria-label to "Input Field", which beats accessibilityLabel on native — VoiceOver read
 * "Input Field" for Email and Password. The break: drop the aria-label line in
 * src/ui/lib/input/index.tsx or src/ui/lib/textarea/index.tsx.
 */
it.each([
  ['InputField', () => h(Input, null, h(InputField, { accessibilityLabel: 'Email' }))],
  ['TextareaInput', () => h(Textarea, null, h(TextareaInput, { accessibilityLabel: 'Email' }))],
])('%s is read by its own name, not "Input Field"', (_name, make) => {
  let r!: ReactTestRenderer;
  act(() => { r = create(make()); });
  const field = r.root.findAll((n) => typeof n.type === 'string' && n.props['aria-label'] !== undefined);
  expect(field.length).toBeGreaterThan(0);
  expect(field.map((n) => n.props['aria-label'])).toEqual(field.map(() => 'Email'));
});

/**
 * Found on the iPhone (M9 build f9af55e, 2026-09-27): upstream's Image set `style` to
 * `undefined` on native AFTER the caller's props, so every image sized by `style` — artwork,
 * the Google G, the sign-in art wall — drew at its full pixel size. The break: put back
 * `: undefined` in src/ui/lib/image/index.tsx.
 */
it('Image keeps the caller\'s style on native', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(h(Image, { source: { uri: 'https://img/a.png' }, style: { width: 20, height: 20 }, alt: 'x' })); });
  const host = r.root.findAll((n) => typeof n.type === 'string')[0]!;
  const style = (StyleSheet.flatten(host.props['style']) ?? {}) as Record<string, unknown>;
  expect([style['width'], style['height']]).toEqual([20, 20]);
});
