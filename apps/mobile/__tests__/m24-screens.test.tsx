// Tests that the M24 per-screen look keeps its order, defaults and room (guard G-M24-B3).
/**
 * M24 lane B3 (US20, the B "Editorial" designs per screen). Source scans where the fact is a
 * layout choice a renderer cannot see without the whole screen and its providers; a render
 * where the part stands alone. Everything here is NOT VERIFIED on a phone until a build is shot.
 *
 * Each block names the break that turns it red.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SECTION_IDS, sectionOrder } from '@/discover/sections';
import { NoticeCards } from '@/ui/social/NoticeCards';

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8');
/** The text between two markers (both must exist). */
const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(to, a);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

// Break: put 'forYou' back before 'picks' in SECTION_IDS (src/discover/sections.ts).
describe('Home: the Editor\'s pick card comes before For You', () => {
  it('the default order starts with picks, For You right after', () => {
    expect(SECTION_IDS[0]).toBe('picks');
    const order = sectionOrder(undefined);
    expect(order.indexOf('picks')).toBeLessThan(order.indexOf('forYou'));
  });
  it('the pick card carries its label and "Past picks" inside the card', () => {
    const picks = between(read('src/ui/discover/sections.tsx'), 'export function PicksSection(', '/** The chart');
    expect(picks).not.toMatch(/<SectionTitle/);
    expect(picks).toMatch(/<Card[\s\S]*<Eyebrow accent[\s\S]*accessibilityLabel="Past picks"[\s\S]*<\/Card>/);
    expect(picks).toMatch(/size=\{76\}/);
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
    expect(read('src/ui/kit/EpisodeRowSheet.tsx')).toMatch(/label: 'Share'/);
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
