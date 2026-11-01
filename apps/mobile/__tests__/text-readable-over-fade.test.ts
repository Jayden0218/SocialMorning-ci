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

it('the Tips empty state draws no fade over its words', () => {
  const src = read('app', 'tips.tsx');
  expect(src).toMatch(/<PushedPage[^>]*\bfade=\{empty \? 0 : undefined\}/);
});

it('OverlayPage takes a `fade` height, and the sign-in steps (AuthShell) ask for none', () => {
  expect(read('src', 'ui', 'kit', 'OverlayPage.tsx')).toMatch(/fade\?: number/);
  expect(read('src', 'ui', 'kit', 'OverlayPage.tsx')).toMatch(/props\.fade \?\?/);
  expect(read('src', 'ui', 'auth', 'AuthShell.tsx')).toMatch(/<OverlayPage[\s\S]*?\bfade=\{0\}/);
});
