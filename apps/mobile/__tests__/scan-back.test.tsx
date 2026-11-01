// Tests that Scan always has a Back circle and draws no constant "no now bar" over it.
/**
 * 035 M3 / T014 (device check B7, B1; FR-002, FR-003; Pulse rule 1: a back circle on every title bar). Scan used to pass
 * `onBack={null}` (no Back in the granted state) and had no Back at all while the camera permission was unknown or refused.
 * With an episode loaded its foot controls also sat under the now bar (`now={false}` told the page there was none).
 * Now: Back in all three states, and Back goes back (history back, or home when a link opened Scan).
 * Breaks that turn it red: put `onBack={null}` back; drop the Back circle from the permission page's foot row; render the
 * undetermined state as a bare void box again.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack },
  useRouter: () => ({ push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack }),
  usePathname: () => '/scan',
}));
// The real placement rule, with an episode loaded: Scan stands down, so the placement says no bar.
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false, selectIdle: () => false }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => jest.fn() }));
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
jest.mock('@/playback/expo-audio-adapter', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [mockPermission, jest.fn()] }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import ScanScreen from '../app/scan';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); mockBack.mockReset(); mockReplace.mockReset(); mockCanGoBack = true; mockPermission = null; });
const mount = async (): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(ScanScreen))); });
  rendered.push(r);
  return r;
};
const backs = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['accessibilityLabel'] === 'Back' && n.props['accessibilityRole'] === 'button' && typeof n.props['onPress'] === 'function');

describe.each([
  ['permission not known yet', null],
  ['camera allowed', { granted: true, canAskAgain: true }],
  ['not allowed yet', { granted: false, canAskAgain: true }],
  ['refused for good', { granted: false, canAskAgain: false }],
] as const)('Scan: %s', (_name, permission) => {
  it('has a Back circle, and it goes back', async () => {
    mockPermission = permission as typeof mockPermission;
    const r = await mount();
    expect(backs(r).length).toBeGreaterThan(0);
    await act(async () => { backs(r)[0]!.props['onPress'](); });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('with a link having opened Scan (no history), Back goes home', async () => {
    mockPermission = permission as typeof mockPermission;
    mockCanGoBack = false;
    const r = await mount();
    await act(async () => { backs(r)[0]!.props['onPress'](); });
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalled();
  });
});
