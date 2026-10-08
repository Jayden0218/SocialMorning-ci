// Tests the M25 store fixes: no Google/Facebook buttons until built, the updater only on GitHub builds, the APK hash check, the age gate.
/**
 * M25 lane LS (L3c, L3d, L3e) — guards G-LS1 … G-LS3. Pure checks and renders of the sign-in,
 * Account, About, Updates and email pages; everything on a phone (a real download and install, the
 * store review) is NOT VERIFIED here.
 *
 * G-LS1 break: set `ready: true` on Google in src/ui/auth/methods.ts — the sign-in row draws a
 *              Google button and the first test goes red.
 * G-LS2 break: make `updaterShown` return `platform === 'android'` (src/ui/shell/updater.ts) —
 *              a store build would show the updater, and the second block goes red (the pure
 *              check, and the About and Updates pages rendered as a store build).
 *
 * One source check is kept: the What's new opener in src/ui/shell/startupExtras.ts is a private
 * effect inside `useStartupExtras`, which also loads the audio adapter, screen orientation, quick
 * actions and the health check — nothing there renders on its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { Linking, Platform } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

// jest.mock factories are hoisted, so anything they touch must be named `mock*`.
const mockAuth = { requestCode: jest.fn(), signInWithCode: jest.fn() };
const mockConstants: { expoConfig: { version: string; extra: Record<string, unknown> } } = { expoConfig: { version: '1.0.0', extra: {} } };
const mockDigest = { value: '' };
/** Each APK download the page starts (a plain list, so no mock reset can take its answer away). */
const mockDownloads: unknown[][] = [];
const mockDownload = async (...a: unknown[]) => { mockDownloads.push(a); return { digest: async () => mockDigest.value, delete: () => undefined, contentUri: 'content://apk' }; };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ agreed: '1' }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }) }));
jest.mock('@/social/context', () => ({ SUSPENDED_KEY: 'safety.suspendedMessage', useSocial: () => ({ auth: mockAuth, listener: undefined }) }));
// Not what these guards are about: the page bar, the consent row and dialog, the art wall, the notification ask.
jest.mock('@/ui/kit/PageHeader', () => ({ PageHeader: () => null }));
jest.mock('@/ui/auth/Consent', () => ({ ConsentRow: () => null, ConsentDialog: () => null, useLegalOverlay: () => ({ open: () => undefined, overlay: null }) }));
jest.mock('@/ui/auth/navigate', () => ({ toApp: jest.fn(), toSignIn: jest.fn() }));
jest.mock('@/ui/auth/ArtWall', () => ({ ArtWall: () => null }));
jest.mock('@/notify/permission', () => ({ askForNotifications: () => Promise.resolve() }));
jest.mock('@/notify/expo', () => ({ expoNotify: {} }));
jest.mock('@/ui/shell/launch', () => ({ signInPage: { setWhole: () => undefined } }));
jest.mock('@/ui/lib/modal', () => ({ Modal: () => null, ModalBackdrop: () => null, ModalContent: () => null }));
jest.mock('@/ui/shell/LegalDoc', () => ({ LegalDoc: () => null }));
// The build's config (version, `extra.distribution`), the APK download and the server address.
// A getter: the factory runs while the imports below load, before `mockConstants` is assigned.
// While the imports load, `mockConstants` is still undefined, and expo-asset (under the fonts that
// Text loads) reads `Constants.experienceUrl` at load time (gate 37744935171) — an empty config then.
jest.mock('expo-constants', () => ({ __esModule: true, get default() { return mockConstants ?? {}; } }));
jest.mock('expo-file-system', () => {
  class File {
    exists = false;
    delete(): void { /* nothing on disk */ }
    static downloadFileAsync = (...a: unknown[]) => mockDownload(...a);
  }
  return { File, Paths: { cache: 'cache' } };
});
jest.mock('@/social/base-url', () => ({ apiBaseUrl: () => 'https://api.test' }));
// Updates imports startupExtras (release helpers), which imports the native audio adapter.
jest.mock('@/playback/expo-audio-adapter', () => ({ setLockScreenSkipSeconds: jest.fn() }));

import { OtherWays } from '@/ui/auth/OtherWays';
import { OTHER_METHODS, readyMethods } from '@/ui/auth/methods';
import { VERDICT_TEXT, distributionOf, findSha256, shaFromGetPage, shaFromNotes, updaterShown, verdict } from '@/ui/shell/updater';
import { AGE_KEY, AGE_LINE, MIN_AGE, UNDER_AGE_TEXT, canCreate, confirmedAge, recordAgeConfirmed } from '@/ui/auth/age';
import { RELEASES_LATEST } from '@/ui/shell/startupExtras';
import SignInScreen from '../app/auth/sign-in';
import AccountSecurityScreen from '../app/settings/account';
import AboutScreen from '../app/settings/about';
import UpdatesScreen from '../app/settings/updates';
import EmailScreen from '../app/auth/email';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

async function render(page: () => React.ReactElement | null): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(page))); });
  return r;
}
/** Let the page's fetch / download chain run to its end. */
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((res) => setTimeout(res, 0)); });
const words = (r: ReactTestRenderer): string =>
  r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string')).join(' ');
const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];

/** Mark Google ready for one block (proves the pages draw through readyMethods, not a hard-coded nothing). */
function withGoogleReady(fn: () => Promise<void>): Promise<void> {
  const google = OTHER_METHODS[0]!;
  google.ready = true;
  return fn().finally(() => { google.ready = false; });
}

/** Run as Android or iPhone for one test (restored by restoreAllMocks below). */
const onOS = (os: 'android' | 'ios') => jest.replaceProperty(Platform as { OS: string }, 'OS', os);
const realFetch = global.fetch;
afterEach(() => { jest.restoreAllMocks(); mockConstants.expoConfig.extra = {}; global.fetch = realFetch; });

describe('G-LS1 (L3c): Google and Facebook are not drawn until built', () => {
  it('the sign-in row renders nothing — no Google, no Facebook', () => {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(OtherWays, { onChoose: () => undefined })); });
    expect(r.toJSON()).toBeNull();
    expect(JSON.stringify(r.toJSON() ?? '')).not.toMatch(/Google|Facebook/);
    act(() => r.unmount());
    expect(readyMethods()).toEqual([]);
  });

  it('a method marked ready would be drawn (so the empty row above is the flag, not a broken component)', () => {
    let r!: ReactTestRenderer;
    const google = { ...OTHER_METHODS[0]!, ready: true };
    act(() => { r = create(createElement(OtherWays, { methods: [google], onChoose: () => undefined })); });
    const buttons = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button').map((n) => n.props['accessibilityLabel']);
    expect(buttons).toContain('Continue with Google');
    act(() => r.unmount());
  });

  it('the sign-in page draws email and no other way in; a ready Google would appear there', async () => {
    const page = await render(SignInScreen);
    expect(pressable(page, 'Continue with email')).toBeDefined();
    expect(labels(page).filter((l) => /Google|Facebook/.test(l))).toEqual([]);
    expect(words(page)).not.toMatch(/Google|Facebook/);
    act(() => page.unmount());
    await withGoogleReady(async () => {
      const ready = await render(SignInScreen);
      expect(pressable(ready, 'Continue with Google')).toBeDefined();
      expect(pressable(ready, 'Continue with Facebook')).toBeUndefined();
      act(() => ready.unmount());
    });
  });

  it('Account lists no other way to sign in while none is ready; a ready one would be listed', async () => {
    const page = await render(AccountSecurityScreen);
    expect(words(page)).toContain('You sign in with');
    expect(words(page)).not.toMatch(/Google|Facebook|Other ways to sign in/i);
    act(() => page.unmount());
    await withGoogleReady(async () => {
      const ready = await render(AccountSecurityScreen);
      expect(labels(ready)).toContain('Google: not linked yet');
      expect(labels(ready).filter((l) => /Facebook/.test(l))).toEqual([]);
      act(() => ready.unmount());
    });
  });
});

describe('G-LS2 (L3d): the self-updater shows only on a GitHub APK build', () => {
  it('hidden on a store build, on a CI build and on iPhone; shown only for distribution "github" on Android', () => {
    expect(updaterShown('android', undefined)).toBe(false);
    expect(updaterShown('android', 'play')).toBe(false);
    expect(updaterShown('ios', 'github')).toBe(false);
    expect(updaterShown('android', 'github')).toBe(true);
    expect(distributionOf({ distribution: 'github' })).toBe('github');
    expect(distributionOf({})).toBeUndefined();
    expect(distributionOf(undefined)).toBeUndefined();
  });

  it.each([
    ['android', 'github', true],
    ['android', undefined, false],
    ['ios', 'github', false],
  ] as const)('About on %s with distribution %s: "Check for updates" shown = %s', async (os, distribution, shown) => {
    onOS(os);
    mockConstants.expoConfig.extra = distribution ? { distribution } : {};
    const page = await render(AboutScreen);
    expect(labels(page).includes('Check for updates')).toBe(shown);
    // The rows that are always there are drawn, so a missing link above is the gate, not a blank page.
    expect(labels(page)).toContain('Open-source licences');
    act(() => page.unmount());
  });

  it('the Updates page on a store build (Android, no distribution) is only the store note, and checks nothing', async () => {
    onOS('android');
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const page = await render(UpdatesScreen);
    await settle();
    expect(words(page)).toContain('The store you installed SocialNet from keeps it up to date.');
    expect(pressable(page, 'Check again')).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    act(() => page.unmount());
  });

  it('every way in to the updater asks updaterShown: What\'s new at start-up (a source check, see the header)', () => {
    expect(read('src/ui/shell/startupExtras.ts')).toMatch(/if \(!updaterShown\(Platform\.OS, distributionOf\(Constants\.expoConfig\?\.extra\)\)\) return;/);
  });

  it('the flag comes only from SOCIALNET_DISTRIBUTION=github, with the install permission; a store build has neither', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const make = require('../app.config.js') as (a: { config: Record<string, unknown> }) => { extra?: Record<string, unknown>; android?: { permissions?: string[] } };
    const base = JSON.parse(read('app.json')).expo as Record<string, unknown>;
    const before = process.env['SOCIALNET_DISTRIBUTION'];
    try {
      delete process.env['SOCIALNET_DISTRIBUTION'];
      const store = make({ config: base });
      expect(store.extra?.['distribution']).toBeUndefined();
      expect(store.android?.permissions).not.toContain('android.permission.REQUEST_INSTALL_PACKAGES');
      process.env['SOCIALNET_DISTRIBUTION'] = 'github';
      const github = make({ config: base });
      expect(github.extra?.['distribution']).toBe('github');
      expect(github.android?.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
    } finally {
      if (before === undefined) delete process.env['SOCIALNET_DISTRIBUTION']; else process.env['SOCIALNET_DISTRIBUTION'] = before;
    }
    const eas = JSON.parse(read('eas.json')) as { build: Record<string, { env?: Record<string, string> }> };
    expect(eas.build['preview']?.env?.['SOCIALNET_DISTRIBUTION']).toBe('github');
    expect(eas.build['production']?.env?.['SOCIALNET_DISTRIBUTION']).toBeUndefined();
  });
});

describe('L3d: an APK is offered for install only when its SHA-256 matches the published one', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);
  it('reads the hash from /get and from the release notes', () => {
    expect(shaFromGetPage(`<p class="muted">… SHA-256 of the current build: <code>${A.toUpperCase()}</code></p>`)).toBe(A);
    expect(shaFromGetPage('<p>no hash yet</p>')).toBeUndefined();
    expect(shaFromNotes(`A build.\n\nSHA-256: \`${B}\`\n`)).toBe(B);
    expect(findSha256(`x ${A} y`)).toBe(A);
    expect(findSha256('a'.repeat(65))).toBeUndefined();
  });
  it('no published hash, notes that disagree, or a different file → refused', () => {
    expect(verdict(undefined, undefined, A)).toEqual({ ok: false, reason: 'no-published-hash' });
    expect(verdict(A, B, A)).toEqual({ ok: false, reason: 'notes-disagree' });
    expect(verdict(A, undefined, B)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verdict(A, A, A.toUpperCase())).toEqual({ ok: true });
    expect(verdict(A, undefined, A)).toEqual({ ok: true });
  });

  /** A GitHub build (Android, distribution "github") whose release v1.0.1 is newer than 1.0.0; /get publishes A. */
  async function downloaded(digest: string): Promise<ReactTestRenderer> {
    onOS('android');
    mockConstants.expoConfig.extra = { distribution: 'github' };
    mockDigest.value = digest;
    global.fetch = jest.fn(async (url: string) => (url === RELEASES_LATEST
      ? { ok: true, json: async () => ({ tag_name: 'v1.0.1', html_url: 'https://gh/r', body: 'Fixes.', assets: [{ name: 'socialnet.apk', browser_download_url: 'https://gh/socialnet.apk' }] }) }
      : url === 'https://api.test/get'
        ? { ok: true, text: async () => `<p>SHA-256 of the current build: <code>${A}</code></p>` }
        : { ok: false })) as never;
    const page = await render(UpdatesScreen);
    await settle();
    const get = pressable(page, 'Download and check the update');
    expect(get).toBeDefined();
    const before = mockDownloads.length;
    await act(async () => { get!.props['onPress'](); });
    await settle();
    expect(mockDownloads.length).toBe(before + 1);
    return page;
  }

  it('the page offers Install only after a matching hash, and never hands the APK to the browser', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    const bad = await downloaded(B);
    expect(words(bad)).toContain(VERDICT_TEXT.mismatch);
    expect(pressable(bad, 'Install the update')).toBeUndefined();
    act(() => bad.unmount());

    const good = await downloaded(A);
    expect(words(good)).toContain('Checked: the download matches the published checksum.');
    expect(pressable(good, 'Install the update')).toBeDefined();
    act(() => good.unmount());
    expect(openURL).not.toHaveBeenCalled();
  });
});

describe('G-LS3 (L3e): the age gate at sign-up', () => {
  it('"Create account" waits for a name and the age confirmation', () => {
    expect(canCreate('Ana', false)).toBe(false);
    expect(canCreate('  ', true)).toBe(false);
    expect(canCreate('Ana', true)).toBe(true);
  });
  it('the confirmation is kept beside the terms consent, with no birth date', () => {
    const m = new Map<string, string>();
    const s = { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v) };
    expect(confirmedAge(s)).toBeUndefined();
    recordAgeConfirmed(s, new Date('2026-10-08T00:00:00.000Z'));
    expect(m.get(AGE_KEY)).toBe(`${MIN_AGE}@2026-10-08T00:00:00.000Z`);
    expect(confirmedAge(s)).toBe(MIN_AGE);
  });
  it('the minimum age is the one the privacy policy states', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LEGAL_TEXT } = require('@/legal/texts') as { LEGAL_TEXT: { privacy: string } };
    expect(LEGAL_TEXT.privacy).toContain(`SocialNet is not for children under ${MIN_AGE}.`);
    expect(LEGAL_TEXT.privacy).not.toMatch(/Children's Personal Information Protection Rules/);
  });

  it('on the email page, "Create account" stays disabled until a name AND the age box; "I am under" disables it again', async () => {
    mockAuth.requestCode.mockReset().mockResolvedValue({ resendAfterSeconds: 0 });
    mockAuth.signInWithCode.mockReset().mockResolvedValue('needsName');
    const r = await render(EmailScreen);
    const type = (label: string, text: string) => {
      const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onChangeText'] === 'function')[0];
      if (!n) throw new Error(`no field "${label}"`);
      act(() => { n.props['onChangeText'](text); });
    };
    const create_ = () => pressable(r, 'Create account')!;
    type('Email', 'ana@example.com');
    await act(async () => { pressable(r, 'Send code')!.props['onPress'](); });
    type('Code', '123456');
    await act(async () => { pressable(r, 'Continue')!.props['onPress'](); });
    expect(mockAuth.signInWithCode).toHaveBeenCalledTimes(1);

    // The name step: nothing typed, nothing ticked.
    expect(create_().props['accessibilityState']).toMatchObject({ disabled: true });
    type('Display name', 'Ana');
    expect(create_().props['accessibilityState']).toMatchObject({ disabled: true });
    await act(async () => { create_().props['onPress'](); });
    expect(mockAuth.signInWithCode).toHaveBeenCalledTimes(1);
    act(() => { pressable(r, AGE_LINE)!.props['onPress'](); });
    expect(create_().props['accessibilityState']).toMatchObject({ disabled: false });

    // "I am under 14": the account cannot be made, and the page says why.
    act(() => { pressable(r, `I am under ${MIN_AGE}`)!.props['onPress'](); });
    expect(create_().props['accessibilityState']).toMatchObject({ disabled: true });
    expect(words(r)).toContain(UNDER_AGE_TEXT);
    act(() => r.unmount());
  });
});
