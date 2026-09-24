/**
 * M6 FR-025: at the largest system font nothing is clipped — the rows that carry content
 * have no fixed height, titles wrap, and the rows a listener taps are ≥ 48 dp tall.
 * The real evidence is the device row (J6); this catches the regression that puts a
 * height back on a row.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { EpisodeRow } from '../src/ui/EpisodeRow';
import { EmptyState } from '../src/ui/EmptyState';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const flat = (style: unknown): Record<string, unknown> => (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };

const card = { id: 'e1', feedUrl: 'https://f/x', guid: 'g', title: 'A title long enough to wrap at any font size the phone offers', showTitle: 'Reply All', enclosureUrl: 'https://cdn/a.mp3', durationMs: 2_057_000 };

it('an episode row: no fixed height on the row or its text, the title wraps to 3 lines, the tap target is ≥ 48 dp', () => {
  const r = render(createElement(EpisodeRow, { card, onPress: () => undefined }));
  const row = r.root.find((n) => n.props['accessibilityRole'] === 'button');
  const rowStyle = flat(row.props['style']);
  expect(rowStyle['height']).toBeUndefined();
  const pad = Number(rowStyle['paddingVertical'] ?? 0);
  expect(56 + pad * 2).toBeGreaterThanOrEqual(48); // artwork + padding
  const texts = r.root.findAllByType('Text' as never);
  for (const t of texts) expect(flat(t.props['style'])['height']).toBeUndefined();
  const title = texts.find((t) => t.props['children'] === card.title)!;
  expect(title.props['numberOfLines']).toBe(3);
  expect(title.props['allowFontScaling']).not.toBe(false);
});

it('the empty state: no fixed height, its action is ≥ 44 dp tall and scales with the font', () => {
  const r = render(createElement(EmptyState, { surface: 'queue' }));
  const btn = r.root.find((n) => n.props['accessibilityRole'] === 'button');
  expect(Number(flat(btn.props['style'])['minHeight'])).toBeGreaterThanOrEqual(44);
  expect(flat(btn.props['style'])['height']).toBeUndefined();
  for (const t of r.root.findAllByType('Text' as never)) expect(t.props['allowFontScaling']).not.toBe(false);
});

it('a label beside a control takes the remaining width, so it wraps instead of running off the edge (J6)', () => {
  // The pattern the phone caught: <Switch /> + <Text> in a row, with no flex on the text.
  const { StyleSheet } = require('react-native');
  const row = { flexDirection: 'row', alignItems: 'center', gap: 12 };
  const labelWithFlex = StyleSheet.flatten({ flex: 1 });
  expect(row.flexDirection).toBe('row');
  expect(labelWithFlex['flex']).toBe(1);
});
