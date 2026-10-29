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
  it('the picks deck: an edge label (spoken "Editor\'s pick"), one card per pick with the 64 cover; "Past picks" is in the pick tile (rendered)', () => {
    // M31 T030 (`home--fold-a`): the section's title is the vertical edge label, not a heading row or an Eyebrow
    // inside the card; the card's cover is 64; "Past picks →" is drawn in the pick tile at the top (DiscoverMosaic), not repeated.
    const episode = { id: 'p1', feedUrl: 'https://f/p1.xml', guid: 'p1', title: 'Title p1', showTitle: 'Show p1', enclosureUrl: 'https://a/p1.mp3' };
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(PicksSection, { items: [{ kind: 'pick', key: 'p1', episode }], onOpen: jest.fn(), onPlay: jest.fn(), onQueue: jest.fn(), onPast: jest.fn() })); });
    expect(r.root.findAllByType(SectionTitle)).toHaveLength(0);
    expect(r.root.findAllByType(Card)).toHaveLength(0);
    const cards = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'deck-card');
    expect(cards).toHaveLength(1);
    expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && n.props['accessibilityLabel'] === "Editor's pick")).not.toHaveLength(0);
    expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Past picks')).toHaveLength(0);
    // Artwork is memo'd (the perf port, 2026-10-13): the rendered instance's type is the inner view.
    expect(cards[0]!.findAllByType(Artwork.type).map((a) => a.props['size'])).toContain(64);
    act(() => r.unmount());
  });
});

// Break: change `useState<NoticeSection>('people')` back to 'interactions' in app/notifications.tsx,
// or put the Interactions <Tab> first in src/ui/social/NoticeCards.tsx.
describe('Notifications: opens on People, the People pill first', () => {
  it('the page starts on the People feed', () => {
    expect(read('app/notifications.tsx')).toMatch(/useState<NoticeSection>\('people'\)/);
  });
  it('People is the first pill, and the chosen pill is light with void words', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(NoticeCards, { section: 'people', unread: 3, iconColour: '#111114', onSelect: () => undefined })); });
    const tabs = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
    expect(String(tabs[0]!.props['accessibilityLabel'])).toMatch(/^People\./);
    expect(tabs[0]!.props['accessibilityState']).toEqual({ selected: true });
    expect(String(tabs[0]!.props['className'])).toMatch(/\bbg-text\b/);
    // M31 W4-C: the other pill has no fill of its own (the track behind both is raise).
    expect(String(tabs[1]!.props['className'])).not.toMatch(/\bbg-text\b/);
    act(() => r.unmount());
  });
  it('the System and From hosts cards are still on the page', () => {
    expect(read('app/notifications.tsx')).toMatch(/<NoticeEntries /);
  });
});

// Break: remove the <ActionsheetScrollView> around the ⋯ sheet's content in app/episode/[id].tsx.
describe('EpisodeMoreSheet: the sheet scrolls, so Cancel is never cut off', () => {
  it('everything from the tiles to Cancel sits inside the sheet\'s scroll view', () => {
    // M31 W3-A (T040): the sheet is src/ui/episode/EpisodeMoreSheet.tsx (the kit ActionSheet); its tiles and Cancel are the shared
    // EpisodeSheetBody inside the scroll view. Rendered in m31-w3a-episode.test.tsx.
    const sheet = between(read('src/ui/episode/EpisodeMoreSheet.tsx'), '<ActionSheet ', '</ActionSheet>');
    const scroll = between(sheet, '<ScrollView', '</ScrollView>');
    expect(scroll).toMatch(/<EpisodeSheetBody/);
    expect(sheet).toMatch(/maxHeight: screen\.height \* MAX/);
    const body = read('src/ui/episode/EpisodeSheetBody.tsx');
    expect(body).toMatch(/<PulseTileGrid>/);
    expect(body).toMatch(/<DownloadTiles/);
    expect(body).toMatch(/label="Cancel"/);
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
  // M31 W3-C (`history--screen`): the ⋯ button left the card; the sheet opens on a long-press and as the card's
  // `longpress` accessibility action named "More for …" (rendered in m31-w3c-history.test.tsx).
  it('a long-press on the row (and its "More for …" accessibility action) opens the episode sheet, which keeps Play, Share and the comment count', () => {
    expect(src).toMatch(/onLongPress=\{\(\) => setMenuFor\(item\.episode\)\}/);
    expect(src).toMatch(/accessibilityActions=\{\[\{ name: 'longpress', label: `More for \$\{item\.episode\.title\}` \}\]\}/);
    expect(src).toMatch(/comments=\{menuFor \? comments\[menuFor\.id\] : undefined\}/);
    expect(src).toMatch(/label: 'Play', onPress:/);
    // The sheet itself (Share, the comment count, the page's Play tile) is rendered in m24-screens.row-sheet.test.tsx.
  });
});

// Break: put { value: 'smart', label: 'Smart' } back into ORDERS, or drop the "Smart order" row.
describe('Comments: the design\'s three orders on a dark track; Smart kept in Order options', () => {
  const src = read('app/comments/[episodeId].tsx');
  it('three orders, on the Pulse capsule', () => {
    const orders = between(src, 'const ORDERS', '];');
    expect(orders.match(/value: '/g)).toHaveLength(3);
    // M31 W2-B: the Pulse capsule (a 40 raise track, the chosen choice light) replaces the dark `Segmented`.
    expect(src).toMatch(/<Capsule items=\{ORDERS\}/);
  });
  it('Smart order and Reverse order are in the options sheet', () => {
    expect(src).toMatch(/label="Smart order"/);
    expect(src).toMatch(/label="Reverse order"/);
    expect(src).toMatch(/setOrder\(smartOn \? 'newest' : 'smart'\)/);
  });
});
