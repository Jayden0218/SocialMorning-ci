// Checks that global.css theme exactly matches the design tokens file.
/**
 * M9 guard G4 (FR-004): `global.css`'s theme is generated from `src/design/tokens.ts` and
 * must match it byte for byte. The break that turns it red: change a colour in tokens.ts
 * without running `node scripts/tokens-to-css.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('G4: global.css matches tokens.ts', () => {
  const script = join(__dirname, '..', 'scripts', 'tokens-to-css.mjs');
  // --check exits 1 (and throws here) when the generated block differs.
  expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow();
});
