// Tests that the real app's config is unchanged and the dev app is a separate app that leaves the real one's links alone.
/**
 * Lane DP — guard G-DP1. `APP_VARIANT=dev` builds a second app (app.config.js) that installs beside
 * the real one. This holds two promises:
 *  1. APP_VARIANT unset (or `prod`) → the config is exactly app.json's: bundle id, package, name,
 *     scheme, icon, API address, intent filters — nothing in the real app moved.
 *  2. APP_VARIANT=dev → its own ids, name, scheme, App Group and icon, its API address from
 *     SOCIALNET_DEV_API_BASE_URL, and it does NOT claim the production link domain.
 * And the dev app never offers a real purchase (`canBuy`), and writes to its own App Group.
 *
 * Break: in app.config.js, make `withVariant` return the dev values for every build (drop the
 * `!== 'dev'` early return) — the prod block goes red. Or keep the https intent filter for dev —
 * the "does not claim" test goes red. Installing either app on a phone is NOT VERIFIED here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canBuy } from '@/billing/products';
import { variantOf } from '@/config/variant';
import { APP_GROUP, appGroupFor, DEV_APP_GROUP } from '@/outside/ios';

const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const appJson = JSON.parse(read('app.json')) as { expo: Config };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeConfig = require('../app.config.js') as (a: { config: unknown }) => Config;

type Filter = { data?: { host?: string }[] };
type Config = {
  name: string; scheme: string; icon: string;
  ios: { bundleIdentifier: string; entitlements?: Record<string, string[]> };
  android: { package: string; intentFilters?: Filter[]; adaptiveIcon: { foregroundImage: string } };
  extra: { apiBaseUrl: string; variant?: string };
  plugins: unknown[];
};

const PROD_HOST = 'socialmorning-api.vercel.app';
const KEYS = ['APP_VARIANT', 'SOCIALNET_DEV_API_BASE_URL', 'SOCIALNET_API_BASE_URL', 'SOCIALNET_DISTRIBUTION', 'SOCIALNET_IOS_EXTRAS', 'APPLE_TEAM_ID'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

/** A fresh copy of app.json's `expo` and only the given variables each time, so no call leaks into the next. */
const build = (env: Partial<Record<(typeof KEYS)[number], string>> = {}): Config => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  return makeConfig({ config: JSON.parse(JSON.stringify(appJson.expo)) });
};
const claims = (c: Config, host: string): boolean => (c.android.intentFilters ?? []).some((f) => (f.data ?? []).some((d) => d.host === host));

describe('prod (APP_VARIANT unset) is exactly today’s app', () => {
  it('equals app.json, field for field', () => {
    expect(build()).toEqual(appJson.expo);
    expect(build({ APP_VARIANT: 'prod' })).toEqual(appJson.expo);
  });

  it('keeps the real ids, name, scheme, API address and link domain', () => {
    const c = build();
    expect(c.ios.bundleIdentifier).toBe('app.socialmorning.mobile');
    expect(c.android.package).toBe('app.socialmorning.mobile');
    expect(c.name).toBe('SocialNet');
    expect(c.scheme).toBe('socialmorning');
    expect(c.icon).toBe('./assets/icon.png');
    expect(c.extra.apiBaseUrl).toBe('https://socialmorning-api.vercel.app');
    expect(c.extra.variant).toBeUndefined();
    expect(claims(c, PROD_HOST)).toBe(true);
  });

  it('a dev API address never reaches the real app', () => {
    expect(build({ SOCIALNET_DEV_API_BASE_URL: 'https://dev.example.test' }).extra.apiBaseUrl).toBe('https://socialmorning-api.vercel.app');
  });

  it('with extras, the real App Group as before', () => {
    expect(build({ SOCIALNET_IOS_EXTRAS: '1' }).ios.entitlements?.['com.apple.security.application-groups']).toEqual(['group.app.socialmorning.mobile']);
  });
});

describe('dev (APP_VARIANT=dev) is a separate app', () => {
  it('has its own ids, name, scheme, icons and variant flag', () => {
    const c = build({ APP_VARIANT: 'dev' });
    expect(c.ios.bundleIdentifier).toBe('app.socialmorning.mobile.dev');
    expect(c.android.package).toBe('app.socialmorning.mobile.dev');
    expect(c.name).toBe('SocialNet Dev');
    expect(c.scheme).toBe('socialmorning-dev');
    expect(c.icon).toBe('./assets/dev/icon.png');
    expect(c.android.adaptiveIcon.foregroundImage).toBe('./assets/dev/android-icon-foreground.png');
    expect(c.extra.variant).toBe('dev');
  });

  it('does not claim the production link domain', () => {
    expect(claims(build({ APP_VARIANT: 'dev' }), PROD_HOST)).toBe(false);
  });

  it('takes its API address from SOCIALNET_DEV_API_BASE_URL; unset, today’s address (no dev backend yet)', () => {
    expect(build({ APP_VARIANT: 'dev', SOCIALNET_DEV_API_BASE_URL: 'https://dev.example.test' }).extra.apiBaseUrl).toBe('https://dev.example.test');
    expect(build({ APP_VARIANT: 'dev' }).extra.apiBaseUrl).toBe('https://socialmorning-api.vercel.app');
  });

  it('with extras, its own App Group', () => {
    expect(build({ APP_VARIANT: 'dev', SOCIALNET_IOS_EXTRAS: '1' }).ios.entitlements?.['com.apple.security.application-groups']).toEqual(['group.app.socialmorning.mobile.dev']);
  });

  it('refuses an unknown variant rather than building prod by mistake', () => {
    expect(() => build({ APP_VARIANT: 'staging' })).toThrow(/APP_VARIANT/);
  });
});

it('eas.json: `development` builds the dev app; preview and production stay prod', () => {
  const eas = JSON.parse(read('eas.json')) as { build: Record<string, { env?: Record<string, string> }> };
  expect(eas.build['development']?.env?.['APP_VARIANT']).toBe('dev');
  expect(eas.build['preview']?.env?.['APP_VARIANT']).toBeUndefined();
  expect(eas.build['production']?.env?.['APP_VARIANT']).toBeUndefined();
});

describe('the app reads its variant', () => {
  it('dev only when the config says dev', () => {
    expect(variantOf({ variant: 'dev' })).toBe('dev');
    expect(variantOf({})).toBe('prod');
    expect(variantOf(undefined)).toBe('prod');
  });

  it('writes the widgets to the matching App Group', () => {
    expect(appGroupFor('prod')).toBe(APP_GROUP);
    expect(appGroupFor('dev')).toBe(DEV_APP_GROUP);
    expect(DEV_APP_GROUP).toBe(`${APP_GROUP}.dev`);
  });

  it('never offers a real purchase in the dev app', () => {
    const ok = { platform: 'android', native: true, serverReady: true, teen: false };
    expect(canBuy(ok)).toBe(true);
    expect(canBuy({ ...ok, variant: 'prod' })).toBe(true);
    expect(canBuy({ ...ok, variant: 'dev' })).toBe(false);
  });
});
