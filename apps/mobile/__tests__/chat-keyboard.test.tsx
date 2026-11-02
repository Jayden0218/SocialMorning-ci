// Tests that the chat thread's message box and Send ride above the keyboard.
/**
 * 035 M5 / T017 (device check B2, US2 scenario 2; run 41274515878, screenshot `r12-06-message-sent`). Cause, written in
 * specs/035-device-check-fixes/gate-log.md: the thread's foot zone (`BottomZone`) is `position: absolute` with a fixed `bottom`, and
 * the page wrapped it in a `KeyboardAvoidingView behavior="padding"`. That adds PADDING to the wrapper, and an absolutely placed child
 * is not moved by its parent's padding, so the box stayed where the keyboard opens. The zone must lift by the keyboard's reported
 * height (iOS; the home strip is already padded by the root layout, so it comes off).
 * Breaks that turn it red: put the fixed `bottom={ZONE_BOTTOM}` back on the zone; lift by a constant instead of the reported height.
 */
import { createElement } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockStores = { settings: { get: () => undefined, set: () => undefined }, feedCache: {}, feeds: { getEpisode: () => undefined, getShow: () => undefined }, auth: { get: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/chat/ana',
  useLocalSearchParams: () => ({ id: 'ana', name: 'Ana' }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => jest.fn(), useDownloads: () => ({}) }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockApi = { profile: (id: string) => Promise.resolve({ id, displayName: 'Ana' }), follow: jest.fn(), unfollow: jest.fn(), registerEpisode: jest.fn() };
// One object for every render, as the real hook gives (a new one each time would reload the thread for ever).
const mockSocial = { api: mockApi, listener: { listenerId: 'me', displayName: 'Mei Lin' } };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
const mockChatApi = { thread: () => Promise.resolve({ with: { id: 'ana', displayName: 'Ana' }, canSend: true, messages: [] }), friends: () => Promise.resolve([]), send: jest.fn() };
jest.mock('@/social/chat-api', () => ({ ...jest.requireActual('@/social/chat-api'), useChatApi: () => mockChatApi }));
jest.mock('@/discover/useDiscover', () => ({ useCardActions: () => ({ open: jest.fn(), play: jest.fn() }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ safety: { isHidden: () => false }, feed: (x: unknown) => x }) }));
jest.mock('@/ui/comments/ReportSheet', () => ({ ReportSheet: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ChatThread from '../app/chat/[id]';

type Handler = (e: { endCoordinates: { height: number } }) => void;
let handlers: Record<string, Handler[]> = {};
beforeEach(() => {
  setReducedMotionForTest(true);
  handlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: Handler) => {
    (handlers[name] ??= []).push(fn);
    return { remove: () => { handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn); } };
  }) as never);
});
let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); jest.restoreAllMocks(); setReducedMotionForTest(undefined); });
const emit = (name: string, height = 0) => act(() => { for (const h of handlers[name] ?? []) h({ endCoordinates: { height } }); });
const STRIP = 34;
async function mount(): Promise<void> {
  await act(async () => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: STRIP, left: 0, right: 0 } }, createElement(ChatThread)));
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const zoneBottom = (): number => flat(r.root.findAll((n) => n.props['testID'] === 'comments-zone' && typeof n.type === 'string')[0]!)['bottom'] as number;

it('at rest the message zone sits near the foot', async () => {
  await mount();
  expect(zoneBottom()).toBeLessThan(40);
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Send').length).toBeGreaterThan(0);
});

it('with the keyboard up (336, home strip 34) the box and Send sit at or above the keyboard\'s top (302 over the padded foot)', async () => {
  await mount();
  emit('keyboardWillShow', 336);
  expect(zoneBottom()).toBeGreaterThanOrEqual(336 - STRIP);
});

it('the lift follows the reported height: 260 and 336 differ by 76', async () => {
  await mount();
  emit('keyboardWillShow', 260);
  const a = zoneBottom();
  emit('keyboardWillShow', 336);
  expect(zoneBottom() - a).toBe(76);
});

it('when the keyboard hides the zone returns to the foot', async () => {
  await mount();
  const rest = zoneBottom();
  emit('keyboardWillShow', 336);
  emit('keyboardWillHide');
  expect(zoneBottom()).toBe(rest);
});

// 036 T011 (035's A4): the chat box was named "Message" and its placeholder is "Message", so the device read "Message Message". Its name is now about the person
// ("Message Ana"); the placeholder stays as drawn. Break: put `accessibilityLabel="Message"` back on the box in app/chat/[id].tsx.
it('036 A4: the message box\'s name does not repeat its placeholder', async () => {
  await mount();
  const box = r.root.findAll((n) => typeof n.props['onChangeText'] === 'function' && n.props['placeholder'] !== undefined)[0]!;
  expect(box.props['placeholder']).toBe('Message');
  expect(box.props['accessibilityLabel']).toBe('Message Ana');
});
