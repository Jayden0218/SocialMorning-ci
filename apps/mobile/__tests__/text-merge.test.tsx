// Checks that a colour and an app text size on one Text both survive the class merge.
/**
 * gluestack's Text merges classes with tailwind-merge, which did not know the app's own sizes
 * (`text-body`, `text-meta`…) and dropped the colour beside them: "Disagree" and "Cancel" were
 * written brown and showed black (found 2026-10-04). src/design/merge.ts teaches it the sizes.
 *
 * The break that turns it red: delete the `defaultConfig.twMergeConfig` line in merge.ts.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { Text } from '@/ui/lib/text';
import { colour, fontSize } from '@/design';
import { APP_TEXT_SIZES } from '@/design/merge';

/** A colour as its three channels, so hex or rgb() output both compare. */
const channels = (v: string): string => {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) { const n = parseInt(hex[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
  return (v.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number).join(',');
};

const style = (className: string) => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Text, { className }, 'x')); });
  const host = r.root.findAll((n) => typeof n.type === 'string' && n.props['children'] === 'x')[0]!;
  return StyleSheet.flatten(host.props['style']) as { color?: string; fontSize?: number };
};

it('knows every app text size that Tailwind does not have', () => {
  expect(APP_TEXT_SIZES).toEqual(['micro', 'meta', 'body', 'title', 'hero', 'display']);
});

it.each([
  ['text-accent text-body font-bold', colour.accent, fontSize.body],
  ['text-body font-bold text-accent', colour.accent, fontSize.body],
  ['text-muted text-meta', colour.muted, fontSize.meta],
  ['text-onPrimary text-title', colour.onPrimary, fontSize.title],
])('"%s" keeps its colour and its size', (cls, c, size) => {
  const s = style(cls);
  expect(channels(String(s.color))).toBe(channels(c));
  expect(s.fontSize).toBe(size);
});
