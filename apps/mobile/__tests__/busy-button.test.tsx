// Checks that a busy button shows the moving bars and keeps its size.
/**
 * Guard G-BU1 (owner, 2026-10-04): a busy button showed still text ("…", "Sending…"), and the
 * code page's "Continue →" shrank to "…" when "Send again" was pressed — the two shared one
 * busy flag. Now a busy button keeps its words (hidden, so its size stays) under the app's
 * Loader, cannot be pressed again and is not dimmed; and on the email page only the pressed
 * button is busy.
 *
 * Rendered: Button, AuthButton and the email page itself (app/auth/email.tsx, with the sign-in
 * calls held open so each step's busy state can be read). One source rule stays: no file in
 * app/ or src/ swaps its words for still busy text — a rule over every file.
 *
 * The break that turns it red: put `{props.busy ? '…' : props.text ?? props.label}` back in
 * AuthButton, or `busy={busy}` back on email.tsx's "Continue".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockAuth = { requestCode: jest.fn(), signInWithCode: jest.fn() };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => ({ agreed: '1' }),
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }) }));
jest.mock('@/social/context', () => ({ SUSPENDED_KEY: 'safety.suspendedMessage', useSocial: () => ({ auth: mockAuth }) }));
// The consent row, its dialog and the legal overlay are not what this guard is about.
jest.mock('@/ui/auth/Consent', () => ({ ConsentRow: () => null, ConsentDialog: () => null, useLegalOverlay: () => ({ open: () => undefined, overlay: null }) }));
jest.mock('@/ui/auth/navigate', () => ({ toApp: jest.fn(), toSignIn: jest.fn() }));

import { Button } from '@/ui/kit/Button';
import { AuthButton } from '@/ui/auth/AuthShell';
import { AGE_LINE } from '@/ui/auth/age';
import EmailScreen from '../app/auth/email';

const ROOT = join(__dirname, '..');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function render(busy: boolean, disabled = false, onPress: () => void = () => undefined): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Button, { label: 'Send', onPress, busy, disabled })); });
  return r;
}

const button = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button')[0]!;
const bars = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'progressbar');
const words = (r: ReactTestRenderer, w = 'Send') => JSON.stringify(r.toJSON()).includes(`"${w}"`);
/** Nodes inside the button that carry a press handler (the root is the Button element itself). */
const pressables = (r: ReactTestRenderer) => r.root.findAll((n) => n !== r.root && typeof n.props['onPress'] === 'function');

it('busy: the words stay (so the size stays), the bars move over them, no second press', () => {
  const onPress = jest.fn();
  const idle = render(false, false, onPress);
  expect(words(idle)).toBe(true);
  expect(bars(idle)).toHaveLength(0);
  // Idle, the press reaches the handler — so the empty list below is the busy rule, not a blind finder.
  expect(pressables(idle).length).toBeGreaterThan(0);
  act(() => { pressables(idle)[0]!.props['onPress'](); });
  expect(onPress).toHaveBeenCalledTimes(1);

  const busyPress = jest.fn();
  const busy = render(true, false, busyPress);
  expect(words(busy)).toBe(true);
  expect(bars(busy)).toHaveLength(1);
  expect(button(busy).props['accessibilityState']).toMatchObject({ busy: true });
  // No second press: while busy no node in the button carries the press handler.
  expect(pressables(busy)).toHaveLength(0);
  expect(busyPress).not.toHaveBeenCalled();
  act(() => { idle.unmount(); busy.unmount(); });
});

/** The dim class on its own — the library's `data-[disabled=true]:opacity-40` is always in the string. */
const DIM = /(^|\s)opacity-40(\s|$)/;
/** The library's own disabled flag (`isDisabled` → `data-disabled="true"`), which dims the button. */
const libDisabled = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['data-disabled'] === 'true');

it('busy is not dimmed, even when the button is also disabled', () => {
  const r = render(true, true);
  expect(String(button(r).props['className'])).not.toMatch(DIM);
  // The library dims anything `isDisabled`, so busy must not be passed to it as disabled.
  expect(libDisabled(r)).toHaveLength(0);
  act(() => r.unmount());
  const off = render(false, true);
  expect(String(button(off).props['className'])).toMatch(DIM);
  expect(libDisabled(off).length).toBeGreaterThan(0);
  act(() => off.unmount());
});

describe('AuthButton', () => {
  const auth = (busy: boolean, extra: Partial<Parameters<typeof AuthButton>[0]> = {}): ReactTestRenderer => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(AuthButton, { label: 'Continue', trail: 'chevron-forward', disabled: false, busy, onPress: () => undefined, ...extra })); });
    return r;
  };
  const arrow = (r: ReactTestRenderer) => r.root.findAll((n) => n.props['name'] === 'chevron-forward');
  const host = (r: ReactTestRenderer, label: string) =>
    r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0]!;

  it('keeps its words and arrow while busy, draws the bars over them, and is not dimmed', () => {
    const idle = auth(false);
    expect(words(idle, 'Continue')).toBe(true);
    expect(arrow(idle).length).toBeGreaterThan(0);
    expect(bars(idle)).toHaveLength(0);

    const busy = auth(true);
    expect(words(busy, 'Continue')).toBe(true);
    expect(arrow(busy).length).toBeGreaterThan(0);
    expect(bars(busy)).toHaveLength(1);
    // The words and the arrow are kept in place, hidden (BusyContent), so the size stays.
    expect(busy.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === 'busy-hidden')).toHaveLength(1);
    const b = host(busy, 'Continue');
    expect(b.props['accessibilityState']).toMatchObject({ busy: true, disabled: true });
    expect(b.props['disabled']).toBe(true);
    expect(String(b.props['className'])).not.toMatch(DIM);
    act(() => { idle.unmount(); busy.unmount(); });
  });

  it('busy shows the short `text` when there is one, never a still "…"', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(AuthButton, { label: 'Continue with email', text: 'Email', disabled: false, busy: true, onPress: () => undefined })); });
    expect(words(r, 'Email')).toBe(true);
    expect(JSON.stringify(r.toJSON())).not.toMatch(/"…"|"Sending…"/);
    act(() => r.unmount());
  });
});

describe('the email page: sending a code never makes "Continue" or "Create account" busy', () => {
  type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
  const deferred = <T,>(): Deferred<T> => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
  };
  const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
  const find = (r: ReactTestRenderer, label: string): ReactTestInstance => {
    const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
    if (!n) throw new Error(`no pressable "${label}"`);
    return n;
  };
  /** Lets `run`'s await → state → finally chain settle. */
  const flush = async () => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };
  const busyOf = (r: ReactTestRenderer, label: string): boolean => find(r, label).props['accessibilityState']?.busy === true;
  const type = (r: ReactTestRenderer, label: string, text: string) => {
    const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onChangeText'] === 'function')[0];
    if (!n) throw new Error(`no field "${label}"`);
    act(() => { n.props['onChangeText'](text); });
  };

  it('each button is busy only for its own call', async () => {
    const firstSend = deferred<{ resendAfterSeconds: number }>();
    const resend = deferred<{ resendAfterSeconds: number }>();
    const check = deferred<'needsName'>();
    const create_ = deferred<'needsName'>();
    mockAuth.requestCode.mockReset().mockReturnValueOnce(firstSend.promise).mockReturnValueOnce(resend.promise);
    mockAuth.signInWithCode.mockReset().mockReturnValueOnce(check.promise).mockReturnValueOnce(create_.promise);

    let r!: ReactTestRenderer;
    await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(EmailScreen))); });

    // Step 1: "Send code" is busy while its code is being sent.
    type(r, 'Email', 'ana@example.com');
    expect(busyOf(r, 'Send code')).toBe(false);
    await act(async () => { find(r, 'Send code').props['onPress'](); });
    expect(mockAuth.requestCode).toHaveBeenCalledWith('ana@example.com');
    expect(busyOf(r, 'Send code')).toBe(true);
    await act(async () => { firstSend.resolve({ resendAfterSeconds: 0 }); });
    await flush();

    // Step 2: "Send again" is busy; "Continue" is not (one shared flag made it busy and shrink).
    expect(busyOf(r, 'Continue')).toBe(false);
    await act(async () => { find(r, 'Send the code again').props['onPress'](); });
    expect(mockAuth.requestCode).toHaveBeenCalledTimes(2);
    expect(busyOf(r, 'Send the code again')).toBe(true);
    expect(busyOf(r, 'Continue')).toBe(false);

    // "Continue" is busy for its own call — the code check — while the resend is still out.
    type(r, 'Code', '123456');
    await act(async () => { find(r, 'Continue').props['onPress'](); });
    expect(mockAuth.signInWithCode).toHaveBeenCalledWith('ana@example.com', '123456', undefined);
    expect(busyOf(r, 'Continue')).toBe(true);
    await act(async () => { check.resolve('needsName'); });
    await flush();

    // Step 3 (a new account), the resend still out: "Create account" is not busy.
    expect(busyOf(r, 'Create account')).toBe(false);
    type(r, 'Display name', 'Ana');
    act(() => { find(r, AGE_LINE).props['onPress'](); });
    expect(busyOf(r, 'Create account')).toBe(false);
    await act(async () => { find(r, 'Create account').props['onPress'](); });
    expect(mockAuth.signInWithCode).toHaveBeenLastCalledWith('ana@example.com', '123456', 'Ana');
    expect(busyOf(r, 'Create account')).toBe(true);

    await act(async () => { resend.resolve({ resendAfterSeconds: 0 }); create_.resolve('needsName'); });
    await flush();
    act(() => r.unmount());
    jest.clearAllTimers();
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx$/.test(name) ? [path] : [];
  });
}

// Kept as a source rule: it spans every screen in app/ and src/, which no single render reaches.
it('no button swaps its words for still busy text', () => {
  const still = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))]
    // `(?<!\?)`: `pct ?? '…'` (a download's unknown percent) is not a busy label.
    .filter((p) => /(?<!\?)\? '(?:…|Sending…|Posting…|Saving…|Deleting…)'/.test(readFileSync(p, 'utf8')))
    .map((p) => relative(ROOT, p));
  expect(still).toEqual([]);
});
