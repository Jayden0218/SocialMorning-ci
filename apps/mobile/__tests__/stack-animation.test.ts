// Checks the Comments route rises from the bottom, and fades under Reduce Motion; the replies route keeps the push.
/**
 * M31 W3-D (design-pulse2 social.html comments--screen: "close (44)"). Reds: make commentsAnimation
 * return 'slide_from_right'/ignore reduceMotion, or drop the `animation` option from the comments
 * Screen in app/_layout.tsx.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { commentsAnimation } from '@/ui/shell/stackAnimation';

const layout = readFileSync(join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');

it('rises from the bottom, fades with Reduce Motion', () => {
  expect(commentsAnimation(false)).toBe('slide_from_bottom');
  expect(commentsAnimation(true)).toBe('fade');
});
it('the root stack gives the comments route that animation and the replies route none', () => {
  expect(layout).toMatch(/name="comments\/\[episodeId\]"[^>]*animation: commentsAnimation\(reduceMotion\)/);
  expect(layout).not.toMatch(/name="comments\/thread[^>]*animation/);
});
