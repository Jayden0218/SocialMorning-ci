// Spec 039 (device run 42017007191): Saved moments and Favourites both showed a star because `bookmark-outline` mapped to the star shape.
/** Break to watch red: point `bookmark-outline` / `bookmark` at SHAPES.star / SHAPES.starF again. */
import { DRAWN_ICONS } from '@/ui/kit/drawn-icons';

it('the bookmark icons are not the star shapes, and the outline and filled forms differ', () => {
  expect(DRAWN_ICONS['bookmark-outline']).toBeDefined();
  expect(DRAWN_ICONS['bookmark-outline']).not.toBe(DRAWN_ICONS['star-outline']);
  expect(DRAWN_ICONS['bookmark']).not.toBe(DRAWN_ICONS['star']);
  expect(DRAWN_ICONS['bookmark']).not.toBe(DRAWN_ICONS['bookmark-outline']);
});
