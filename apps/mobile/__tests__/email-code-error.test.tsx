// Tests that the sign-in code page drops "That code is not right." as soon as the listener types again or sends a new code.
/**
 * Real-iPhone check P1 (iPhone 16 Pro Max): after a wrong code the red line stayed while a new code was typed and sent.
 * Guard: clear the error when the code text changes; a new submit already starts without it (the pending check below).
 * Break to see it red: remove `setError(undefined)` from the code field's change handler in app/auth/email.tsx.
 * Device: NOT VERIFIED here (a phone).
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ApiError } from '@/social/api';

const mockAuth = { requestCode: jest.fn(), signInWithCode: jest.fn() };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ agreed: '1' }),
  Link: ({ children, asChild: _a, href: _h, ...rest }: { children: React.ReactElement; asChild?: boolean; href?: unknown }) => require('react').cloneElement(children, rest),
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }) }));
jest.mock('@/social/context', () => ({ SUSPENDED_KEY: 'safety.suspendedMessage', useSocial: () => ({ auth: mockAuth, listener: undefined }) }));
jest.mock('@/ui/auth/Consent', () => ({ ConsentRow: () => null, ConsentDialog: () => null, useLegalOverlay: () => ({ open: () => undefined, overlay: null }) }));
jest.mock('@/ui/auth/navigate', () => ({ toApp: jest.fn(), toSignIn: jest.fn() }));
jest.mock('@/ui/auth/ArtWall', () => ({ ArtWall: () => null, WallFade: () => null }));
jest.mock('@/ui/lib/modal', () => ({ Modal: () => null, ModalBackdrop: () => null, ModalContent: () => null }));
jest.mock('@/ui/shell/LegalDoc', () => ({ LegalDoc: () => null }));

import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import EmailScreen from '../app/auth/email';

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const WRONG = 'That code is not right.';
beforeAll(() => setReducedMotionForTest(true));
afterAll(() => setReducedMotionForTest(undefined));

const words = (r: ReactTestRenderer): string =>
  r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string')).join(' ');
const press = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;
const type = (r: ReactTestRenderer, label: string, text: string) => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onChangeText'] === 'function')[0];
  if (!n) throw new Error(`no field "${label}"`);
  act(() => { n.props['onChangeText'](text); });
};

async function toCodeStep(): Promise<ReactTestRenderer> {
  mockAuth.requestCode.mockReset().mockResolvedValue({ resendAfterSeconds: 0 });
  mockAuth.signInWithCode.mockReset().mockRejectedValue(new ApiError('invalid' as never, WRONG, 400));
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(EmailScreen))); });
  type(r, 'Email', 'ana@example.com');
  await act(async () => { press(r, 'Send code').props['onPress'](); });
  type(r, 'Code', '111111');
  await act(async () => { press(r, 'Continue').props['onPress'](); });
  return r;
}

describe('sign-in code page: the wrong-code line', () => {
  it('shows after a wrong code, and goes as soon as the code text changes', async () => {
    const r = await toCodeStep();
    expect(words(r)).toContain(WRONG);
    type(r, 'Code', '22222');
    expect(words(r)).not.toContain(WRONG);
    act(() => r.unmount());
  });

  it('is gone while the next check is pending', async () => {
    const r = await toCodeStep();
    expect(words(r)).toContain(WRONG);
    let release!: () => void;
    mockAuth.signInWithCode.mockReset().mockReturnValue(new Promise<string>((res) => { release = () => res('ok'); }));
    type(r, 'Code', '222222');
    await act(async () => { press(r, 'Continue').props['onPress'](); });
    expect(words(r)).not.toContain(WRONG);
    await act(async () => { release(); });
    act(() => r.unmount());
  });
});
