// Tests that each EAS build profile points the app at the right API: prod builds at today's address, the staging build only at staging.
/**
 * M27 US4 (FR-034), guards G-CL1 and G-CL2. app.config.js already turns SOCIALNET_API_BASE_URL into `extra.apiBaseUrl` (the listener
 * journey uses it); eas.json now sets it per profile. The staging profile is the DEV variant (its own bundle id, so it installs
 * BESIDE the store app and never replaces it) with no GitHub self-updater, and both address variables hold the staging address — the
 * owner replaces STAGING_API_URL_PLACEHOLDER with the `stg-api` Function URL after the first staging deploy (docs/runbooks/m26-aws-setup.md).
 *
 * Break G-CL1: change the `production` profile's address in eas.json — the first test goes red. Break G-CL2: remove
 * SOCIALNET_API_BASE_URL from the staging profile (it would inherit preview's production address) — the staging tests go red.
 * Building and installing the staging app is NOT VERIFIED here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const appJson = JSON.parse(read('app.json')) as { expo: { extra: { apiBaseUrl: string } } };
type Profile = { extends?: string; env?: Record<string, string> };
const eas = JSON.parse(read('eas.json')) as { build: Record<string, Profile> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeConfig = require('../app.config.js') as (a: { config: unknown }) => { extra: { apiBaseUrl: string; variant?: string; distribution?: string } };

const PROD = 'https://socialmorning-api.vercel.app';
const KEYS = ['APP_VARIANT', 'SOCIALNET_DEV_API_BASE_URL', 'SOCIALNET_API_BASE_URL', 'SOCIALNET_DISTRIBUTION', 'SOCIALNET_IOS_EXTRAS'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

/** The env EAS gives a profile: its `extends` chain, parent first. */
function envOf(name: string): Record<string, string> {
  const p = eas.build[name]!;
  return { ...(p.extends ? envOf(p.extends) : {}), ...p.env };
}
const configFor = (name: string) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, envOf(name));
  return makeConfig({ config: JSON.parse(JSON.stringify(appJson.expo)) });
};

describe('production and preview builds are unchanged', () => {
  it('G-CL1: the production profile talks to today’s address (app.json’s), as does preview', () => {
    expect(appJson.expo.extra.apiBaseUrl).toBe(PROD);
    expect(configFor('production').extra.apiBaseUrl).toBe(PROD);
    expect(configFor('preview').extra.apiBaseUrl).toBe(PROD);
  });

  it('with no profile variable at all, the address is still app.json’s', () => {
    expect(makeConfig({ config: JSON.parse(JSON.stringify(appJson.expo)) }).extra.apiBaseUrl).toBe(PROD);
  });

  it('preview keeps the GitHub self-updater, production does not', () => {
    expect(configFor('preview').extra.distribution).toBe('github');
    expect(configFor('production').extra.distribution).toBeUndefined();
  });
});

describe('the staging profile reaches only staging', () => {
  it('G-CL2: its address is its own, never the production host', () => {
    const c = configFor('staging');
    expect(c.extra.apiBaseUrl).not.toContain('vercel.app');
    expect(c.extra.apiBaseUrl).toBe(envOf('staging')['SOCIALNET_DEV_API_BASE_URL']);
    expect(JSON.stringify(eas.build['staging'])).not.toContain('socialmorning-api');
  });

  it('is the dev variant (installs beside the store app) and never offers the GitHub self-updater', () => {
    const c = configFor('staging');
    expect(c.extra.variant).toBe('dev');
    expect(c.extra.distribution).toBeUndefined();
  });

  it('holds a placeholder until the owner has a staging address', () => {
    expect(envOf('staging')['SOCIALNET_API_BASE_URL']).toMatch(/^(STAGING_API_URL_PLACEHOLDER|https:\/\/[a-z0-9-]+\.lambda-url\.ap-southeast-1\.on\.aws\/?)$/);
  });
});
