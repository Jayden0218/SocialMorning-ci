// Pins the Form pages that no other test renders: Send feedback and Change email keep their fields, their one action and Back.
/**
 * Spec 039 (Form lane, D2): behaviour first. Each page is rendered on `Page` (FormPage) with its hooks stubbed; the test types into the
 * field by its accessibility label, presses the primary action by its label, and checks what the page calls. Written green on the old
 * `PushedPage` frame, then run on `FormPage`. Break to watch red: drop the `onChangeText` of the New email field or the `Email me a code` button.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockStart = jest.fn(() => Promise.resolve());
const mockSend = jest.fn(() => Promise.resolve());
const mockToast = jest.fn();
const mockBack = jest.fn();
const mockStores = { settings: { get: () => undefined, set: () => undefined } };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: (...a: unknown[]) => mockBack(...a), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: (...a: unknown[]) => mockBack(...a) }),
  usePathname: () => '/settings/feedback',
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
// One object per run, as the real provider gives (the page's loads depend on `api`).
const mockSocial = { api: { sendFeedback: () => mockSend(), appeals: () => new Promise(() => undefined) }, listener: { listenerId: 'me', displayName: 'Ana', email: 'ana@example.com' }, refreshListener: jest.fn() };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/social/account-api', () => ({ ...jest.requireActual('@/social/account-api'), useAccountApi: () => ({ startEmailChange: () => mockStart(), confirmEmailChange: jest.fn() }) }));
jest.mock('@/social/links', () => ({ APPEALS_KEY: 'appeals', refreshAppeals: () => new Promise(() => undefined) }));
jest.mock('@/telemetry/reportError', () => ({ recentErrors: () => [] }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import FeedbackScreen from '../../../../app/settings/feedback';
import ChangeEmailScreen from '../../../../app/settings/account-email';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => { setReducedMotionForTest(true); mockStart.mockClear(); mockSend.mockClear(); mockBack.mockClear(); });
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });

async function render(screen: () => React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(screen)); await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const byLabel = (r: ReactTestRenderer, label: string, prop: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props[prop] === 'function')[0];
  if (!n) throw new Error(`no "${label}" with ${prop}`);
  return n;
};
const words = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

describe('Send feedback', () => {
  it('has Back, the title and helper line, the kinds, the text box and Send, which waits for a kind and five characters', async () => {
    const r = await render(FeedbackScreen);
    expect(words(r)).toContain('Write feedback');
    expect(words(r)).toContain('Help and feedback');
    await act(async () => { byLabel(r, 'Back', 'onPress').props['onPress'](); });
    expect(mockBack).toHaveBeenCalled();
    const send = () => r.root.findAll((x) => x.props['accessibilityLabel'] === 'Send' && x.props['accessibilityRole'] === 'button')[0]!;
    expect(send().props['accessibilityState']).toMatchObject({ disabled: true });
    await act(async () => { byLabel(r, 'Using the app', 'onPress').props['onPress'](); });
    await act(async () => { byLabel(r, 'Your feedback', 'onChangeText').props['onChangeText']('It crashed on open'); });
    expect(send().props['accessibilityState']).toMatchObject({ disabled: false });
    await act(async () => { send().props['onPress'](); await Promise.resolve(); });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('"My feedback" switches the view and back', async () => {
    const r = await render(FeedbackScreen);
    await act(async () => { byLabel(r, 'My feedback', 'onPress').props['onPress'](); });
    expect(words(r)).toContain('Nothing sent yet');
    await act(async () => { byLabel(r, 'Write feedback', 'onPress').props['onPress'](); });
    expect(words(r)).toContain('Your feedback');
  });
});

describe('Change email', () => {
  it('has Back, the Now tile, the New email field and Email me a code, which waits for an address and then asks the server', async () => {
    const r = await render(ChangeEmailScreen);
    expect(words(r)).toContain('Change email');
    expect(words(r)).toContain('ana@example.com');
    await act(async () => { byLabel(r, 'Back', 'onPress').props['onPress'](); });
    expect(mockBack).toHaveBeenCalled();
    const go = () => r.root.findAll((x) => x.props['accessibilityLabel'] === 'Email me a code' && x.props['accessibilityRole'] === 'button')[0]!;
    expect(go().props['accessibilityState']).toMatchObject({ disabled: true });
    await act(async () => { byLabel(r, 'New email', 'onChangeText').props['onChangeText']('new@example.com'); });
    expect(go().props['accessibilityState']).toMatchObject({ disabled: false });
    await act(async () => { go().props['onPress'](); await Promise.resolve(); });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(words(r)).toContain('Code from your new email');
  });
});
