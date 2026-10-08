// Tests the M25 store fixes: no Google/Facebook buttons until built, the updater only on GitHub builds, the APK hash check, the age gate.
/**
 * M25 lane LS (L3c, L3d, L3e) — guards G-LS1 … G-LS3. Pure checks and one render; everything on a
 * phone (the sign-in page, a real download and install, the name step) is NOT VERIFIED here.
 *
 * G-LS1 break: set `ready: true` on Google in src/ui/auth/methods.ts — the sign-in row draws a
 *              Google button and the first test goes red.
 * G-LS2 break: make `updaterShown` return `platform === 'android'` (src/ui/shell/updater.ts) —
 *              a store build would show the updater, and the second block goes red.
 */
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useRouter: () => ({ push: jest.fn() }) }));
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OtherWays } from '@/ui/auth/OtherWays';
import { OTHER_METHODS, readyMethods } from '@/ui/auth/methods';
import { distributionOf, findSha256, shaFromGetPage, shaFromNotes, updaterShown, verdict } from '@/ui/shell/updater';
import { AGE_KEY, MIN_AGE, canCreate, confirmedAge, recordAgeConfirmed } from '@/ui/auth/age';

const ROOT = join(__dirname, '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

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
    const labels = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button').map((n) => n.props['accessibilityLabel']);
    expect(labels).toContain('Continue with Google');
    act(() => r.unmount());
  });

  it('sign-in and Account draw only ready methods', () => {
    expect(read('app/auth/sign-in.tsx')).toMatch(/<OtherWays /);
    expect(read('app/auth/sign-in.tsx')).not.toMatch(/OTHER_METHODS\.map/);
    expect(read('app/settings/account.tsx')).not.toMatch(/OTHER_METHODS\.map/);
    expect(read('app/settings/account.tsx')).toMatch(/readyMethods\(\)\.length > 0 \?/);
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

  it('every way in to the updater asks updaterShown: the About link, What\'s new, the page itself', () => {
    expect(read('app/settings/about.tsx')).toMatch(/updaterShown\(Platform\.OS, distributionOf\(Constants\.expoConfig\?\.extra\)\) \? \(/);
    expect(read('src/ui/shell/startupExtras.ts')).toMatch(/if \(!updaterShown\(Platform\.OS, distributionOf\(Constants\.expoConfig\?\.extra\)\)\) return;/);
    expect(read('app/settings/updates.tsx')).toMatch(/if \(!shown\) return <StoreNote/);
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
  it('the page installs only after a matching verdict, and never hands the APK to the browser', () => {
    const page = read('app/settings/updates.tsx');
    expect(page).toMatch(/verdict\(published, shaFromNotes\(notes\), await file\.digest\('SHA-256'\)\)/);
    expect(page).not.toMatch(/Linking\.openURL\(release\.apkUrl/);
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
    expect(read('app/auth/email.tsx')).toMatch(/disabled=\{under \|\| !canCreate\(name, ageOk\)\}/);
  });
});
