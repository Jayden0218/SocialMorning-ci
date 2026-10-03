/**
 * Owner, 2026-10-01 (row 9): an Updates row's meta line is "duration · ago · plays · comments",
 * with a count left out when 0 or unknown, and four labelled icon buttons + play under it.
 * The break: render `meta.plays` unconditionally in src/ui/UpdateEpisodeRow.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { UpdateEpisodeRow, compactCount, updateMeta } from '../src/ui/UpdateEpisodeRow';
import type { UpdateRow } from '../src/me/updates';

// PlayButton (discover/parts) reads the palette through providers, whose import chain loads expo-audio.
jest.mock('../src/ui/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const NOW = Date.UTC(2026, 9, 1, 12);
const item = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: NOW - 3 * 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
const noop = () => undefined;
const handlers = { onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop };
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
const labelled = (r: ReactTestRenderer, l: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === l).length > 0;

it('builds the meta line and drops a 0 or unknown count', () => {
  expect(updateMeta({ durationMs: 69 * 60_000, publishedAt: NOW - 3 * 3_600_000, plays: 1200, comments: 4, now: NOW }))
    .toEqual({ lead: '69 min · 3 h ago', plays: 1200, comments: 4, label: '69 min · 3 h ago, 1200 plays, 4 comments' });
  const bare = updateMeta({ durationMs: undefined, publishedAt: undefined, plays: 0, comments: undefined, now: NOW });
  expect(bare).toEqual({ lead: '', label: '' });
  expect(compactCount(999)).toBe('999');
  expect(compactCount(1234)).toBe('1.2k');
  expect(compactCount(23_456)).toBe('23k');
});

it('renders plays and comments only when above 0, and every action has a label', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(UpdateEpisodeRow, { item, plays: 57, comments: 8, now: NOW, iconColour: '#000', ...handlers })); });
  expect(text(r)).toContain('"57"');
  expect(text(r)).toContain('"8"');
  for (const l of ['Add Ep to the queue', 'Comments on Ep', 'Download Ep', 'More for Ep', 'Play Ep']) expect(labelled(r, l)).toBe(true);
  act(() => { r = create(createElement(UpdateEpisodeRow, { item, plays: 0, now: NOW, iconColour: '#000', ...handlers })); });
  expect(text(r)).not.toContain('"0"');
  expect(text(r)).toContain('69 min · 3 h ago');
});
