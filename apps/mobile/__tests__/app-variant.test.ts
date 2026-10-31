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

const DEV_URL = 'https://dev.example.test'; // a non-prod build must name its own https API (M30 review fixes 1-2)
const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const appJson = JSON.parse(read('app.json')) as { expo: Config };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeConfig = require('../app.config.js') as (a: { config: unknown }) => Config;

type Filter = { data?: { host?: string }[] };
type Config = {
  name: string; scheme: string; icon: string;
  ios: { bundleIdentifier: string; entitlements?: Record<string, string[]> };
  android: { package: string; intentFilters?: Filter[]; adaptiveIcon: { foregroundImage: string } };
  extra: { apiBaseUrl: string; variant?: string; appEnv?: string };
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
    expect(c.extra.appEnv).toBeUndefined(); // no badge in the real app (M30)
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
    const c = build({ APP_VARIANT: 'dev', SOCIALNET_DEV_API_BASE_URL: DEV_URL });
    expect(c.ios.bundleIdentifier).toBe('app.socialmorning.mobile.dev');
    expect(c.android.package).toBe('app.socialmorning.mobile.dev');
    expect(c.name).toBe('SocialNet Dev');
    expect(c.scheme).toBe('socialmorning-dev');
    expect(c.icon).toBe('./assets/dev/icon.png');
    expect(c.android.adaptiveIcon.foregroundImage).toBe('./assets/dev/android-icon-foreground.png');
    expect(c.extra.variant).toBe('dev');
    expect(c.extra.appEnv).toBe('dev');
  });

  it('does not claim the production link domain', () => {
    expect(claims(build({ APP_VARIANT: 'dev', SOCIALNET_DEV_API_BASE_URL: DEV_URL }), PROD_HOST)).toBe(false);
  });

  it('takes its API address from SOCIALNET_DEV_API_BASE_URL; unset, the build refuses', () => {
    expect(build({ APP_VARIANT: 'dev', SOCIALNET_DEV_API_BASE_URL: 'https://dev.example.test' }).extra.apiBaseUrl).toBe('https://dev.example.test');
    expect(() => build({ APP_VARIANT: 'dev' })).toThrow(/SOCIALNET_DEV_API_BASE_URL/); // M30: never quietly the production API
  });

  it('with extras, its own App Group', () => {
    expect(build({ APP_VARIANT: 'dev', SOCIALNET_IOS_EXTRAS: '1', SOCIALNET_DEV_API_BASE_URL: DEV_URL }).ios.entitlements?.['com.apple.security.application-groups']).toEqual(['group.app.socialmorning.mobile.dev']);
  });

  it('refuses an unknown variant rather than building prod by mistake', () => {
    expect(() => build({ APP_VARIANT: 'staging' })).toThrow(/APP_VARIANT/);
    expect(() => build({ APP_VARIANT: 'QA' })).toThrow(/APP_VARIANT/);
  });
});

describe('qa (APP_VARIANT=qa) is a third app (M30)', () => {
  it('has its own ids, name, scheme, App Group and variant flags; reuses the dev icon', () => {
    const c = build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test' });
    expect(c.ios.bundleIdentifier).toBe('app.socialmorning.mobile.qa');
    expect(c.android.package).toBe('app.socialmorning.mobile.qa');
    expect(c.name).toBe('SocialMorning QA');
    expect(c.scheme).toBe('socialmorning-qa');
    expect(c.icon).toBe('./assets/dev/icon.png');
    expect(c.extra.appEnv).toBe('qa');
    expect(c.extra.variant).toBe('dev'); // inside the app a qa build behaves like dev: no real purchase
  });

  it('does not claim the production link domain, and takes its API address from SOCIALNET_DEV_API_BASE_URL', () => {
    expect(claims(build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test' }), PROD_HOST)).toBe(false);
    expect(build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test' }).extra.apiBaseUrl).toBe('https://qa.example.test');
  });

  it('without SOCIALNET_DEV_API_BASE_URL the build THROWS instead of reaching the production API (M30 P1)', () => {
    expect(() => build({ APP_VARIANT: 'qa' })).toThrow(/SOCIALNET_DEV_API_BASE_URL/);
    expect(() => build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: '' })).toThrow(/SOCIALNET_DEV_API_BASE_URL/);
  });

  it('with extras, its own App Group', () => {
    expect(build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test', SOCIALNET_IOS_EXTRAS: '1' }).ios.entitlements?.['com.apple.security.application-groups']).toEqual(['group.app.socialmorning.mobile.qa']);
  });

  it('the three bundle ids are all different', () => {
    const ids = [build(), build({ APP_VARIANT: 'dev', SOCIALNET_DEV_API_BASE_URL: DEV_URL }), build({ APP_VARIANT: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test' })].map((c) => c.ios.bundleIdentifier);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('the staging profile shows STAGING, not DEV (M30 P7)', () => {
  it('SOCIALNET_DISTRIBUTION=staging sets extra.appEnv to staging; the app is still the dev variant', () => {
    const c = build({ APP_VARIANT: 'dev', SOCIALNET_DISTRIBUTION: 'staging', SOCIALNET_DEV_API_BASE_URL: 'https://stg.example.test' });
    expect(c.extra.appEnv).toBe('staging');
    expect(c.extra.variant).toBe('dev');
    expect(c.ios.bundleIdentifier).toBe('app.socialmorning.mobile.dev');
  });

  it('other distributions keep their own badge', () => {
    expect(build({ APP_VARIANT: 'dev', SOCIALNET_DISTRIBUTION: 'dev', SOCIALNET_DEV_API_BASE_URL: DEV_URL }).extra.appEnv).toBe('dev');
    expect(build({ APP_VARIANT: 'qa', SOCIALNET_DISTRIBUTION: 'qa', SOCIALNET_DEV_API_BASE_URL: 'https://qa.example.test' }).extra.appEnv).toBe('qa');
    expect(build({ SOCIALNET_DISTRIBUTION: 'github' }).extra.appEnv).toBeUndefined();
  });

  it('eas.json staging is the dev variant with distribution staging', () => {
    const eas = JSON.parse(read('eas.json')) as { build: Record<string, { env?: Record<string, string> }> };
    expect(eas.build['staging']?.env?.['APP_VARIANT']).toBe('dev');
    expect(eas.build['staging']?.env?.['SOCIALNET_DISTRIBUTION']).toBe('staging');
  });
});

it('eas.json: profiles `dev` and `qa` build their own variant with a placeholder API address', () => {
  const eas = JSON.parse(read('eas.json')) as { build: Record<string, { extends?: string; env?: Record<string, string> }> };
  for (const [name, placeholder] of [['dev', 'DEV_API_URL_PLACEHOLDER'], ['qa', 'QA_API_URL_PLACEHOLDER']] as const) {
    const p = eas.build[name]!;
    expect(p.extends).toBe('preview');
    expect(p.env?.['APP_VARIANT']).toBe(name);
    expect(p.env?.['SOCIALNET_DISTRIBUTION']).toBe(name);
    expect(p.env?.['SOCIALNET_API_BASE_URL']).toBe(placeholder);
    expect(p.env?.['SOCIALNET_DEV_API_BASE_URL']).toBe(placeholder);
  }
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

describe('a non-prod build refuses an API address that is not https (M30 review fix 2)', () => {
  const bad = ['DEV_API_URL_PLACEHOLDER', 'QA_API_URL_PLACEHOLDER', 'STAGING_API_URL_PLACEHOLDER', 'http://dev.example.test', 'ftp://x.example', 'dev.example.test', ' https://x'];
  it.each(['dev', 'qa'])('%s: placeholders, http and bare hosts all throw', (variant) => {
    for (const url of bad) {
      expect(() => build({ APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: url })).toThrow(/https/);
    }
    expect(() => build({ APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: 'https://ok.example.test' })).not.toThrow();
  });

  it('the staging profile (dev variant) throws on its placeholder too', () => {
    expect(() => build({ APP_VARIANT: 'dev', SOCIALNET_DISTRIBUTION: 'staging', SOCIALNET_DEV_API_BASE_URL: 'STAGING_API_URL_PLACEHOLDER' })).toThrow(/https/);
  });

  it('every eas.json profile that builds a non-prod variant names SOCIALNET_DEV_API_BASE_URL (so the check can fire)', () => {
    const eas = JSON.parse(read('eas.json')) as { build: Record<string, { env?: Record<string, string> }> };
    for (const [name, p] of Object.entries(eas.build)) {
      if (p.env?.['APP_VARIANT']) expect([name, Boolean(p.env['SOCIALNET_DEV_API_BASE_URL'])]).toEqual([name, true]);
    }
  });
});

describe('SOCIALNET_API_BASE_URL cannot undo the https rule for a non-prod build (M30 review round 2)', () => {
  const PROD_URL = 'https://socialmorning-api.vercel.app';
  it.each(['dev', 'qa'])('%s: a placeholder, http or the production address in SOCIALNET_API_BASE_URL throws', (variant) => {
    const base = { APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: 'https://ok.example.test' };
    expect(() => build({ ...base, SOCIALNET_API_BASE_URL: 'QA_API_URL_PLACEHOLDER' })).toThrow(/SOCIALNET_API_BASE_URL.*https/);
    expect(() => build({ ...base, SOCIALNET_API_BASE_URL: 'http://ok.example.test' })).toThrow(/SOCIALNET_API_BASE_URL.*https/);
    expect(() => build({ ...base, SOCIALNET_API_BASE_URL: PROD_URL })).toThrow(/production/);
    expect(() => build({ ...base, SOCIALNET_API_BASE_URL: `${PROD_URL}/` })).toThrow(/production/);
    expect(build({ ...base, SOCIALNET_API_BASE_URL: 'https://other.example.test' }).extra.apiBaseUrl).toBe('https://other.example.test');
    expect(build(base).extra.apiBaseUrl).toBe('https://ok.example.test');
  });

  it('prod keeps the local journey server: SOCIALNET_API_BASE_URL=http://… still works with no variant', () => {
    expect(build({ SOCIALNET_API_BASE_URL: 'http://192.168.0.5:8787' }).extra.apiBaseUrl).toBe('http://192.168.0.5:8787');
  });
});

describe('SOCIALNET_DEV_API_BASE_URL cannot be the production address (M30 review round 3)', () => {
  const PROD_FORMS = ['https://socialmorning-api.vercel.app', 'https://socialmorning-api.vercel.app/', 'https://SocialMorning-API.Vercel.App', 'https://socialmorning-api.vercel.app:443/v1'];
  it.each(['dev', 'qa'])('%s: the production host in any spelling throws, with and without SOCIALNET_API_BASE_URL', (variant) => {
    for (const url of PROD_FORMS) {
      expect(() => build({ APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: url })).toThrow(/production/);
      expect(() => build({ APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: url, SOCIALNET_API_BASE_URL: 'https://other.example.test' })).toThrow(/production/);
    }
    expect(build({ APP_VARIANT: variant, SOCIALNET_DEV_API_BASE_URL: 'https://not-socialmorning-api.vercel.app.example.test' }).extra.apiBaseUrl).toBe('https://not-socialmorning-api.vercel.app.example.test');
  });

  it('the staging profile (dev variant) refuses it too', () => {
    expect(() => build({ APP_VARIANT: 'dev', SOCIALNET_DISTRIBUTION: 'staging', SOCIALNET_DEV_API_BASE_URL: 'https://socialmorning-api.vercel.app' })).toThrow(/production/);
  });

  it('prod still talks to the production address', () => {
    expect(build().extra.apiBaseUrl).toBe('https://socialmorning-api.vercel.app');
  });
});
