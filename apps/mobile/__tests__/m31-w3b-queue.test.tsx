// Tests that the queue page and the playlist chooser match their drawings in the numbers the owner compared.
/**
 * M31 W3-B (T041; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/listen.html `queue--screen`, `queue--empty`, `queue--item-sheet`, `queue--conflict-chooser`
 * and `toast--queue-buttons`. Each test names the revert that turns it red (each was seen red once, then restored):
 *  - cards 290 x 330, cover 46 %, radius 24: `QUEUE_CARD.width` / `height` / `coverShare` in src/ui/queue/measures.ts — red;
 *  - the first card has "Play now" (a 40 pill) and ···; the others the curve, ··· (40) and a 44 Play circle: swap `first` in `Card` — red;
 *  - a tap opens the episode, Play plays it (the strip's tiles play too): `onOpen` ↔ `onPlay` on the card's Pressable — red;
 *  - the dots: 4 high, the current one 18 wide, the rest 6: `QUEUE_DOTS.on` — red;
 *  - the strip starts at the third episode: `ids.slice(2)` → `slice(1)` — red;
 *  - Edit mode: ticks 26 at the card's foot, a tap ticks instead of opening: `props.select` branch — red;
 *  - the page: Edit circle hidden while empty, "Remove (n)" only while ticked, Clear all asks first and keeps the playing episode — red if
 *    `clearQueue(ids, current)` loses `current` or the dialog is skipped;
 *  - the chooser: two tiles, the phone's with the hot 1.5 outline, "Keep this phone's: 4" light and "Keep the other one: 6" quiet — red
 *    if `chosen` moves or the pill kinds swap.
 * NOT VERIFIED: how the slide feels on a phone (the sum is in queue-drag.test.ts), and anything seen on a device.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '@/design';

const mockPush = jest.fn();
const mockLoad = jest.fn();
let mockQueue: readonly string[] = [];
let mockCurrent: string | undefined;
const TITLES: Record<string, string> = { a: 'Cities that sleep late', b: 'The long walk home', c: 'Bread, slowly', d: 'Notes on attention', e: 'Ten minutes of rain', cur: 'Why mornings matter' };
const mockStores = {
  settings: { get: () => undefined },
  queue: { list: () => mockQueue, replace: (next: readonly string[]) => { mockQueue = [...next]; } },
  feeds: {
    getEpisode: (id: string) => (TITLES[id] ? { id, feedUrl: 'https://f/x.xml', title: TITLES[id], durationMs: 2_400_000 } : undefined),
    getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Night Shift Radio' }),
  },
  positions: { get: (id: string) => (id === 'b' ? { offsetMs: 600_000 } : undefined) },
  downloads: { get: (id: string) => (id === 'a' ? { state: 'complete' } : undefined) },
};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a) },
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  usePathname: () => '/queue',
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn(), useDownloads: () => undefined }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { social: () => Promise.resolve({ status: 404 }) } }) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ episodeId: id }) }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ load: (...a: unknown[]) => mockLoad(...a) }),
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel(mockCurrent ? { kind: 'playing', episodeId: mockCurrent, positionMs: 0, lastSavedMs: 0 } : { kind: 'idle' }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import QueueScreen from '../app/queue';
import { QueueList, dotsFor, queueSubtitle, queueTotal } from '@/ui/queue/QueueList';
import { QUEUE_CARD, QUEUE_DOTS, QUEUE_PITCH, CHOOSER } from '@/ui/queue/measures';
import { QueueChooser, listSummary } from '@/ui/queue/QueueChooser';

const rendered: ReactTestRenderer[] = [];
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockPush.mockClear(); mockLoad.mockClear(); mockCurrent = undefined; });
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); act(() => { n.props['onPress'](); }); };
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;
const classes = (n: ReactTestInstance) => [n, ...n.findAll((x) => typeof x.props['className'] === 'string')].map((x) => String(x.props['className'] ?? '')).join(' ');
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

const stores = mockStores as never;
const list = (ids: string[], extra: Partial<React.ComponentProps<typeof QueueList>> = {}) => {
  const onPlay = jest.fn(); const onOpen = jest.fn(); const onChange = jest.fn();
  const r = render(createElement(QueueList, { ids, stores, onPlay, onOpen, onChange, ...extra }));
  return { r, onPlay, onOpen, onChange };
};

describe('the cards (queue--screen)', () => {
  it('are 290 x 330 with a 24 radius, 10 apart, snapping one pitch (300) at a time', () => {
    const { r } = list(['a', 'b', 'c', 'd']);
    const cards = r.root.findAll((n) => n.props['testID'] === 'queue-card');
    expect(cards.length).toBeGreaterThanOrEqual(4);
    const st = flat(cards.find((n) => typeof n.type === 'string')!);
    expect(st['width']).toBe(290);
    expect(st['height']).toBe(330);
    expect(st['borderRadius']).toBe(24);
    const deck = r.root.findAll((n) => n.props['testID'] === 'queue-deck')[0]!;
    expect(deck.props['snapToInterval']).toBe(QUEUE_PITCH);
    expect(QUEUE_PITCH).toBe(300);
    expect(flat({ props: { style: deck.props['contentContainerStyle'] } } as never)['gap']).toBe(10);
    expect(flat({ props: { style: deck.props['contentContainerStyle'] } } as never)['paddingLeft']).toBe(28);
  });

  it('the cover is 46 % of the card (152) and carries the number, and DOWNLOADED on a downloaded one', () => {
    const { r } = list(['a', 'b']);
    expect(Math.round(QUEUE_CARD.height * QUEUE_CARD.coverShare)).toBe(152);
    const t = texts(r);
    expect(t).toContain('1 · DOWNLOADED');
    expect(t).toContain('"2"');
    expect(t.match(/DOWNLOADED/g)).toHaveLength(1); // only "a" is on the phone
  });

  it('the first card has the light "Play now" pill (40 tall) and ···; the others a 44 Play circle and ··· (40)', () => {
    const { r, onPlay } = list(['a', 'b']);
    const pill = byLabel(r, 'Play Cities that sleep late')[0]!;
    expect(classes(pill)).toContain('bg-text');
    expect(flat(pill)['height']).toBe(40);
    expect(texts(r)).toContain('Play now');
    const circle = byLabel(r, 'Play The long walk home')[0]!;
    expect(flat(hostOf(circle))['width']).toBe(44);
    expect(classes(circle)).toContain('bg-text');
    const more = byLabel(r, 'More for The long walk home')[0]!;
    expect(flat(hostOf(more))['width']).toBe(40);
    act(() => { pill.props['onPress'](); circle.props['onPress'](); });
    expect(onPlay.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('a tap on a card opens the episode and does not play it', () => {
    const { r, onOpen, onPlay } = list(['a', 'b']);
    press(r, 'Open The long walk home');
    expect(onOpen).toHaveBeenCalledWith('b');
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('··· opens the item sheet: Play now, Move to top / up / down and Remove from the queue write the queue', () => {
    const { r, onChange } = list(['a', 'b', 'c']);
    press(r, 'More for The long walk home');
    press(r, 'Move down');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c', 'b']);
    press(r, 'Move to top');
    expect(onChange).toHaveBeenLastCalledWith(['b', 'a', 'c']);
    press(r, 'More for The long walk home');
    press(r, 'Remove from the queue');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
  });

  it('long-press lifts a card (it grows 3 %) so it can be slid; a screen reader can remove it', () => {
    const { r, onChange } = list(['a', 'b', 'c']);
    const open = byLabel(r, 'Open The long walk home')[0]!;
    expect(open.props['onLongPress']).toBeInstanceOf(Function);
    expect(open.props['accessibilityHint']).toBe('Long-press, then slide to reorder');
    act(() => { open.props['onLongPress'](); });
    const lifted = r.root.findAll((n) => n.props['testID'] === 'queue-card' && typeof n.type === 'string').map(flat).find((s) => Array.isArray(s['transform']));
    expect(lifted).toBeDefined();
    expect((lifted!['transform'] as { scale?: number }[]).some((t) => t.scale === 1.03)).toBe(true);
    expect(r.root.findAll((n) => n.props['testID'] === 'queue-deck')[0]!.props['scrollEnabled']).toBe(false);
    const a11y = open.props['accessibilityActions'] as { name: string }[];
    expect(a11y.map((x) => x.name)).toContain('remove');
    act(() => { open.props['onAccessibilityAction']({ nativeEvent: { actionName: 'remove' } }); });
    expect(onChange).toHaveBeenCalledWith(['a', 'c']);
  });

  it('Edit mode: a 26 tick at the card\'s foot, ticked = hot with a check; a tap ticks and does not open', () => {
    const onToggle = jest.fn();
    const { r, onOpen } = list(['a', 'b'], { select: { chosen: new Set(['b']), onToggle } });
    const boxes = r.root.findAll((n) => n.props['accessibilityRole'] === 'checkbox' && typeof n.type === 'string');
    expect(boxes).toHaveLength(2);
    expect(boxes.filter((n) => n.props['accessibilityState']?.checked === true)).toHaveLength(1);
    const ticks = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 26 && flat(n)['height'] === 26);
    expect(ticks.length).toBe(2);
    expect(ticks.map((n) => flat(n)['backgroundColor'])).toContain(colour.hot);
    press(r, 'Select Cities that sleep late');
    expect(onToggle).toHaveBeenCalledWith('a');
    expect(onOpen).not.toHaveBeenCalled();
    expect(byLabel(r, 'Open Cities that sleep late')).toHaveLength(0);
  });
});

describe('dots and the strip', () => {
  it('four dots for four episodes: the current one 18 wide, the others 6, all 4 high', () => {
    const { r } = list(['a', 'b', 'c', 'd']);
    const dots = r.root.findAll((n) => n.props['testID'] === 'queue-dots')[0]!;
    const bars = dots.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === QUEUE_DOTS.height);
    expect(bars.map((n) => flat(n)['width'])).toEqual([18, 6, 6, 6]);
  });
  it('a long queue shows a window of ten round the current card', () => {
    expect(dotsFor(4, 0).map((d) => d.at)).toEqual([0, 1, 2, 3]);
    expect(dotsFor(30, 0)).toHaveLength(10);
    expect(dotsFor(30, 20).map((d) => d.at)[0]).toBe(15);
    expect(dotsFor(30, 20).filter((d) => d.on).map((d) => d.at)).toEqual([20]);
    expect(dotsFor(30, 29).map((d) => d.at).pop()).toBe(29);
  });
  it('the strip holds the rest of the queue from the third episode as "3. Title" tiles that play', () => {
    const { r, onPlay } = list(['a', 'b', 'c', 'd']);
    expect(r.root.findAll((n) => n.props['testID'] === 'queue-strip').length).toBeGreaterThan(0);
    const t = texts(r);
    expect(t).toContain('3. Bread, slowly');
    expect(t).toContain('4. Notes on attention');
    expect(t).not.toContain('2. The long walk home');
    press(r, 'Play Bread, slowly');
    expect(onPlay).toHaveBeenCalledWith('c');
  });
  it('with two episodes there is no strip', () => {
    const { r } = list(['a', 'b']);
    expect(r.root.findAll((n) => n.props['testID'] === 'queue-strip')).toHaveLength(0);
  });
  it('the subtitle counts and totals what is left: "3 episodes · 1 h 50 min" (the 10 min already heard come off)', () => {
    expect(queueTotal(['a', 'b', 'c'], mockStores as never)).toBe('1 h 50 min');
    expect(queueSubtitle(['a', 'b', 'c'], mockStores as never)).toBe('3 episodes · 1 h 50 min');
    expect(queueSubtitle(['zzz'], mockStores as never)).toBe('1 episode');
  });
});

describe('the page (app/queue.tsx)', () => {
  it('empty: the shared empty block with its Discover button, no Edit circle, subtitle "0 episodes"', () => {
    mockQueue = [];
    const r = render(createElement(QueueScreen));
    expect(texts(r)).toContain('Nothing queued.');
    expect(texts(r)).toContain('Use Add to queue on an episode.');
    expect(byLabel(r, 'Open Discover').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Edit')).toHaveLength(0);
    expect(texts(r)).toContain('0 episodes');
  });

  it('with episodes: title "Queue", the count and time, the Edit circle; the Play pill plays, takes it off the queue, opens the player', () => {
    mockQueue = ['a', 'b', 'c'];
    const r = render(createElement(QueueScreen));
    expect(texts(r)).toContain('Queue');
    expect(texts(r)).toContain('3 episodes · 1 h 50 min');
    expect(byLabel(r, 'Edit').length).toBeGreaterThan(0);
    press(r, 'Play Cities that sleep late');
    expect(mockLoad).toHaveBeenCalledWith({ episodeId: 'a' }, 'play');
    expect(mockQueue).toEqual(['b', 'c']);
    expect(mockPush).toHaveBeenCalledWith('/player');
  });

  it('a tap on a card opens the episode page', () => {
    mockQueue = ['a', 'b'];
    const r = render(createElement(QueueScreen));
    press(r, 'Open The long walk home');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/episode/[id]', params: { id: 'b' } });
  });

  it('Edit: tick two, "Remove (2)" shows only then and removes them; Done leaves', () => {
    mockQueue = ['a', 'b', 'c', 'd'];
    const r = render(createElement(QueueScreen));
    press(r, 'Edit');
    expect(byLabel(r, 'Edit')).toHaveLength(0);
    expect(byLabel(r, 'Clear all').length).toBeGreaterThan(0);
    expect(r.root.findAll((n) => String(n.props['accessibilityLabel'] ?? '').startsWith('Remove (')).length).toBe(0);
    press(r, 'Select The long walk home');
    press(r, 'Select Notes on attention');
    press(r, 'Remove (2)');
    expect(mockQueue).toEqual(['a', 'c']);
    press(r, 'Done');
    expect(byLabel(r, 'Edit').length).toBeGreaterThan(0);
  });

  it('Clear all asks once ("Clear the playlist?") and keeps the episode playing now', () => {
    mockQueue = ['a', 'cur', 'b'];
    mockCurrent = 'cur';
    const r = render(createElement(QueueScreen));
    press(r, 'Edit');
    press(r, 'Clear all');
    expect(mockQueue).toEqual(['a', 'cur', 'b']); // asked first, nothing written yet
    const dialog = r.root.findAll((n) => n.props['testID'] === 'dialog')[0]!;
    expect(JSON.stringify(dialog.props['accessibilityLabel'])).toContain('Clear the playlist?');
    const buttons = dialog.findAll((n) => n.props['accessibilityRole'] === 'button' && typeof n.props['onPress'] === 'function');
    act(() => { buttons.find((b) => b.props['accessibilityLabel'] === 'Clear all')!.props['onPress'](); });
    expect(mockQueue).toEqual(['cur']);
  });
});

describe('the playlist chooser (queue--conflict-chooser)', () => {
  const feeds = { getEpisode: (id: string) => (TITLES[id] ? ({ id, title: TITLES[id] } as never) : undefined) };
  const choice = { local: ['a', 'b', 'c', 'd'], server: ['b', 'c', 'd', 'e', 'a', 'cur'], serverDevice: 'iPad' } as never;
  const open = (extra: Partial<React.ComponentProps<typeof QueueChooser>> = {}) => {
    const onKeep = jest.fn();
    const r = render(createElement(QueueChooser, { choice, open: true, feeds, onKeep, onClose: jest.fn(), ...extra }));
    return { r, onKeep };
  };
  it('names both lists, the phone\'s with the hot 1.5 outline, the other without', () => {
    const { r } = open();
    const t = texts(r);
    expect(t).toContain('Which playlist do you want to keep?');
    expect(t).toContain('THIS PHONE');
    expect(t).toContain('YOUR OTHER DEVICE');
    expect(t).toContain('Cities that sleep late, and 3 more');
    expect(t).toContain('The long walk home, and 5 more');
    const tiles = r.root.findAll((n) => n.props['testID'] === 'chooser-tile' && typeof n.type === 'string');
    expect(tiles).toHaveLength(2);
    expect(flat(tiles[0]!)['borderWidth']).toBe(CHOOSER.outline);
    expect(flat(tiles[0]!)['borderColor']).toBe(colour.hot);
    expect(flat(tiles[1]!)['borderWidth']).toBeUndefined();
    expect(flat(tiles[0]!)['borderRadius']).toBe(22);
    expect(flat(tiles[0]!)['padding']).toBe(14);
  });
  it('two pills: "Keep this phone\'s: 4" light and "Keep the other one: 6" quiet; each keeps its own list', () => {
    const { r, onKeep } = open();
    const phone = byLabel(r, "Keep this phone's: 4 episodes")[0]!;
    const other = byLabel(r, 'Keep the other one: 6 episodes')[0]!;
    expect(classes(phone)).toContain('bg-text');
    expect(classes(other)).toContain('bg-raise');
    expect(texts(r)).toContain("Keep this phone's: 4");
    expect(texts(r)).toContain('Keep the other one: 6');
    act(() => { phone.props['onPress'](); other.props['onPress'](); });
    expect(onKeep.mock.calls.map((c) => c[0])).toEqual(['local', 'server']);
  });
  it('a pill is dropped while a choice is being saved', () => {
    const { r, onKeep } = open({ busy: true });
    const phone = r.root.findAll((n) => n.props['accessibilityLabel'] === "Keep this phone's: 4 episodes")[0]!;
    expect(phone.props['onPress']).toBeUndefined();
    expect(onKeep).not.toHaveBeenCalled();
  });
  it('the summary: counts and the first three titles', () => {
    expect(listSummary(['a', 'b', 'c', 'd'], feeds)).toEqual({ count: '4 episodes', titles: ['Cities that sleep late', 'The long walk home', 'Bread, slowly'] });
    expect(listSummary([], feeds).count).toBe('Empty');
  });
});
