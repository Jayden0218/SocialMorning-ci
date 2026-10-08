// Tests that the M24 per-screen look keeps its order, defaults and room (guard G-M24-B3).
/**
 * M24 lane B3 (US20, the B "Editorial" designs per screen). A render wherever the part stands
 * alone in src/ (the pick card, the notice pills; the shared episode sheet in
 * m24-screens.row-sheet.test.tsx). Source scans remain only where the fact lives in an expo-router
 * page under app/ (notifications, episode, history, comments), which no test here can render with
 * manageable mocks. Everything here is NOT VERIFIED on a phone until a build is shot.
 *
 * Each block names the break that turns it red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SECTION_IDS, sectionOrder } from '@/discover/sections';
import { NoticeCards } from '@/ui/social/NoticeCards';
import { PicksSection } from '@/ui/discover/sections';
import { SectionTitle } from '@/ui/discover/parts';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Artwork } from '@/ui/kit/Artwork';

// PicksSection reads its palette through useStores(); pin it to light (as discover-sections.test.tsx).
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');
/** The text between two markers (both must exist). */
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(to, a);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

// Break: put 'forYou' back before 'picks' in SECTION_IDS (src/discover/sections.ts); or, in
// PicksSection (src/ui/discover/sections.tsx), put a <SectionTitle> back above the card, move the
// accent label or "Past picks" out of the <Card>, or change the cover from 76 pt.
describe('Home: the Editor\'s pick card comes before For You', () => {
  it('the default order starts with picks, For You right after', () => {
    expect(SECTION_IDS[0]).toBe('picks');
    const order = sectionOrder(undefined);
    expect(order.indexOf('picks')).toBeLessThan(order.indexOf('forYou'));
  });
  it('the pick card carries its label and "Past picks" inside the card (rendered)', () => {
    const episode = { id: 'p1', feedUrl: 'https://f/p1.xml', guid: 'p1', title: 'Title p1', showTitle: 'Show p1', enclosureUrl: 'https://a/p1.mp3' };
    const onPast = jest.fn();
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode }], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast })); });
    expect(r.root.findAllByType(SectionTitle)).toHaveLength(0);
    const cards = r.root.findAllByType(Card);
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.findAllByType(Eyebrow).filter((e) => e.props['accent'] === true && e.props['children'] === "Editor's pick")).toHaveLength(1);
    const past = card.findAll((n) => n.props['accessibilityLabel'] === 'Past picks' && typeof n.props['onPress'] === 'function');
    expect(past.length).toBeGreaterThan(0);
    act(() => { past[0]!.props['onPress'](); });
    expect(onPast).toHaveBeenCalledTimes(1);
    expect(card.findAllByType(Artwork).map((a) => a.props['size'])).toContain(76);
    act(() => r.unmount());
  });
});

// Break: change `useState<NoticeSection>('people')` back to 'interactions' in app/notifications.tsx,
// or put the Interactions <Tab> first in src/ui/social/NoticeCards.tsx.
describe('Notifications: opens on People, the People pill first', () => {
  it('the page starts on the People feed', () => {
    expect(read('app/notifications.tsx')).toMatch(/useState<NoticeSection>\('people'\)/);
  });
  it('People is the first pill, and the chosen pill is dark with paper words', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(NoticeCards, { section: 'people', unread: 3, iconColour: '#111114', onSelect: () => undefined })); });
    const tabs = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
    expect(String(tabs[0]!.props['accessibilityLabel'])).toMatch(/^People\./);
    expect(tabs[0]!.props['accessibilityState']).toEqual({ selected: true });
    expect(String(tabs[0]!.props['className'])).toMatch(/\bbg-text\b/);
    expect(String(tabs[1]!.props['className'])).toMatch(/\bbg-surface\b/);
    act(() => r.unmount());
  });
  it('the System and From hosts cards are still on the page', () => {
    expect(read('app/notifications.tsx')).toMatch(/<NoticeEntries /);
  });
});

// Break: remove the <ActionsheetScrollView> around the ⋯ sheet's content in app/episode/[id].tsx.
describe('EpisodeMoreSheet: the sheet scrolls, so Cancel is never cut off', () => {
  it('everything from the tiles to Cancel sits inside the sheet\'s scroll view', () => {
    const sheet = between(read('app/episode/[id].tsx'), '<Actionsheet isOpen={more}', '</Actionsheet>');
    const scroll = between(sheet, '<ActionsheetScrollView', '</ActionsheetScrollView>');
    expect(scroll).toMatch(/<QueueButtons /);
    expect(scroll).toMatch(/<DownloadButton [^>]*beside=\{<FavouriteTile /);
    expect(scroll).toMatch(/<EpisodeExtras [^>]*noFavourite/);
    expect(scroll).toMatch(/accessibilityLabel="Cancel"/);
  });
});

// Break: put the ▶ / Share line (`accessibilityLabel={`Play ${item.episode.title}`}`) or the
// two-line description back under each row in app/history.tsx.
describe('History: a compact row, the extras behind its ⋯', () => {
  const src = read('app/history.tsx');
  it('no action line and no description under a row', () => {
    expect(src).not.toMatch(/accessibilityLabel=\{`Play \$\{item\.episode\.title\}`\}/);
    expect(src).not.toMatch(/accessibilityLabel=\{`Share \$\{item\.episode\.title\}`\}/);
    expect(src).not.toMatch(/plainSummary\(/);
  });
  it('the row\'s ⋯ opens the episode sheet, which keeps Play, Share and the comment count', () => {
    expect(src).toMatch(/onPress=\{\(\) => setMenuFor\(item\.episode\)\} accessibilityRole="button" accessibilityLabel=\{`More for \$\{item\.episode\.title\}`\}/);
    expect(src).toMatch(/comments=\{menuFor \? comments\[menuFor\.id\] : undefined\}/);
    expect(src).toMatch(/label: 'Play', onPress:/);
    // The sheet itself (Share, the comment count, the page's Play tile) is rendered in m24-screens.row-sheet.test.tsx.
  });
});

// Break: put { value: 'smart', label: 'Smart' } back into ORDERS, or drop the "Smart order" row.
describe('Comments: the design\'s three orders on a dark track; Smart kept in Order options', () => {
  const src = read('app/comments/[episodeId].tsx');
  it('three orders, dark tone', () => {
    const orders = between(src, 'const ORDERS', '];');
    expect(orders.match(/value: '/g)).toHaveLength(3);
    expect(src).toMatch(/<Segmented items=\{ORDERS\}[^>]*tone="dark"/);
  });
  it('Smart order and Reverse order are in the options sheet', () => {
    expect(src).toMatch(/label="Smart order"/);
    expect(src).toMatch(/label="Reverse order"/);
    expect(src).toMatch(/setOrder\(order === 'smart' \? 'newest' : 'smart'\)/);
  });
});
