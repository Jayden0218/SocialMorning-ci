// Tests that the voice status page matches its drawings in the numbers the owner compared.
/**
 * M31 W3-B (T041; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/social.html `voice-new--screen`, `-recording`, `-microphone-denied`, `-toast` and `recRing`. Each test names the
 * revert that turns it red (each was seen red once, then restored):
 *  - the ring is 270 with a 10 stroke, the button 84, the clock Unbounded 40 with "/ 1:00": `VOICE_RING` in src/ui/voice/measures.ts — red;
 *  - the three rules are three numbered tiles, 8 apart, circle 22: `RULES` / `VOICE_PAGE` — red;
 *  - idle is a light disc "Tap to record", recording a hot disc with a stop square "Recording — tap to stop" and the brighter glow, done an outlined
 *    disc "Tap to record again": the `state` branches of `VoiceRing` — red;
 *  - Post (hot) appears once there is a take, and posting says "Posted. It disappears in 24 hours." and closes: `recorded` — red;
 *  - denied: the muted-mic mark, its sentence and an outlined "Open settings": the `denied` branch — red;
 *  - the × cancels, stopping a recording first: `cancel` — red; the toast sits 90 over the strip (voice placement) — red if `toastOverVoice` moves.
 * NOT VERIFIED: the microphone, anything on a phone.
 */
import { createElement } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '@/design';

const mockBack = jest.fn();
const mockToast = jest.fn();
const mockPostVoice = jest.fn(() => Promise.resolve());
const mockPause = jest.fn();
const mockOpenSettings = jest.fn();
let mockMic = true;
let mockDuration = 0;
const mockRecorder = { prepareToRecordAsync: jest.fn(() => Promise.resolve()), record: jest.fn(), stop: jest.fn(() => Promise.resolve()), uri: 'file:///rec.m4a' };
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), push: jest.fn() }, usePathname: () => '/voice/new' }));
jest.mock('@/playback/expo-audio-adapter', () => ({
  askMicrophone: () => Promise.resolve(mockMic),
  useVoiceRecorder: () => ({ recorder: mockRecorder, state: { durationMillis: mockDuration } }),
  voiceSessionOn: () => Promise.resolve(),
  voiceSessionOff: () => Promise.resolve(),
}));
jest.mock('@/social/voice-text', () => ({ textRecorder: () => undefined }));
const mockStores = { settings: { get: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/playback/store', () => ({ ...jest.requireActual('@/playback/store'), usePlayer: () => ({ pause: () => mockPause() }) }));
const mockM12 = { postVoice: (...a: unknown[]) => (mockPostVoice as (...x: unknown[]) => Promise<void>)(...a) };
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
const mockM22 = { postVoice: jest.fn(() => Promise.resolve()) };
jest.mock('@/social/api-m22-social', () => ({ useM22SocialApi: () => mockM22 }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: {} }) }));
jest.mock('@/ui/social/StatusComposerItems', () => ({ StatusComposerItems: () => null, itemsForPost: () => Promise.resolve([]) }));
jest.mock('@/ui/comments/VoiceTextReview', () => ({ VoiceTextBox: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
(global as unknown as { fetch: unknown }).fetch = () => Promise.resolve({ blob: () => Promise.resolve({}) });

import NewVoicePost from '../app/voice/new';
jest.spyOn(Linking, 'openSettings').mockImplementation(() => { mockOpenSettings(); return Promise.resolve(); });
import { VOICE_PAGE, VOICE_RING } from '@/ui/voice/measures';
import { VoiceRing } from '@/ui/voice/VoiceRing';
import { toastBottom } from '@/design';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockBack, mockToast, mockPostVoice, mockPause, mockOpenSettings, mockRecorder.stop, mockRecorder.record]) f.mockClear();
  mockMic = true; mockDuration = 0;
});
const mount = async (el: React.ReactElement = createElement(NewVoicePost)): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const hostOf = (n: ReactTestInstance) => n.findAll((x) => typeof x.type === 'string')[0]!;
const texts = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
const classes = (n: ReactTestInstance) => [n, ...n.findAll((x) => typeof x.props['className'] === 'string')].map((x) => String(x.props['className'] ?? '')).join(' ');
const record = async (r: ReactTestRenderer, ms: number) => {
  await press(r, 'Start recording');
  mockDuration = ms;
  // The recorder's hook reports the length by re-rendering the page.
  await act(async () => { r.update(createElement(NewVoicePost)); });
  await press(r, 'Stop recording');
};

describe('the idle page (voice-new--screen)', () => {
  it('three numbered rule tiles, 8 apart, and a 270 ring with a light mic button (84) and "Tap to record"', async () => {
    const r = await mount();
    const tiles = r.root.findAll((n) => n.props['testID'] === 'voice-rule' && typeof n.type === 'string');
    expect(tiles).toHaveLength(3);
    const t = texts(r);
    for (const s of ['Up to 60 seconds.', 'People who follow you can play it', 'for 24 hours; then it is deleted.', 'Tap to record', '0:00', ' / 1:00']) expect(t).toContain(s);
    const ring = r.root.findAll((n) => n.props['testID'] === 'voice-ring' && typeof n.type === 'string')[0]!;
    expect(flat(ring)['width']).toBe(270);
    expect(VOICE_RING).toMatchObject({ size: 270, stroke: 10, button: 84 });
    expect(VOICE_PAGE.tileGap).toBe(8);
    const button = byLabel(r, 'Start recording')[0]!;
    expect(flat(hostOf(button))['width']).toBe(84);
    expect(classes(button)).toContain('bg-text');
  });
  it('the title bar is low: × (Cancel), "Voice status"; no Post yet, no now bar', async () => {
    const r = await mount();
    expect(texts(r)).toContain('Voice status');
    expect(byLabel(r, 'Cancel').length).toBeGreaterThan(0);
    expect(byLabel(r, 'Post')).toHaveLength(0);
    await press(r, 'Cancel');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('recording and done', () => {
  it('recording: a hot disc with a stop square, "Recording — tap to stop", the clock counting, the glow on', async () => {
    const r = await mount();
    await press(r, 'Start recording');
    expect(mockPause).toHaveBeenCalled(); // the episode pauses first
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    mockDuration = 13_000;
    await act(async () => { r.update(createElement(NewVoicePost)); });
    const stop = byLabel(r, 'Stop recording')[0]!;
    expect(classes(stop)).toContain('bg-hot');
    expect(texts(r)).toContain('Recording — tap to stop');
    expect(r.root.findAll((n) => n.props['testID'] === 'voice-glow').length).toBeGreaterThan(0);
    // The clock follows the recorder and the arc is that share of the minute (13 of 60).
    expect(texts(r)).toContain('0:13');
    const arc = r.root.findAll((n) => typeof n.props['strokeDasharray'] === 'string')[0]!;
    const [len, circ] = String(arc.props['strokeDasharray']).split(' ').map(Number);
    expect(len! / circ!).toBeCloseTo(13 / 60, 2);
  });
  it('done: an outlined disc "Record again", "Tap to record again", Post (hot) in the title bar, the length in the subtitle', async () => {
    const r = await mount();
    await record(r, 21_000);
    await act(async () => { await Promise.resolve(); });
    const again = byLabel(r, 'Record again')[0]!;
    expect(classes(again)).toContain('bg-raise2');
    expect(texts(r)).toContain('Tap to record again');
    expect(texts(r)).toContain('0:21 recorded');
    const post = byLabel(r, 'Post')[0]!;
    expect(classes(post)).toContain('bg-hot');
  });
  it('a take under a second is refused with the old sentence and no Post', async () => {
    const r = await mount();
    await record(r, 400);
    await act(async () => { await Promise.resolve(); });
    expect(texts(r)).toContain('That was too short — hold on for at least a second.');
    expect(byLabel(r, 'Post')).toHaveLength(0);
  });
  it('Post uploads, says "Posted. It disappears in 24 hours." and closes', async () => {
    const r = await mount();
    await record(r, 21_000);
    await act(async () => { await Promise.resolve(); });
    await press(r, 'Post');
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });
    expect(mockPostVoice).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith('Posted. It disappears in 24 hours.');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('the × stops a recording first and then leaves', async () => {
    const r = await mount();
    await press(r, 'Start recording');
    mockRecorder.stop.mockClear();
    await press(r, 'Cancel');
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('microphone denied', () => {
  it('replaces the ring with the muted-mic mark, the sentence and an outlined Open settings that opens the phone\'s settings', async () => {
    mockMic = false;
    const r = await mount();
    await press(r, 'Start recording');
    await act(async () => { await Promise.resolve(); });
    expect(texts(r)).toContain("SocialNet needs the microphone to record. You can allow it in the phone's settings.");
    expect(r.root.findAll((n) => n.props['testID'] === 'voice-ring')).toHaveLength(0);
    const open = byLabel(r, 'Open settings')[0]!;
    expect(classes(open)).toContain('border-outline');
    await act(async () => { open.props['onPress'](); });
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('the ring states (VoiceRing)', () => {
  const ring = async (state: 'idle' | 'recording' | 'done', fraction: number) =>
    mount(createElement(VoiceRing, { state, fraction, seconds: Math.floor(fraction * 60), clock: '0:13', cap: '1:00', line: 'x', label: `button ${state}`, onPress: jest.fn() }));
  it('the arc is the share of the 60 seconds used: none at 0, a third at 20 s, round caps, stroke 10', async () => {
    const empty = await ring('idle', 0);
    expect(empty.root.findAll((n) => typeof n.props['strokeDasharray'] === 'string')).toHaveLength(0);
    const third = await ring('recording', 1 / 3);
    const arc = third.root.findAll((n) => typeof n.props['strokeDasharray'] === 'string')[0]!;
    const [len, circ] = String(arc.props['strokeDasharray']).split(' ').map(Number);
    expect(len! / circ!).toBeCloseTo(1 / 3, 2);
    expect(arc.props['strokeWidth']).toBe(10);
  });
  it('only a recording ring has the glow; the three states have different discs', async () => {
    const idle = await ring('idle', 0);
    const rec = await ring('recording', 0.2);
    const done = await ring('done', 0.35);
    expect(idle.root.findAll((n) => n.props['testID'] === 'voice-glow')).toHaveLength(0);
    expect(rec.root.findAll((n) => n.props['testID'] === 'voice-glow').length).toBeGreaterThan(0);
    expect(classes(byLabel(idle, 'button idle')[0]!)).toContain('bg-text');
    expect(classes(byLabel(rec, 'button recording')[0]!)).toContain('bg-hot');
    expect(classes(byLabel(done, 'button done')[0]!)).toContain('border-text');
    expect(rec.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === VOICE_RING.stop && flat(n)['backgroundColor'] === colour.void).length).toBeGreaterThan(0);
  });
});

it('the toast sits 90 over the strip (124 on the drawing\'s 34 pt strip)', () => {
  expect(toastBottom(34, { composer: 'voice' })).toBe(124);
});
