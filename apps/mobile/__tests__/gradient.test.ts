/**
 * The player's wash (research R3/R4). No native colour extractor is wired — RN cannot
 * read an image's pixels without one, and adding the reference's was refused as a cost
 * before evidence. So today this always returns the neutral wash. The rule it enforces
 * is what matters: **a tint that would hurt legibility is refused**, whatever its source.
 */
import { colour, BODY_MIN, contrastRatio } from '../src/design';
import { FLAT, gradientFor } from '../src/design/gradient';

it('with no tint — which is every call today — it is the neutral wash, never a blank', () => {
  expect(gradientFor()).toEqual(FLAT);
  expect(gradientFor(null)).toEqual(FLAT);
  expect(FLAT[0]).toBe(colour.surface);
  expect(FLAT[2]).toBe(colour.background);
});

it('a tint white text can be read on is used', () => {
  // #3b0a12 is dark enough for white to clear the body floor.
  expect(contrastRatio(colour.text, '#3b0a12')).toBeGreaterThanOrEqual(BODY_MIN);
  expect(gradientFor('#3b0a12')[0]).toBe('#3b0a12');
});

it('a tint that would drop white text under the floor is refused, and the flat background is used', () => {
  // A bright artwork colour: white on it measures well under 4.5.
  expect(contrastRatio(colour.text, '#f5c542')).toBeLessThan(BODY_MIN);
  expect(gradientFor('#f5c542')).toEqual(FLAT);
});
