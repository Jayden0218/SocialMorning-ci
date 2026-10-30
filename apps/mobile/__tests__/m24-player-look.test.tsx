// Tests the M24 player look: the seek bar's knob, the short Playback sheet with "More settings", the strong yellow Play buttons.
/**
 * M24 US19 guard G-M24-B2 (the owner: "the phone looks bad"; iPhone shots
 * docs/plans/m24-audit/phone/04-player.png, 08-playback.png). Rendered props, plus source rules only
 * for facts that live in an expo-router page (the mini player and "Up next" are rendered in
 * m24-player-look.parts.test.tsx) — how it looks on a phone is NOT VERIFIED until the head installs a build.
 *
 * The break that turns it red: in src/ui/player/HeatScrubber.tsx delete the knob
 * (`testID="seek-knob"`), or in src/ui/player/SettingsPanel.tsx render the M21 rows (Loop …) on the
 * first page again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ACCENTS, colour } from '@/design';
import { applyAccent } from '@/design/accent';
import type { NextUpItem } from '@/social/api';

jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light', set: () => undefined },
    feeds: { getEpisode: () => ({ id: 'e1', feedUrl: 'https://f/x.xml', title: 'Ep' }) },
    speed: { get: () => undefined, set: () => undefined, clear: () => undefined },
  }),
}));
jest.mock('@/playback/store', () => ({
  usePlayer: () => ({
    rate: () => 1.2,
    defaultRate: () => 1.2,
    setRate: () => undefined,
    setDefaultRate: () => undefined,
    sleepTimer: () => ({ endOfEpisode: false }),
    sleepRemainingMs: () => undefined,
    setSleepTimer: () => undefined,
    setSleepEndOfEpisode: () => undefined,
  }),
  usePlayerState: () => ({ kind: 'playing', episodeId: 'e1', positionMs: 0, lastSavedMs: 0 }),
}));

import { HeatScrubber, KNOB, UNPLAYED_ALPHA, alphaOf, barOpacity, knobLeft } from '@/ui/player/HeatScrubber';
import { SettingsPanel } from '@/ui/player/SettingsPanel';
import { EndOffer } from '@/ui/player/EndOffer';
import { PlayRing } from '@/ui/player/PlayRing';
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

describe('the seek bar on the heat card', () => {
  it('draws a 16 pt knob over a track; bars are B\'s pale grey until played', () => {
    const r = render(createElement(HeatScrubber, { heat: { available: true, buckets: new Array(100).fill(0.5) }, positionMs: 30_000, durationMs: 60_000, heatAxisMs: 60_000, onSeek: () => undefined, onSkip: () => undefined }));
    const knob = r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'seek-knob');
    expect(knob).toHaveLength(1);
    const style = StyleSheet.flatten(knob[0]!.props['style']) as Record<string, unknown>;
    expect(style['width']).toBe(KNOB);
    expect(KNOB).toBe(16);
    // Unplayed bars show at B's 22 % whatever the bar token's own alpha (0.50 today), not 50 %.
    expect(alphaOf(colour.bar) * barOpacity(false, false)).toBeCloseTo(UNPLAYED_ALPHA, 3);
    expect(UNPLAYED_ALPHA).toBe(0.22);
    expect(0.22 * barOpacity(false, false, 0.22)).toBeCloseTo(0.22, 3);
    expect(barOpacity(false, false, 0.1)).toBe(1);
    expect(alphaOf('solid')).toBe(1);
    expect(barOpacity(false, true)).toBeGreaterThan(barOpacity(false, false));
    expect(barOpacity(true, false)).toBe(1);
    const bars = r.root.findAll((n) => typeof n.type === 'string' && (StyleSheet.flatten(n.props['style']) as Record<string, unknown> | undefined)?.['backgroundColor'] === colour.bar);
    expect(bars.length).toBe(100);
    expect((StyleSheet.flatten(bars[99]!.props['style']) as Record<string, unknown>)['opacity']).toBe(barOpacity(false, false));
  });

  it('the knob stays on the track at both ends', () => {
    expect(knobLeft(0, 300)).toBe(0);
    expect(knobLeft(1, 300)).toBe(300 - KNOB);
    expect(knobLeft(0.5, 300)).toBe(150 - KNOB / 2);
    expect(knobLeft(0.5, 0)).toBe(0);
  });
});

describe('the Playback sheet', () => {
  const props = { open: true, onClose: () => undefined, looping: false, onLoop: () => undefined, skipSilence: false, onSkipSilence: () => undefined };

  it('is B\'s short "Playback": speed, presets, sleep tiles with End of episode — the M21 rows wait behind "More settings"', () => {
    const r = render(createElement(SettingsPanel, props));
    const all = labels(r);
    expect(texts(r)).toContain('Playback');
    expect(texts(r)).not.toContain('Player settings');
    for (const l of ['Slower', 'Faster', '1×', '1.2×', '1.5×', '2×', 'Sleep in 5 minutes', 'Sleep in 60 minutes', 'Stop at the end of this episode']) expect(all).toContain(l);
    expect(all).not.toContain('Loop this episode');
    expect(all).not.toContain('Skip silence');
    expect(all).not.toContain('Sleep in 90 minutes');
    expect(all).not.toContain('Speed'); // the slider
  });

  it('"More settings" keeps every M21 extra, and Back returns', () => {
    const r = render(createElement(SettingsPanel, props));
    press(r, 'More settings: loop, audio output, skip silence, voice boost');
    const all = labels(r);
    for (const l of ['Loop this episode', 'Skip silence', 'Speed', 'This show only', 'Sleep in 90 minutes']) expect(all).toContain(l);
    expect(texts(r)).toContain('fades out over the last 10 seconds');
    press(r, 'Back to Playback');
    expect(labels(r)).not.toContain('Loop this episode');
  });
});

// M24 fix F-P: main Play buttons use the fixed `play` token, not `primary` (which the accent theme
// swaps); list-row ▶ discs stay the pale `playDisc`. `play` and `primary` are both #fcc522 in the
// default theme, so the rendered class names tell them apart, and PlayRing is rendered under Teal.
// Breaks that turn these red: `bg-play` → `bg-primary` on EndOffer's "Play it" or a QueueList
// Play pill; `bg-playDisc` → `bg-play` on a row disc; `c.play` → `c.primary` / `c.accent` in PlayRing.
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
const queueColours = { text: 'x', muted: 'x', accent: 'x' };

describe('the strong yellow Play buttons; list-row discs stay pale (rendered)', () => {
  afterEach(() => { act(() => { applyAccent('sunrise'); }); });

  it('the end-of-episode offer\'s "Play it" is bg-play, never bg-primary, and plays', () => {
    const item = {
      episode: { id: 'n1', feedUrl: 'https://f/x.xml', guid: 'n1', title: 'Next One', showTitle: 'Reply All', enclosureUrl: 'https://a/n1.mp3' },
      reason: 'newOnShow',
      label: 'New on this show',
    } as NextUpItem;
    const onPlay = jest.fn();
    const r = render(createElement(EndOffer, { item, onPlay, fill: true }));
    const play = r.root.findAll((x) => typeof x.props['onPress'] === 'function' && x.findAll((t) => typeof t.type === 'string' && t.props['children'] === 'Play it').length > 0)[0];
    expect(play).toBeDefined();
    expect(classesIn(play!)).toMatch(/\bbg-play\b/);
    expect(classesIn(play!)).not.toMatch(/\bbg-primary\b/);
    act(() => { play!.props['onPress'](); });
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('the queue sheet: a row\'s ▶ disc is bg-playDisc (32 pt), not bg-play; its "Play now" pill is bg-play', () => {
    const r = render(createElement(QueueList, { ids: ['e1', 'e2'], stores: queueStores, colours: queueColours, onChange: jest.fn(), onPlay: jest.fn() }));
    const row = pressableOf(r, 'Play Foot Terminal');
    const disc = row.findAll((x) => typeof x.props['className'] === 'string' && /\bbg-playDisc\b/.test(String(x.props['className'])));
    expect(disc.length).toBeGreaterThan(0);
    const discHost = disc[0]!.findAll((x) => typeof x.type === 'string')[0]!;
    expect((StyleSheet.flatten(discHost.props['style']) as Record<string, unknown>)['width']).toBe(32);
    expect(classesIn(row)).not.toMatch(/\bbg-play\b/);
    expect(classesIn(row)).not.toMatch(/\bbg-primary\b/);
    act(() => { pressableOf(r, 'More for Foot Terminal').props['onPress'](); });
    const pill = pressableOf(r, 'Play now');
    expect(classesIn(pill)).toMatch(/\bbg-play\b/);
    expect(classesIn(pill)).not.toMatch(/\bbg-primary\b/);
  });

  it('the queue page: the next episode\'s card Play pill is bg-play', () => {
    const r = render(createElement(QueueList, { ids: ['e1', 'e2'], stores: queueStores, colours: queueColours, onChange: jest.fn(), onPlay: jest.fn(), layout: 'page' }));
    const cls = classesIn(pressableOf(r, 'Play Casey Wants to Believe'));
    expect(cls).toMatch(/\bbg-play\b/);
    expect(cls).not.toMatch(/\bbg-primary\b/);
  });

  it('the mini player\'s ring is the fixed play yellow, even under another accent theme', () => {
    act(() => { applyAccent('teal'); });
    const r = render(createElement(PlayRing, { progress: 0.5, size: 44, stroke: 3 }));
    const styles = r.root.findAll((x) => typeof x.type === 'string').map((x) => (StyleSheet.flatten(x.props['style']) ?? {}) as Record<string, unknown>);
    expect(styles.filter((s) => s['borderTopColor'] === colour.play).length).toBeGreaterThan(0);
    expect(styles.filter((s) => s['borderBottomColor'] === colour.play).length).toBeGreaterThan(0);
    const teal = ACCENTS.teal.light.primary;
    expect(styles.some((s) => [s['borderTopColor'], s['borderRightColor'], s['borderBottomColor'], s['borderLeftColor']].includes(teal))).toBe(false);
  });
});

// Kept as source checks: each fact lives only in an expo-router page — app/player.tsx imports 55
// modules (the player runtime, social API, downloads, sheets) and app/episode/[id].tsx is as heavy;
// neither can be rendered here with manageable mocks.
describe('the look, from the source (page-only facts)', () => {
  it('the hero sits right under the top bar (no auto margin above it)', () => {
    const p = read('app/player.tsx');
    expect(p).not.toMatch(/heroClass/);
    expect(p).toMatch(/<Box className="flex-row items-end gap-section">/);
  });

  it('the player\'s and the episode page\'s main Play buttons are the strong yellow', () => {
    // M24 fix F-P: the fixed `play` token, not `primary` (which the accent theme swaps).
    expect(read('app/player.tsx')).toMatch(/const PLAY = '[^']*\bbg-play\b/);
    expect(read('app/episode/[id].tsx')).toMatch(/rounded-pill bg-play items-center justify-center px-section/);
  });

  it('the ended page is "Finished"', () => {
    expect(read('app/player.tsx')).toMatch(/<Eyebrow>Finished<\/Eyebrow>/);
  });
});
