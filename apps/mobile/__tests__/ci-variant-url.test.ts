// Tests that the CI app builds can name the dev API: a `variant=dev` build with no address fails in the first seconds, not at prebuild.
/**
 * M30 review round 2: app.config.js now throws for a dev app with no SOCIALNET_DEV_API_BASE_URL, and ios.yml / android-compile.yml
 * set APP_VARIANT=dev without passing one, so a `variant=dev` run died at prebuild. Each workflow now has a `dev_api_url` input,
 * passes it through, and refuses a dev run without it up front. The workflows live in ci/workflows/ of the private repo and are not in
 * the public mirror, so in the mirror this test skips (visibly). Break: delete the `dev_api_url` input from either file — red.
 * A real run of either workflow is NOT VERIFIED here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const FILES = ['ios.yml', 'android-compile.yml'];
const dir = process.env['CI_WORKFLOWS_DIR'] ?? join(ROOT, 'ci', 'workflows');
const present = FILES.every((f) => existsSync(join(dir, f)));

(present ? describe : describe.skip)('variant=dev needs its API address in CI (ci/workflows not found here: skipped)', () => {
  it.each(FILES)('%s has a dev_api_url input, passes it as SOCIALNET_DEV_API_BASE_URL, and refuses variant=dev without it', (f) => {
    const t = readFileSync(join(dir, f), 'utf8');
    expect(t).toMatch(/^ {6}dev_api_url:/m);
    expect(t).toMatch(/SOCIALNET_DEV_API_BASE_URL:\s*\$\{\{\s*inputs\.dev_api_url\s*\}\}/);
    // an early step that fails the run when variant is dev and the input is empty
    expect(t).toMatch(/inputs\.variant == 'dev' && inputs\.dev_api_url == ''/);
    // the prod build is unchanged: no variant -> prod, and no address is forced on it
    expect(t).toMatch(/APP_VARIANT:\s*\$\{\{\s*inputs\.variant == 'dev' && 'dev' \|\| 'prod'\s*\}\}/);
  });
});
