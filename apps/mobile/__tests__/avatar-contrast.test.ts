// Checks an avatar's letter can be read on every colour it is drawn on.
/**
 * M31 integration (L5). `Avatar` draws one letter on a person's own pastel (`coverTone`, seven light
 * fills) and, for comments, (the pink-tint comment disc is gone, wave 5b). The letter must reach AA body contrast
 * (4.5, WCAG 2.x, `src/design/contrast.ts`) on the Pulse palette. The first version drew the page's
 * light text on the pastels (1.2–1.6:1, unreadable).
 *
 * The break that turns it red: set the hot tone's `ink` to 'text' in AVATAR_TONES
 * (src/ui/kit/Avatar.tsx): light on hot is 3.2:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AVATAR_TONES } from '@/ui/kit/Avatar';
import { colour } from '@/design';
import { BODY_MIN, contrastRatio, over } from '@/design/contrast';

const src = readFileSync(join(__dirname, '..', 'src', 'ui', 'kit', 'Avatar.tsx'), 'utf8');
/** The colour token a className names (`text-onPrimary` -> colour.onPrimary). */
const token = (cls: string): string => (colour as Record<string, string>)[cls.replace(/^text-/, '')]!;

// F2a: the discs are the drawings' saturated colours (hot, violet, green, amber, blue), each with the letter that passes.
const LETTER = { void: 'text-onPrimary', text: 'text-text' } as const;
it('the coloured circle names both letter classes in full, and each is a Pulse colour', () => {
  expect(src).toContain("'text-text font-extrabold'");
  expect(src).toContain("'text-onPrimary font-extrabold'");
  for (const cls of Object.values(LETTER)) expect(token(cls)).toBeDefined();
});

it('the discs are the saturated set, not the pastels (a pastel fill is lighter than 0.6 luminance)', () => {
  expect(AVATAR_TONES.map((t) => t.fill)).toEqual([colour.hot, colour.violet, colour.pinGreen, colour.pinAmber, colour.pinBlue]);
});

it.each(AVATAR_TONES.map((t) => [t.fill, t.ink] as const))('the letter reaches 4.5:1 on the disc %s (%s letter)', (fill, ink) => {
  expect(contrastRatio(token(LETTER[ink]), fill)).toBeGreaterThanOrEqual(BODY_MIN);
});

// Wave 5b: the pink-tint comment disc (`initials` prop) is gone; every letter avatar takes avatarTone (m31-wave5b-avatar-rule.test.tsx).
it('Avatar has no second disc: no accentTint branch', () => {
  expect(src).not.toContain('accentTint');
});
