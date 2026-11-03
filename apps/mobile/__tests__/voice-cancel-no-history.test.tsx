// Tests that leaving the Voice status page works when the page was opened by a link and has no screen behind it.
/**
 * 035 finishing (R17, run 41646852746): after a tap on "Cancel" the page stayed open. `cancel` called `router.back()` unguarded; a page opened by
 * a socialmorning:// link may be the only route, and back then does nothing. Every other leave handler (search, scan, maintenance, interests,
 * RecFeedback, the player) checks `router.canGoBack()` and falls back to `router.replace('/')`. This page now does the same.
 * Red before the fix: with no history, Cancel neither went back nor replaced the route. NOT VERIFIED: a device.
 */
import { createElement } from 'react';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = false;
const mockToast = jest.fn();
const mockPostVoice = jest.fn(() => Promise.resolve());
const mockPause = jest.fn();
const mockOpenSettings = jest.fn();
let mockMic = true;
let mockDuration = 0;
const mockRecorder = { prepareToRecordAsync: jest.fn(() => Promise.resolve()), record: jest.fn(), stop: jest.fn(() => Promise.resolve()), uri: 'file:///rec.m4a' };
jest.mock('expo-router', () => ({ router: { back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack, push: jest.fn() }, usePathname: () => '/voice/new' }));
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

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockBack, mockToast, mockPostVoice, mockPause, mockOpenSettings, mockRecorder.stop, mockRecorder.record]) f.mockClear();
  mockMic = true; mockDuration = 0; mockCanGoBack = false; mockReplace.mockClear();
});
const mount = async (el: React.ReactElement = createElement(NewVoicePost)): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};

const byLabel = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const press = async (r: ReactTestRenderer, label: string) => { const n = byLabel(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };

describe('Voice status: leaving', () => {
  it('Cancel with no screen behind goes to the home route', async () => {
    mockCanGoBack = false;
    const r = await mount();
    await press(r, 'Cancel');
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('Cancel with a screen behind goes back (control)', async () => {
    mockCanGoBack = true;
    const r = await mount();
    await press(r, 'Cancel');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
