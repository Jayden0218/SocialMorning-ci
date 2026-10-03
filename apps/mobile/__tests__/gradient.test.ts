/**
 * The player's wash (research R3/R4). No native colour extractor is wired — RN cannot
 * read an image's pixels without one, and adding the reference's was refused as a cost
 * before evidence. So today this always returns the neutral wash. The rule it enforces
 * is what matters: **a tint that would hurt legibility is refused**, whatever its source.
 */
import { colour, BODY_MIN, contrastRatio } from '@/design';
import { FLAT, gradientFor } from '@/design/gradient';

it('with no tint — which is every call today — it is the neutral wash, never a blank', () => {
  expect(gradientFor()).toEqual(FLAT);
  expect(gradientFor(null)).toEqual(FLAT);
  expect(FLAT[0]).toBe(colour.surface);
  expect(FLAT[2]).toBe(colour.background);
});

it('a tint the dark text can be read on is used', () => {
  // White theme: #f5c542 is light enough for the dark text to clear the body floor.
  expect(contrastRatio(colour.text, '#f5c542')).toBeGreaterThanOrEqual(BODY_MIN);
  expect(gradientFor('#f5c542')[0]).toBe('#f5c542');
});

it('a tint that would drop the dark text under the floor is refused, and the flat background is used', () => {
  // A deep artwork colour: the dark text on it measures well under 4.5.
  expect(contrastRatio(colour.text, '#3b0a12')).toBeLessThan(BODY_MIN);
  expect(gradientFor('#3b0a12')).toEqual(FLAT);
});
