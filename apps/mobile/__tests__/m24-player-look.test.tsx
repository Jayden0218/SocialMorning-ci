// Tests the player parts that outlived M24's look: the Playback sheet, the strong Play buttons.
/**
 * M24 US19 guard G-M24-B2 (the owner: "the phone looks bad"; iPhone shots
 * docs/plans/m24-audit/phone/04-player.png, 08-playback.png). Rendered props, plus source rules only
 * for facts that live in an expo-router page (the mini player and "Up next" are rendered in
 * m24-player-look.parts.test.tsx) — how it looks on a phone is NOT VERIFIED until the head installs a build.
 * M31 T024: the player page is the Pulse ring player now (m31-player.test.tsx); the Playback sheet below is the
 * Pulse one (dial, rings) (the old `HeatScrubber` seek bar was retired in wave 8, T080).
 *
 * The break that turns it red: in src/ui/player/SettingsPanel.tsx render the M21 rows (Loop …) on the
 * first page again, or put Chapters / Transcript back on it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colour } from '@/design';
import { applyAccent } from '@/design/accent';
import type { NextUpItem } from '@/social/api';

jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light', set: () => undefined },
    feeds: { getEpisode: () => ({ id: 'e1', feedUrl: 'https://f/x.xml', title: 'Ep' }) },
    speed: { get: () => undefined, set: () => undefined, clear: () => undefined },
  }),
}));
// The queue page's cards read each episode's curve.
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { social: () => Promise.resolve({ status: 404 }) } }) }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({
    subscribe: () => () => undefined,
    rate: () => 1.2,
    defaultRate: () => 1.2,
    setRate: () => undefined,
    setDefaultRate: () => undefined,
    sleepTimer: () => ({ endOfEpisode: false }),
    sleepRemainingMs: () => undefined,
    setSleepTimer: () => undefined,
    setSleepEndOfEpisode: () => undefined,
  }),
  // M31 T024 (C4): the sheet's speed block reads the player through selectors.
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'playing', episodeId: 'e1', positionMs: 0, lastSavedMs: 0 }),
}));

import { SettingsPanel } from '@/ui/player/SettingsPanel';
import { EndOffer } from '@/ui/player/EndOffer';
import { QueueList } from '@/ui/queue/QueueList';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const rendered: ReactTestRenderer[] = [];
const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, el)); });
  rendered.push(r);
  return r;
};
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); });
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const press = (r: ReactTestRenderer, label: string) => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};
const texts = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

describe('the Playback sheet (Pulse: the dial, the sleep rings, and "More settings" behind a tile)', () => {
  const props = { open: true, onClose: () => undefined, looping: false, onLoop: () => undefined, skipSilence: false, onSkipSilence: () => undefined };

  it('is "Playback": the speed dial, − and +, presets, six sleep rings with End of episode — the M21 rows wait behind "More settings"', () => {
    const r = render(createElement(SettingsPanel, props));
    const all = labels(r);
    expect(texts(r)).toContain('Playback');
    for (const l of ['Slower', 'Faster', '1×', '1.2×', '1.5×', '2×', 'Sleep in 5 minutes', 'Sleep in 60 minutes', 'Stop at the end of this episode', 'Close the player settings', 'Close']) expect(all).toContain(l);
    // The dial is the one adjustable "Speed"; the six minutes are rings, 90 is behind More settings.
    expect(r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Speed' && n.props['accessibilityRole'] === 'adjustable')).toHaveLength(1);
    expect(all).not.toContain('Loop this episode');
    expect(all).not.toContain('Skip silence');
    expect(all).not.toContain('Sleep in 90 minutes');
    // Chapters and Transcript MOVED to the player's More sheet (design action map).
    expect(all.some((l) => /^Chapters/.test(l))).toBe(false);
    expect(all).not.toContain('Transcript');
  });

  it('"More settings" keeps every M21 extra, and Back returns', () => {
    const r = render(createElement(SettingsPanel, props));
    press(r, 'More settings: loop, audio output, skip silence, voice boost');
    const all = labels(r);
    for (const l of ['Speed', 'Sleep in 90 minutes', 'Stop at the end of this episode']) expect(all).toContain(l);
    for (const w of ['Loop this episode', 'Skip silence', 'This show only']) expect(texts(r)).toContain(w);
    expect(texts(r)).toContain('fades out over the last 10 seconds');
    press(r, 'Back to Playback');
    expect(texts(r)).not.toContain('Loop this episode');
  });
});

// M24 fix F-P: main Play buttons use the fixed `play` token, not `primary` (which the accent theme
// swaps); list-row ▶ discs stay the pale `playDisc`. `play` and `primary` are both #fcc522 in the
// default theme, so the rendered class names tell them apart.
// Breaks that turn these red: `bg-play` → `bg-primary` on EndOffer's "Play it" or a QueueList
// Play pill; `bg-playDisc` → `bg-play` on a row disc.
/** Every class name on a node and inside it. */
const classesIn = (n: ReactTestInstance): string =>
  [n, ...n.findAll((x) => typeof x.props['className'] === 'string')].map((x) => String(x.props['className'] ?? '')).join(' ');
const pressableOf = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const queueStores = {
  feeds: {
    getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: id === 'e1' ? 'Casey Wants to Believe' : 'Foot Terminal', durationMs: 2_057_000 }),
    getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
  },
  positions: { get: () => undefined },
  downloads: { get: () => undefined },
} as never;

describe('the strong Play buttons (rendered)', () => {
  afterEach(() => { act(() => { applyAccent('sunrise'); }); });

  it('the end-of-episode offer\'s "Play it" is bg-play, never bg-primary, and plays', () => {
    const item = {
      episode: { id: 'n1', feedUrl: 'https://f/x.xml', guid: 'n1', title: 'Next One', showTitle: 'Reply All', enclosureUrl: 'https://a/n1.mp3' },
      reason: 'newOnShow',
      label: 'New on this show',
    } as NextUpItem;
    const onPlay = jest.fn();
    const r = render(createElement(EndOffer, { item, onPlay }));
    const play = r.root.findAll((x) => typeof x.props['onPress'] === 'function' && x.findAll((t) => typeof t.type === 'string' && t.props['children'] === 'Play it').length > 0)[0];
    expect(play).toBeDefined();
    expect(classesIn(play!)).toMatch(/\bbg-play\b/);
    expect(classesIn(play!)).not.toMatch(/\bbg-primary\b/);
    act(() => { play!.props['onPress'](); });
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  // M31 W3-B: the queue page's cards are the Pulse ones — the Play circle and the Play now pill are the light `bg-text`
  // (they do not follow the accent), the cover band carries the number.
  it('the queue page: a card\'s Play circle is the light disc (44 pt), not bg-play or bg-primary', () => {
    const r = render(createElement(QueueList, { ids: ['e1', 'e2'], stores: queueStores, onChange: jest.fn(), onPlay: jest.fn(), onOpen: jest.fn() }));
    const disc = pressableOf(r, 'Play Foot Terminal');
    expect(classesIn(disc)).toMatch(/\bbg-text\b/);
    expect(classesIn(disc)).not.toMatch(/\bbg-play\b/);
    expect(classesIn(disc)).not.toMatch(/\bbg-primary\b/);
    const host = disc.findAll((x) => typeof x.type === 'string')[0]!;
    expect((StyleSheet.flatten(host.props['style']) as Record<string, unknown>)['width']).toBe(44);
  });

  it('the queue page: the next episode\'s Play now pill is the light `bg-text` pill', () => {
    const r = render(createElement(QueueList, { ids: ['e1', 'e2'], stores: queueStores, onChange: jest.fn(), onPlay: jest.fn(), onOpen: jest.fn() }));
    const cls = classesIn(pressableOf(r, 'Play Casey Wants to Believe'));
    expect(cls).toMatch(/\bbg-text\b/);
    expect(cls).not.toMatch(/\bbg-primary\b/);
  });
});

// Kept as source checks: the Episode page's Play button lives only in app/episode/[id].tsx (~52 imports,
// no smaller part to render). The player's own looks are rendered in m31-player.test.tsx.
describe('the look, from the source (page-only facts)', () => {
  it('the Episode page\'s main Play button is the light pill, never the accent', () => {
    // M24 fix F-P: the fixed `play` token, not `primary` (which the accent theme swaps). M31 W3-A: the Pulse light pill.
    expect(read('src/ui/episode/EpisodeTitleBlock.tsx')).toMatch(/kind="light"/);
    expect(read('src/ui/kit/PulseButton.tsx')).toMatch(/light: 'bg-text'/);
  });
});
