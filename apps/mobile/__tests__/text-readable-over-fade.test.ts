// Tests that error and empty-state words are readable: by their colours, and by not sitting under a fade that dims them.
/**
 * 035 T064 (device check A2, A6; FR-014; SC-004). Measured from screenshots: the wrong-code error "That code is not right." was about
 * 1.9:1 and the Tips line about 1.6:1. The text colours are fine (below: hotText, text2, text3 clear 4.5:1 on void and raise2, from
 * the tokens); what dimmed them is the page's `Fade` (a gradient to the page colour that is drawn over everything at the foot, meant for
 * content that scrolls behind the title bar). On pages whose content does not scroll, the fade must not be drawn: the Tips page (its empty
 * state) and the sign-in steps (`AuthShell` → `OverlayPage`). Source checks, as G-W1: the layout is not measurable in jest.
 * Breaks that turn it red: drop `fade={0}` from the Tips empty state or from AuthShell; make OverlayPage ignore `fade`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { colour } from '@/design/tokens';
import { contrastRatio } from '@/design/contrast';

const read = (...p: string[]) => readFileSync(path.join(__dirname, '..', ...p), 'utf8');

it.each([['hotText', colour.hotText], ['text2', colour.text2], ['text3', colour.text3]])('%s (error, empty-state and hint words) is at least 4.5:1 on void and on raise2', (_n, fg) => {
  expect(contrastRatio(fg, colour.void)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(fg, colour.raise2)).toBeGreaterThanOrEqual(4.5);
});

// 039 (Feed lane): was "<PushedPage fade={empty ? 0 : undefined}" (a PushedPage's top fade, turned off for the empty stage). Tips is a FeedPage now (a PageList): the list has no fade
// over it at all, so the empty state's words cannot be covered; the guard is that the page does not go back to a PushedPage and draws no Fade of its own.
it('the Tips empty state draws no fade over its words', () => {
  const src = read('app', 'tips.tsx');
  expect(src).toMatch(/<FeedPage\b/);
  expect(src).not.toMatch(/<PushedPage\b/);
  expect(src).not.toMatch(/<Fade\b/);
});

it('OverlayPage takes a `fade` height, and the sign-in steps draw none (039: they are on FormPage, which has no fade)', () => {
  expect(read('src', 'ui', 'kit', 'OverlayPage.tsx')).toMatch(/fade\?: number/);
  expect(read('src', 'ui', 'kit', 'OverlayPage.tsx')).toMatch(/props\.fade \?\?/);
  // 039 (was: AuthShell's `<OverlayPage fade={0}>`; now: the sign-in steps are a `FormPage`, a transparent `Page` that draws no fade at all).
  expect(read('app', 'auth', 'email.tsx')).toMatch(/<FormPage\b/);
  expect(read('src', 'ui', 'auth', 'AuthShell.tsx')).not.toMatch(/<OverlayPage\b/);
  expect(read('src', 'ui', 'form', 'FormPage.tsx')).not.toMatch(/<Fade\b|fade=|LinearGradient/);
});
