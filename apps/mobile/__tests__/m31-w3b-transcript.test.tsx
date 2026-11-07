// Tests that the full-screen transcript page matches its drawing in the numbers the owner compared.
/**
 * M31 W3-B (T041; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/shell.html `transcript--screen`, `toast--transcript` and listen.html `transcript--none-on-phone`. Each test
 * names the revert that turns it red (each was seen red once, then restored):
 *  - the title bar is low: "Transcript" with the episode's title under it, a back circle, no More circle (the action map lists none): drop `subtitle` — red;
 *  - the Translation row is 44 tall; PLUS members get the switch, the others the hot PLUS pill that opens Wallet: swap the branches — red;
 *  - the lines are the player's Thread (`TranscriptPane`, filling the page) and a tap seeks only when this episode is the one playing — red if `here` is dropped;
 *  - no transcript: "No transcript yet", the old sentence, and an "Open player" pill that loads the episode and opens the player — red if `openPlayer` is dropped;
 *  - the page has no now bar and "Copied." sits 142 over the strip (toast placement): `miniPlayerShows` / `toastPlacement` — red.
 * NOT VERIFIED: the look on a phone. The pane's own "Back to now" pill is the wave-1 light pill, left-aligned (the drawing's chip is bottom right).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
const mockSeek = jest.fn((..._a: unknown[]) => undefined);
const mockLoad = jest.fn((..._a: unknown[]) => undefined);
const mockCopy = jest.fn((_t: string) => Promise.resolve());
const mockToast = jest.fn();
let mockState: Record<string, unknown> = { kind: 'idle' };
let mockTranscript: unknown;
let mockTranslation: unknown;
let mockListener: unknown = { listenerId: 'me' };
const mockStores = {
  feeds: { getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: 'Cities that sleep late', durationMs: 600_000 }) },
  extras: { get: () => undefined },
};
const mockPlayer = { seek: (...a: unknown[]) => mockSeek(...a), load: (...a: unknown[]) => mockLoad(...a) };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ episodeId: 'e1' }),
  usePathname: () => '/transcript/e1',
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: (t: string) => mockCopy(t) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/feeds/fetch-extras', () => ({ readExtras: () => (mockTranscript ? { transcript: mockTranscript } : undefined) }));
jest.mock('@/storage/playable', () => ({ toPlayable: (_s: unknown, id: string) => ({ id }) }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayer: () => mockPlayer, usePlayerSelector: (sel: (s: unknown) => unknown) => sel(mockState) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ listener: mockListener }) }));
const mockM22 = { translation: () => Promise.resolve(mockTranslation), requestTranslation: () => Promise.resolve(mockTranslation) };
jest.mock('@/social/api-m22-server', () => ({ ...jest.requireActual('@/social/api-m22-server'), useM22Api: () => mockM22, phoneLocale: () => 'en' }));
jest.mock('@/ui/player/QuoteShare', () => ({ useQuoteShare: () => jest.fn() }));
jest.mock('@/ui/player/TranscriptExtras', () => ({ TranscriptReportSheet: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import TranscriptScreen, { TRANSCRIPT_PAGE } from '../app/transcript/[episodeId]';
import { miniPlayerShows } from '@/ui/player/MiniPlayer';
import { toastBottom } from '@/design';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockPush, mockSeek, mockLoad, mockCopy, mockToast]) f.mockClear();
  mockState = { kind: 'idle' }; mockTranscript = undefined; mockTranslation = undefined;
});
const mount = async (): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(TranscriptScreen)); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const timed = { lines: [{ startMs: 1_000, text: 'Before the phone.' }, { startMs: 5_000, text: 'Second line.' }, { startMs: 9_000, text: 'Third line.' }] };

describe('the page (transcript--screen)', () => {
  it('the title bar is low: back, "Transcript", the episode under it; no More circle', async () => {
    mockTranscript = timed;
    const r = await mount();
    const t = texts(r);
    expect(t).toContain('Transcript');
    expect(t).toContain('Cities that sleep late');
    expect(byLabel(r, 'Back').length).toBeGreaterThan(0);
    expect(byLabel(r, 'More')).toHaveLength(0);
  });

  it('the lines hang from the time spine; a tap seeks only when this episode is the one playing', async () => {
    mockTranscript = timed;
    const r = await mount();
    expect(texts(r)).toContain('Second line.');
    const line = r.root.findAll((n) => n.props['testID'] === 'transcript-line-1' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { line.props['onPress'](); });
    expect(mockSeek).not.toHaveBeenCalled(); // another episode (or none) is playing
    act(() => r.unmount()); rendered.pop();
    mockState = { kind: 'playing', episodeId: 'e1', positionMs: 5_500, durationMs: 600_000, lastSavedMs: 0 };
    const r2 = await mount();
    const line2 = r2.root.findAll((n) => n.props['testID'] === 'transcript-line-1' && typeof n.props['onPress'] === 'function')[0]!;
    act(() => { line2.props['onPress'](); });
    expect(mockSeek).toHaveBeenCalledWith(5_000);
  });

  it('a long-press selects a line; Copy writes it and says "Copied."', async () => {
    mockTranscript = timed;
    const r = await mount();
    const line = r.root.findAll((n) => n.props['testID'] === 'transcript-line-0' && typeof n.props['onLongPress'] === 'function')[0]!;
    act(() => { line.props['onLongPress'](); });
    await press(r, 'Copy the selected lines');
    await act(async () => { await Promise.resolve(); });
    expect(mockCopy).toHaveBeenCalledWith('Before the phone.');
    expect(mockToast).toHaveBeenCalledWith('Copied.');
  });

  it('"Copied." sits above the title bar: 142 over the strip, and the page shows no now bar', () => {
    const { toastPlacement } = jest.requireActual('@/ui/shell/toastPlacement') as typeof import('@/ui/shell/toastPlacement');
    const p = toastPlacement('/transcript/e1', false, false);
    expect(p.composer).toBe('transcript');
    expect(toastBottom(34, { composer: 'transcript' })).toBe(176); // the drawing's 176 on a 34 pt strip
    expect(miniPlayerShows('/transcript/e1', 'root', false)).toBe(false);
    expect(miniPlayerShows('/queue', 'root', false)).toBe(true);
  });
});

describe('the Translation row', () => {
  it('is 44 tall with the switch for PLUS and "Translation into English" as its name', async () => {
    mockTranscript = timed;
    mockTranslation = { state: 'none' };
    const r = await mount();
    expect(texts(r)).toContain('Translation');
    const sw = r.root.findAll((n) => n.props['accessibilityRole'] === 'switch' && n.props['accessibilityLabel'] === 'Translation into English')[0];
    expect(sw).toBeDefined();
    expect(TRANSCRIPT_PAGE.row).toBe(44);
  });
  it('others see the hot PLUS pill (30 tall, a 48 target) that opens Wallet', async () => {
    mockTranscript = timed;
    mockTranslation = { state: 'plus_required' };
    const r = await mount();
    const pill = byLabel(r, 'Translation is part of PLUS. Open PLUS')[0]!;
    expect(pill.props['hitSlop']).toBe(9);
    expect(flat(pill.findAll((n) => typeof n.type === 'string')[0]!)['height']).toBe(30);
    await press(r, 'Translation is part of PLUS. Open PLUS');
    expect(mockPush).toHaveBeenCalledWith('/wallet');
  });
  it('a show the allow-list does not offer has no row', async () => {
    mockTranscript = timed;
    mockTranslation = { state: 'not_offered' };
    const r = await mount();
    expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'switch')).toHaveLength(0);
    expect(byLabel(r, 'Translation is part of PLUS. Open PLUS')).toHaveLength(0);
  });
  it('while it is being made the note says so, with the wait', async () => {
    mockTranscript = timed;
    mockTranslation = { state: 'queued', etaHours: 3 };
    const r = await mount();
    const sw = r.root.findAll((n) => n.props['accessibilityRole'] === 'switch')[0]!;
    await act(async () => { sw.props['onPress'](); });
    expect(texts(r)).toContain('Translating — usually ready within 3 hours.');
  });
});

describe('no transcript on this phone (transcript--none-on-phone)', () => {
  it('says so in two parts, with an empty spine, and Open player loads the episode and opens the player', async () => {
    const r = await mount();
    const t = texts(r);
    expect(t).toContain('No transcript yet');
    expect(t).toContain('This episode has no transcript on this phone yet. Open it in the player first.');
    expect(r.root.findAll((n) => n.props['testID'] === 'transcript-empty-spine').length).toBeGreaterThan(0);
    await press(r, 'Open player');
    expect(mockLoad).toHaveBeenCalledWith({ id: 'e1' }, 'play');
    expect(mockPush).toHaveBeenCalledWith('/player');
  });
  it('does not load again when the episode is already the one playing', async () => {
    mockState = { kind: 'paused', episodeId: 'e1', positionMs: 0, durationMs: 600_000, lastSavedMs: 0 };
    const r = await mount();
    await press(r, 'Open player');
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/player');
  });
});
