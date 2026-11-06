// Spec 039 simulator run 42195300126 / 42195303610 / 42195307363: every control the Moments card draws is a 44 x 44 frame; the sound pill sits on the 20 gutter.
/**
 * a11y-frames read the DRAWN frames: "Sound off. Turn sound on" 116 x 32 at 14 pt, "React at 0:43" and "Comments at 0:43" 28 x 43, "Share a clip of 0:43" 36 x 44,
 * "Where people reacted. This moment" 350 x 24. Jest has no layout engine, so this reads the style the engine is given (`minHeight` / `minWidth` 44 on the control
 * that carries the name, `reach` on the curve), never `hitSlop` alone. Break to watch red: take `minHeight` off one of them.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MomentCard, type Ambient, type CardActions } from '@/ui/discover/MomentCard';
import type { Moment } from '@/discover/moments-api';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('@/ui/discover/useEpisodeHeat', () => ({ useEpisodeHeat: () => ({ buckets: Array.from({ length: 100 }, () => 0.2), durationMs: 2_890_000, comments: 318, mine: [] as number[] }) }));
jest.mock('@/ui/discover/useMomentActions', () => ({ useMomentActions: () => ({}) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({ clip: () => undefined }), usePlayerSelector: () => undefined }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}), useToast: () => jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));

const ITEM: Moment = { episodeId: 'e1', showTitle: 'Morning Notes', episodeTitle: 'Why mornings matter', startMs: 43_000, endMs: 60_000, reactions: 10, rank: 1, followed: true, comments: [] };
const GO: Ambient = { focused: true, appActive: true, reduceMotion: false, web: false };
const fn = jest.fn();
const actions: CardActions = { playFull: fn, toggleSound: fn, comments: fn, react: fn as never, share: fn };
const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
function card(): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(MomentCard, { item: ITEM, width: 390, height: 700, top: 47, active: true, near: true, ambient: GO, soundOn: false, actions })); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const control = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const is = (n: ReactTestInstance | null): boolean => n !== null && n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function';
  const found = r.root.findAll((n) => is(n) && !is(n.parent))[0];
  if (!found) throw new Error(`no control "${label}"`);
  return found;
};

describe('the Moments card controls are 44 x 44 frames', () => {
  it.each(['React at 0:43. 10 reacted', 'Comments at 0:43', 'Share a clip of 0:43'])('"%s" has a 44 x 44 minimum frame', (label) => {
    const s = flat(control(card(), label));
    expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(44);
    expect(Number(s['minWidth'])).toBeGreaterThanOrEqual(44);
  });
  it('the sound pill is a 44 tall frame that starts on the 20 gutter', () => {
    const s = flat(control(card(), 'Sound off. Turn sound on'));
    expect(Number(s['minHeight'])).toBeGreaterThanOrEqual(44);
    expect(s['left']).toBe(20);
  });
  it('the curve named "Where people reacted. This moment" has a frame of 44 (reach under the bars)', () => {
    const r = card();
    const curve = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Where people reacted. This moment: 0:43')[0]!;
    const s = flat(curve);
    expect(Number(s['height'])).toBeGreaterThanOrEqual(44);
  });
});

describe('other controls the simulator found under 44 pt', () => {
  it('a People card\'s name link ("Listener 08, open profile", 86 x 20) is a 44 frame', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FeedCard } = require('@/ui/notifications/cards') as typeof import('@/ui/notifications/cards');
    let r!: ReactTestRenderer;
    const item = { id: 1, kind: 'commented', actor: { id: 'u8', displayName: 'Listener 08' }, episode: { id: 'e1', title: 'Ep', showTitle: 'S', imageUrl: null }, momentMs: 50_000, refId: null, createdAt: new Date().toISOString() };
    act(() => { r = create(createElement(FeedCard, { item: item as never, onOpen: fn })); });
    mounted.push(r);
    const link = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Listener 08, open profile' && n.props['accessibilityRole'] === 'link')[0]!;
    expect(Number(flat(link)['minHeight'])).toBeGreaterThanOrEqual(44);
  });
  it('a quiet settings pill ("Email me a link to my data", 122 x 40) is a 44 frame', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { QuietPill } = require('@/ui/settings/panel') as typeof import('@/ui/settings/panel');
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(QuietPill, { label: 'Email me a link', accessibilityLabel: 'Email me a link to my data', height: 40, onPress: fn })); });
    mounted.push(r);
    const pill = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Email me a link to my data')[0]!;
    expect(Number(flat(pill)['minHeight'])).toBeGreaterThanOrEqual(44);
  });
});

describe('the stale note on Discover sections starts on the gutter (edges-check r18: 0 pt)', () => {
  it('"Couldn\'t refresh — showing what was fetched" has a 20 margin, not a 20 padding that puts its frame at 0', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DiscoverSections } = require('@/ui/discover/DiscoverSections') as typeof import('@/ui/discover/DiscoverSections');
    let r!: ReactTestRenderer;
    const body = { date: '2026-09-22', picks: [], talkedAbout: [], trending: [] };
    act(() => { r = create(createElement(DiscoverSections, { body: body as never, stale: true, fetchedAt: 1_700_000_000_000, onOpen: fn })); });
    mounted.push(r);
    const note = r.root.findAll((n) => typeof n.type === 'string' && String(n.type) === 'Text' && [n.props['children']].flat(5).join('').startsWith("Couldn't refresh"))[0]!;
    const s = flat(note);
    expect(s['paddingHorizontal'] ?? 0).toBe(0);
    expect(s['marginHorizontal']).toBe(20);
  });
});
