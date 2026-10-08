// Tests the M24 player look: the seek bar's knob, the short Playback sheet with "More settings", the strong yellow Play buttons.
/**
 * M24 US19 guard G-M24-B2 (the owner: "the phone looks bad"; iPhone shots
 * docs/plans/m24-audit/phone/04-player.png, 08-playback.png). Rendered props and source rules only —
 * how it looks on a phone is NOT VERIFIED until the head installs a build.
 *
 * The break that turns it red: in src/ui/player/HeatScrubber.tsx delete the knob
 * (`testID="seek-knob"`), or in src/ui/player/SettingsPanel.tsx render the M21 rows (Loop …) on the
 * first page again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colour } from '@/design';

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

describe('the look, from the source', () => {
  it('the hero sits right under the top bar (no auto margin above it)', () => {
    const p = read('app/player.tsx');
    expect(p).not.toMatch(/heroClass/);
    expect(p).toMatch(/<Box className="flex-row items-end gap-section">/);
  });

  it('main Play buttons are the strong yellow; list-row discs stay pale', () => {
    expect(read('app/player.tsx')).toMatch(/const PLAY = '[^']*\bbg-primary\b/);
    expect(read('app/episode/[id].tsx')).toMatch(/rounded-pill bg-primary items-center justify-center px-section/);
    expect(read('src/ui/player/EndOffer.tsx')).toMatch(/bg-primary rounded-pill/);
    const q = read('src/ui/queue/QueueList.tsx');
    expect(q.match(/accessibilityLabel="Play now" className="[^"]*bg-primary/g)).toHaveLength(1);
    expect(q).toMatch(/rounded-pill bg-playDisc items-center justify-center" style=\{PLAY_DISC\}/);
  });

  it('the mini player draws its own yellow ring and tabular digits', () => {
    const m = read('src/ui/player/MiniPlayer.tsx');
    expect(m).toMatch(/<PlayRing /);
    expect(m).toMatch(/style=\{tabular\}/);
    expect(read('src/ui/player/PlayRing.tsx')).toMatch(/borderTopColor: c\.primary/);
  });

  it('the queue sheet is "Up next"; the ended page is "Finished"', () => {
    expect(read('src/ui/queue/QueueSheet.tsx')).toMatch(/accessibilityRole="header">Up next</);
    expect(read('app/player.tsx')).toMatch(/<Eyebrow>Finished<\/Eyebrow>/);
  });
});
