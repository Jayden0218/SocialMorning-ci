// Tests the round-3 fixes that make wave 1 match design-pulse2: grabber, drawn icons, web image, chapter chips, bottom inset reads.
/**
 * M31 lane L11 (owner, 2026-10-28: "I want completely same, or explain why it is different"). Each test names the revert that turns it red:
 *  - sheets: the grabber zone back to a 48 / 32 tall box (the content sat 27–43 down) — red;
 *  - drawn icons: `Icon` back to Ionicons only, or a mapping row dropped — red;
 *  - web image: `src/ui/lib/image` back to replacing the caller's style (every cover collapsed to 30 x 30 on the web build) — red;
 *  - chapters: the chip back to "0:00" — red (the first height is in m31-l8-drawing.test.tsx);
 *  - sleep line: a plain space after the dot (dropped at a line's end on the web: "24:12 ·Cancel") — red;
 *  - Moments page: `insets.bottom` back in the .tsx (G-BB1 in bottom-bar.test.ts) — red.
 */
jest.useFakeTimers();
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars } from '@/design';
import { ActionSheet, GRAB_SLOP as ACTION_SLOP } from '@/ui/kit/ActionSheet';
import { GRAB_SLOP as SHEET_SLOP, Sheet } from '@/ui/kit/Sheet';
import { Icon } from '@/ui/kit/Icon';
import { DRAWN_ICONS } from '@/ui/kit/drawn-icons';
import { Image } from '@/ui/lib/image';
import { ChapterList, chapterStamp } from '@/ui/player/ChapterList';
import { useBelow } from '@/ui/discover/useBelow';
import { PLAYER } from '@/ui/player/measures';
import { TABS } from '@/ui/shell/tabs';
import { SHORTCUT_ICONS } from '@/ui/discover/DiscoverShortcuts';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }), useFocusEffect: () => undefined }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined }, queue: { list: () => [] } }), useToast: () => () => undefined, useCovered: () => false }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const SRC = (file: string): string => readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('sheets: the grabber is drawn 5 tall with a 14 gap; the 44 touch is hitSlop', () => {
  const slopHeight = (s: { top: number; bottom: number }, drawn: number): number => s.top + drawn + s.bottom;
  it('the content sheet: a 5 tall grab zone, 44+ to touch, 36 + 40 wide', () => {
    const r = render(createElement(ActionSheet, { open: true, onClose: jest.fn(), label: 'More', title: 'More' }));
    const zone = byId(r, 'action-sheet-grab-zone')[0]!;
    expect(flat(zone.props['style'])).toMatchObject({ height: bars.dot });
    expect(flat(zone.props['style'])['minHeight']).toBeUndefined();
    expect(zone.props['hitSlop']).toEqual(ACTION_SLOP);
    expect(slopHeight(ACTION_SLOP, bars.dot)).toBeGreaterThanOrEqual(44);
    expect(bars.sheetGrab + ACTION_SLOP.left + ACTION_SLOP.right).toBeGreaterThanOrEqual(44);
  });
  it('the snap sheet: the handle is 5 tall, 8 under the top, 14 above its content, a button named taller/shorter with a 44+ slop', () => {
    const r = render(createElement(Sheet, { open: true, onClose: jest.fn(), label: 'Playlist' }));
    const handle = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Make the sheet taller' && typeof n.props['onPress'] === 'function')[0]!;
    expect(flat(handle.props['style'])).toMatchObject({ height: 5, marginTop: 8, marginBottom: 14 });
    expect(flat(handle.props['style'])['minHeight']).toBeUndefined();
    expect(handle.props['hitSlop']).toEqual(SHEET_SLOP);
    expect(slopHeight(SHEET_SLOP, bars.dot)).toBeGreaterThanOrEqual(44);
  });
});

describe('the drawing\'s own icons', () => {
  const xmlOf = (name: string, color: string): string => String(render(createElement(Icon, { name: name as never, size: 24, color })).root.findAll((n) => n.props['testID'] === `icon-${name}`)[0]?.props['xml']);
  it('a name the drawing has a shape for is drawn as that shape, in the caller\'s colour, 1.9 stroked', () => {
    const play = xmlOf('play', '#123456');
    expect(play).toContain('M8 5.5v13l11-6.5z');
    expect(play).toContain('stroke="#123456"');
    expect(play).not.toContain('currentColor');
    expect(xmlOf('cut-outline', '#ffffff')).toContain('M8 8.5L20 16M8 15.5L20 8'); // the scissors
    expect(xmlOf('skip-back-15', '#ffffff')).toContain('M5 12a7 7 0 1 0 2-5'); // the two circular skip arrows exist only here
    expect(xmlOf('skip-forward-30', '#ffffff')).toContain('M19 12a7 7 0 1 1-2-5');
    expect(xmlOf('chevron-down', '#ffffff')).toContain('stroke-width="1.9"');
  });
  it('a name with no drawing falls back to the Ionicons glyph, as before', () => {
    const r = render(createElement(Icon, { name: 'rocket-outline', size: 24, color: '#fff' }));
    expect(r.root.findAll((n) => typeof n.props['testID'] === 'string' && n.props['testID'].startsWith('icon-'))).toHaveLength(0);
  });
  it('every icon the six wave-1 screens ask for has its drawing (the tab bar, the shortcut tiles, the sheets, the tray)', () => {
    const asked = [
      ...TABS.flatMap((t) => (t.icon ? [t.icon.idle, t.icon.active] : [])), ...Object.values(SHORTCUT_ICONS),
      'play', 'pause', 'moon-outline', 'ellipsis-horizontal', 'close', 'chevron-down', 'chevron-forward', 'add', 'share-outline', 'search-outline', 'scan-outline',
      'chatbubble-outline', 'heart-outline', 'heart', 'cut-outline', 'list', 'star-outline', 'star', 'information-circle-outline', 'document-text-outline', 'flame-outline',
      'volume-high', 'volume-mute', 'settings-outline', 'skip-back-15', 'skip-forward-30',
    ];
    expect(asked.filter((n) => DRAWN_ICONS[n] === undefined)).toEqual([]);
  });
  it('the player\'s skip buttons use the drawn arrows, not a mirrored glyph', () => {
    const t = SRC('src/ui/player/TransportRow.tsx');
    expect(t).toContain('"skip-back-15"');
    expect(t).toContain('"skip-forward-30"');
    expect(t).not.toContain('refresh-outline');
    expect(t).not.toContain('scaleX');
  });
});

describe('the web build keeps the caller\'s image style', () => {
  afterEach(() => { jest.restoreAllMocks(); });
  it('on the web the class-size reset comes first and the caller\'s style after it; on a phone the style is the caller\'s, untouched', () => {
    const style = { position: 'absolute' as const, width: 205, height: 205 };
    const find = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => typeof n.type === 'string' && n.props['source'] !== undefined)[0]!;
    const phone = render(createElement(Image, { source: { uri: 'https://a/b.png' }, style }));
    expect(flat(find(phone).props['style'])).toMatchObject(style);
    jest.replaceProperty(Platform, 'OS', 'web');
    const web = render(createElement(Image, { source: { uri: 'https://a/b.png' }, style }));
    expect(flat(find(web).props['style'])).toMatchObject(style); // not 'revert-layer'
  });
});

describe('the chapter list and the More sheet\'s first height', () => {
  it('the chip is two-digit minutes as drawn ("00:00", "04:12", "12:05"); an hour reads h:mm:ss', () => {
    expect(chapterStamp(0)).toBe('00:00');
    expect(chapterStamp(252_000)).toBe('04:12');
    expect(chapterStamp(725_000)).toBe('12:05');
    expect(chapterStamp(3_725_000)).toBe('1:02:05');
  });
  it('the list draws the chips that way', () => {
    const chapters = [{ startMs: 0, title: 'Cold open' }, { startMs: 252_000, title: 'Why the first hour counts' }];
    const r = render(createElement(ChapterList, { chapters, positionMs: 0, onSeek: jest.fn() }));
    const words = r.root.findAll((n) => String(n.type) === 'Text').map((n) => [n.props['children']].flat(5).join(''));
    expect(words).toEqual(expect.arrayContaining(['00:00', '04:12']));
  });
});

describe('small things the capture found', () => {
  it('the Playback sheet\'s lines are the drawn ones: a tile\'s detail on a 16 line (the tile is 77, not 82) and the sleep line on the mono face\'s 16, not the step\'s 22', () => {
    // Red if a detail goes back to the caption step's 18 line, or the sleep line back to the mono step's 22.
    expect(PLAYER.panelDetailLine).toBe(16);
    expect(PLAYER.sleepHeadLine).toBe(16);
    expect(PLAYER.panelPad * 2 - 4 + 20 + PLAYER.detailGap + PLAYER.panelDetailLine * 2).toBe(78); // drawn 77: 14 + 14 + 18.75 + 2 + 2 x 16.2
    for (const [f, n] of [['SettingsPanel', 2], ['SleepTimerControl', 1], ['SpeedControl', 1]] as const) expect(SRC(`src/ui/player/${f}.tsx`).match(/lineHeight: PLAYER\.panelDetailLine/g)).toHaveLength(n);
    expect(SRC('src/ui/player/SleepTimerControl.tsx').match(/lineHeight: PLAYER\.sleepHeadLine/g)).toHaveLength(2);
  });
  it('the sleep line\'s gap before Cancel is a no-break space (a plain trailing space is dropped on the web: "24:12 ·Cancel")', () => {
    const src = SRC('src/ui/player/SleepTimerControl.tsx');
    expect(src).toContain("export const NBSP = '\\u00A0';");
    expect(src).toContain('·$' + '{NBSP}`');
  });
  it('the Moments page reads the bottom inset in a hook, not in the .tsx: the tab bar (58) + the strip', () => {
    let seen = 0;
    const setSeen = (v: number): void => { seen = v; };
    const Probe = (): null => { setSeen(useBelow()); return null; };
    render(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, createElement(Probe)));
    expect(seen).toBe(58 + 34);
    const feed = SRC('src/ui/discover/MomentsFeed.tsx');
    expect(feed).toContain("from './useBelow'");
    expect(feed).not.toMatch(/insets\.bottom/);
  });
});
