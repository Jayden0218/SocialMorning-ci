// Checks that each screen edge gets safe-area padding only once.
/**
 * M12 guard G-T1 (NEW-5): each safe-area edge is padded once. react-native-safe-area-context's
 * SafeAreaView adds the full inset even inside another one, so the root (bottom only) and the
 * screens (top and sides) must split the edges — found on the iPhone 2026-09-29 as a ~60 pt
 * empty band under the status bar on every self-headed screen.
 *
 * The break that turns it red: drop `edges={['bottom']}` from the root SafeAreaView in
 * app/_layout.tsx, or add 'bottom' to SCREEN_EDGES.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCREEN_EDGES } from '@/ui/lib/safe-area-view';

it('screens pad their top and sides, never the bottom', () => {
  expect([...SCREEN_EDGES].sort()).toEqual(['left', 'right', 'top']);
});

it('the root layout pads only the bottom — except on the player, which pads its own bar (owner, 2026-10-06)', () => {
  const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
  const roots = [...layout.matchAll(/<SafeAreaView\b[^>]*>/g)].map((m) => m[0]);
  expect(roots).toHaveLength(1);
  expect(roots[0]).toContain("edges={onPlayer ? [] : ['bottom']}");
  const player = readFileSync(join(__dirname, '../app/player.tsx'), 'utf8');
  expect(player).toMatch(/paddingBottom: insets\.bottom/);
});
