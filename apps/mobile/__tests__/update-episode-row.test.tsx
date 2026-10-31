// Tests the Updates deck card: its measures, the cover chip, the meta words, and that every action button is labelled.
/**
 * Owner, 2026-10-01 (row 9): an Updates episode's meta is "duration · ago · plays · comments", a count left out when 0 or unknown.
 * M31 D-A (T031; design-pulse2 `index.html#updates--screen`): the row is a 290 x 350 card (radius 26, a 1 line) with a 150 cover, the
 * date and length in a mono chip, the show and title, four 40 circles and the 46 Play disc. The break: draw the Play disc at 40, or
 * the cover at 120, or print `meta.plays` unconditionally in the spoken name — each fails below.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { UpdateEpisodeRow, coverChip, updateMeta } from '@/ui/episode/UpdateEpisodeRow';
import { compactCount } from '@/ui/kit/format';
import { UPDATES } from '@/ui/library/measures';
import type { UpdateRow } from '@/me/updates';

// PlayButton (discover/parts) reads the palette through providers, whose import chain loads expo-audio.
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const NOW = new Date(2026, 9, 1, 12).getTime();
const item = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: NOW - 3 * 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
const noop = () => undefined;
const handlers = { onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop };
const labelled = (r: ReactTestRenderer, l: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === l);
const styleOf = (n: { props: Record<string, unknown> }) => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, number | string>;
const words = (r: ReactTestRenderer): string[] => r.root.findAll((n) => typeof n.props['children'] === 'string').map((n) => n.props['children'] as string);
const draw = (extra: Record<string, unknown> = {}): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(UpdateEpisodeRow, { item, plays: 57, comments: 8, now: NOW, iconColour: '#000', ...handlers, ...extra })); });
  return r;
};

it('builds the meta line and drops a 0 or unknown count', () => {
  expect(updateMeta({ durationMs: 69 * 60_000, publishedAt: NOW - 3 * 3_600_000, plays: 1200, comments: 4, now: NOW }))
    .toEqual({ lead: '69 min · 3 h ago', plays: 1200, comments: 4, label: '69 min · 3 h ago, 1200 plays, 4 comments' });
  const bare = updateMeta({ durationMs: undefined, publishedAt: undefined, plays: 0, comments: undefined, now: NOW });
  expect(bare).toEqual({ lead: '', label: '' });
  expect(compactCount(999)).toBe('999');
  expect(compactCount(1234)).toBe('1.2k');
  expect(compactCount(23_456)).toBe('23.4k'); // F13: the one kit helper (the file's own copy wrote 12 345 678 as "12345k")
  expect(compactCount(12_345_678)).toBe('12.3M');
});

it('the cover chip says TODAY / YESTERDAY / the date, then the length', () => {
  expect(coverChip(NOW - 3_600_000, 48 * 60_000, NOW)).toBe('TODAY · 48 MIN');
  expect(coverChip(NOW - 26 * 3_600_000, 38 * 60_000, NOW)).toBe('YESTERDAY · 38 MIN');
  expect(coverChip(new Date(2026, 8, 20, 9).getTime(), undefined, NOW)).toBe('20 Sep'); // M31 R2: the local short date, not the ISO day
  expect(coverChip(undefined, 5 * 60_000, NOW)).toBe('5 MIN');
});

it('is a 290 x 350 card with a 150 cover, 40 circles and a 46 Play disc, as drawn', () => {
  const r = draw();
  const card = r.root.findByProps({ testID: 'update-card' });
  expect(styleOf(card)['borderRadius']).toBe(UPDATES.card.radius);
  expect(UPDATES.card).toMatchObject({ width: 290, height: 350, cover: 150, action: 40, play: 46, radius: 26 });
  const cover = r.root.findAll((n) => styleOf(n)['height'] === UPDATES.card.cover && styleOf(n)['backgroundColor'] !== undefined);
  expect(cover.length).toBeGreaterThan(0);
  for (const l of ['Add Ep to the queue', 'Comments on Ep, 8 comments', 'Download Ep', 'More for Ep']) {
    const b = labelled(r, l).find((n) => styleOf(n)['width'] === UPDATES.card.action);
    expect(b).toBeDefined();
    expect(styleOf(b!)['height']).toBe(UPDATES.card.action);
  }
  const play = labelled(r, 'Play Ep').find((n) => styleOf(n)['width'] !== undefined)!;
  expect([styleOf(play)['width'], styleOf(play)['height']]).toEqual([46, 46]);
  expect(words(r)).toContain('TODAY · 69 MIN');
  expect(words(r)).toContain('Show ›');
});

it('every action has a label, and plays / comments are in the spoken name, not printed as "0"', () => {
  const r = draw();
  for (const l of ['Add Ep to the queue', 'Download Ep', 'More for Ep', 'Play Ep', 'Open Show']) expect(labelled(r, l).length).toBeGreaterThan(0);
  expect(labelled(r, 'Ep, Show. 69 min · 3 h ago, 57 plays, 8 comments').length).toBeGreaterThan(0);
  const zero = draw({ plays: 0, comments: undefined });
  expect(JSON.stringify(zero.toJSON())).not.toContain('"0"');
  expect(labelled(zero, 'Ep, Show. 69 min · 3 h ago').length).toBeGreaterThan(0);
});

it('swiping is also two accessibility actions: Mark played and Remove from Updates', () => {
  const played = jest.fn();
  const removed = jest.fn();
  const r = draw({ onMarkPlayed: played, onRemoveFromUpdates: removed });
  const title = labelled(r, 'Ep, Show. 69 min · 3 h ago, 57 plays, 8 comments')[0]!;
  expect((title.props['accessibilityActions'] as { name: string }[]).map((a) => a.name)).toEqual(['played', 'remove']);
  act(() => { (title.props['onAccessibilityAction'] as (e: unknown) => void)({ nativeEvent: { actionName: 'played' } }); });
  act(() => { (title.props['onAccessibilityAction'] as (e: unknown) => void)({ nativeEvent: { actionName: 'remove' } }); });
  expect(played).toHaveBeenCalledTimes(1);
  expect(removed).toHaveBeenCalledTimes(1);
});
