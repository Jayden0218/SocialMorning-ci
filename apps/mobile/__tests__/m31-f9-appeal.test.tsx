// The Appeal page's "Send appeal" pill carries the arrow glyph the drawing gives it.
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 7). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 shell.html `appeal--screen`: `[['Send appeal','light','send']]` — the third value is the kit icon `send`, whose path is the arrow
 * "M5 12h14M13 6l6 6-6 6" (kit.js line 30) — a right arrow, drawn 18 before the words; the build's pill has no icon ("the Send pill has no arrow").
 * Kept as built (not tested): the pill is dimmed while the focused box is empty — the drawing's note says "disabled until ..." and the wave listed only the arrow.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockToast = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack },
  useRouter: () => ({ push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack }),
  usePathname: () => '/appeal',
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockStores = { settings: { get: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
const mockAsk = jest.fn();
jest.mock('@/playback/expo-audio-adapter', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [mockPermission, mockAsk] }));
const mockList = jest.fn();
const mockSend = jest.fn();
// One object for every render, as the real hook's useMemo gives (a new one each time would reload forever).
const mockApi = { list: () => mockList(), send: (...a: unknown[]) => mockSend(...a) };
jest.mock('@/social/appeals-api', () => ({ ...jest.requireActual('@/social/appeals-api'), useAppealsApi: () => mockApi }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import AppealScreen from '../app/appeal';
import { appealCaption, appealState, dayMonth } from '@/ui/appeal/lines';
import { ApiError } from '@/social/api';

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockReplace, mockBack, mockToast, mockAsk, mockList, mockSend]) f.mockReset();
  mockCanGoBack = true; mockPermission = null;
});
const mount = async (C: () => React.ReactElement | null): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(C))); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string');
/** The pressable named `label`, once (a kit part nests several wrappers that repeat its props). */
const pressables = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.type !== 'string' && n.props['accessibilityRole'] === 'button' && !(n.parent?.props['accessibilityLabel'] === label && n.parent?.props['accessibilityRole'] === 'button'));
/** The drawn size of a control: the first style under it (or on it) that sets a height. */
const sized = (n: ReactTestInstance): Record<string, unknown> => [n, ...n.findAll((x) => typeof x.type === 'string')].map(flat).find((st) => st['height'] !== undefined) ?? {};
const press = async (r: ReactTestRenderer, label: string) => { const n = pressables(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
/** The test phone's status bar is 47, the drawing's 50. */
const at = (drawnTop: number) => 47 + drawnTop - 50;
/** A bar of the curve is transparent when it sits in the gap. */
const gapBars = (r: ReactTestRenderer) => byId(r, 'curve-bar').filter((b) => flat(b)['backgroundColor'] === 'rgba(6,6,8,0)').length;


describe('F9-7 Appeal: "Send appeal" has the arrow (appeal--screen)', () => {
  const open = [{ actionId: 'a1', action: 'remove', what: 'Your comment “hm” was removed', at: '2026-10-12T09:00:00.000Z', appeal: null }];
  it('the pill holds an arrow-forward icon before its words', async () => {
    mockList.mockResolvedValue(open);
    const r = await mount(AppealScreen);
    const pill = pressables(r, 'Send appeal')[0]!;
    const icons = pill.findAll((n) => typeof n.props['name'] === 'string');
    expect(icons.map((n) => String(n.props['name']))).toEqual(expect.arrayContaining([expect.stringMatching(/^arrow-forward/)]));
  });
});
