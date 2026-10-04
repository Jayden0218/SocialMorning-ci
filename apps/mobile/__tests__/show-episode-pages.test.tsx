// Tests the show page's sort and filter, episode row details and announcement card.
/**
 * Owner, 2026-10-01 — the show page's list controls, row meta and announcement card.
 * Breaks to watch red: drop the `view === 'mostPlayed'` sort in src/ui/show/order.ts; drop
 * `numberOfLines: 2` in src/ui/show/AnnouncementCard.tsx; drop the plays term in EpisodeMeta.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { hasPlays, matchEpisodes, orderEpisodes } from '@/ui/show/order';
import { EpisodeMeta, metaLabel } from '@/ui/show/EpisodeMeta';
import { AnnouncementCard, announcementHeading } from '@/ui/show/AnnouncementCard';

const eps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]; // newest first
const base = { oldestFirst: false, view: 'all' as const, unplayedOnly: false, isFinished: () => false };
const ids = (r: { id: string }[]) => r.map((e) => e.id);
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('orders newest or oldest first and filters to unplayed', () => {
  expect(ids(orderEpisodes(eps, base))).toEqual(['a', 'b', 'c']);
  expect(ids(orderEpisodes(eps, { ...base, oldestFirst: true }))).toEqual(['c', 'b', 'a']);
  expect(ids(orderEpisodes(eps, { ...base, unplayedOnly: true, isFinished: (id) => id === 'b' }))).toEqual(['a', 'c']);
  expect(ids(eps)).toEqual(['a', 'b', 'c']); // the input is not mutated
});

it('"Most played" sorts by plays, ties keep the date order; with no plays it is the plain list', () => {
  const listeners = { a: 1, b: 9, c: 1 };
  expect(ids(orderEpisodes(eps, { ...base, view: 'mostPlayed', listeners }))).toEqual(['b', 'a', 'c']);
  expect(ids(orderEpisodes(eps, { ...base, view: 'mostPlayed', oldestFirst: true, listeners }))).toEqual(['b', 'c', 'a']);
  expect(ids(orderEpisodes(eps, { ...base, view: 'mostPlayed', listeners: {} }))).toEqual(['a', 'b', 'c']);
  expect(hasPlays(undefined)).toBe(false);
  expect(hasPlays({ a: 0 })).toBe(false);
  expect(hasPlays({ a: 0, b: 2 })).toBe(true);
});

it('the row meta draws plays and comments beside icons only when above 0; the label says the words', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  const m = { durationMs: 69 * 60_000, publishedAt: now - 13 * 3_600_000, plays: 120, comments: 8, progress: '', now };
  expect(metaLabel(m)).toBe('69 min · 13 h ago · 120 listened · 8 comments');
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(EpisodeMeta, { ...m, iconColour: '#000' })); });
  expect(text(r)).toContain('69 min · 13 h ago');
  expect(text(r)).toContain('"120"');
  expect(text(r)).toContain('"8"');
  act(() => { r = create(createElement(EpisodeMeta, { ...m, plays: 0, comments: 0, iconColour: '#000' })); });
  expect(text(r)).not.toContain('"0"');
  expect(metaLabel({ ...m, plays: 0, comments: 0 })).toBe('69 min · 13 h ago');
});

it('the announcement card says "Announcement · date", shows 2 lines, and a tap opens the whole text', () => {
  const a = { id: 'x', body: 'New season Monday', createdAt: '2026-09-30T08:00:00.000Z', edited: false };
  expect(announcementHeading(a)).toBe('Announcement · 2026-09-30');
  expect(announcementHeading({ createdAt: '' })).toBe('Announcement');
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(AnnouncementCard, { announcement: a, iconColour: '#000' })); });
  const lines = () => r.root.findAll((n) => n.props['children'] === 'New season Monday').map((n) => n.props['numberOfLines'] as unknown);
  expect(lines().length).toBeGreaterThan(0);
  expect(lines().every((l) => l === 2)).toBe(true);
  const card = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Announcement · 2026-09-30. New season Monday' && typeof n.props['onPress'] === 'function')[0]!;
  act(() => { card.props['onPress'](); });
  expect(lines().every((l) => l === undefined)).toBe(true);
});

test("owner 2026-10-05: the show page's search keeps episodes whose title or notes hold every word, any case", () => {
  const eps = [
    { id: 'a', text: 'Money talk\nEPF and tax' },
    { id: 'b', text: 'Travel\nJapan in winter' },
    { id: 'c', text: 'Tax season\nhow to file' },
  ];
  const of = (e: { text: string }) => e.text;
  expect(matchEpisodes(eps, 'TAX', of).map((e) => e.id)).toEqual(['a', 'c']);
  expect(matchEpisodes(eps, 'tax  file', of).map((e) => e.id)).toEqual(['c']);
  expect(matchEpisodes(eps, 'japan', of).map((e) => e.id)).toEqual(['b']);
  expect(matchEpisodes(eps, '   ', of).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  expect(matchEpisodes(eps, 'nothing', of)).toEqual([]);
});
