// Tests that the red error line on the sign-in pages is readable: at least 4.5:1 on its background, for every accent.
/**
 * Real-iPhone check P2: "That code is not right." looked red on near-black. The line is `text-hotText` on `bg-void`
 * (app/auth/email.tsx), and `hotText` is the accent. Measured from the tokens with the WCAG formula, not from pixels.
 * Break to see it red: set `colour.hotText` (src/design/tokens.ts) to '#8b1a2b'.
 * Device: NOT VERIFIED here (a phone).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BODY_MIN, contrastRatio } from '@/design/contrast';
import { ACCENTS, colour } from '@/design/tokens';
import { withAccent } from '@/design/accent';

describe('the sign-in error line: text-hotText on bg-void', () => {
  it('the screen draws it that way (so the pair below is the one on the phone)', () => {
    const src = readFileSync(join(__dirname, '..', 'app/auth/email.tsx'), 'utf8');
    expect(src).toMatch(/\{error \? <Type step="note" className="text-hotText"/);
    // Spec 039 (was: AuthShell's frame `flex-1 bg-void`; now: the page's own KeyboardAvoidingView, AuthShell no longer draws a frame): the page behind the line is void.
    expect(src).toContain('className="flex-1 bg-void"');
  });

  it.each(Object.keys(ACCENTS) as (keyof typeof ACCENTS)[])('%s accent: at least 4.5:1 on void', (name) => {
    const hot = withAccent(colour, name).hotText;
    expect(contrastRatio(hot, colour.void)).toBeGreaterThanOrEqual(BODY_MIN);
  });
});
