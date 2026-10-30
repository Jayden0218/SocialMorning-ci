// Checks that each screen edge gets safe-area padding only once.
/**
 * M12 guard G-T1 (NEW-5): each safe-area edge is padded once. react-native-safe-area-context's
 * SafeAreaView adds the full inset even inside another one, so the root (bottom only) and the
 * screens (top and sides) must split the edges — found on the iPhone 2026-09-29 as a ~60 pt
 * empty band under the status bar on every self-headed screen.
 *
 * M25 lane GB: the root half is now RENDERED — __tests__/root-layout.test.tsx mounts app/_layout.tsx
 * with known insets and adds up the padding above a page: the top inset once, the bottom once.
 * Here: the page side (rendered too) and the player's own bar (a source check, see below).
 *
 * The break that turns it red: drop `edges={…['bottom']}` from the root SafeAreaView in
 * app/_layout.tsx (root-layout.test.tsx goes red), or add 'bottom' to SCREEN_EDGES (both go red).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { SafeAreaView, SCREEN_EDGES } from '@/ui/lib/safe-area-view';

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

it('screens pad their top and sides, never the bottom', () => {
  expect([...SCREEN_EDGES].sort()).toEqual(['left', 'right', 'top']);
});

it('a page\'s SafeAreaView, rendered: the top inset as padding, no bottom; `edges` picks the sides', () => {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS },
      createElement(SafeAreaView, { testID: 'page' }),
      createElement(SafeAreaView, { testID: 'root', edges: ['bottom'] })));
  });
  const style = (id: string) => (StyleSheet.flatten(r.root.find((n) => typeof n.type === 'string' && n.props['testID'] === id).props['style']) ?? {}) as Record<string, unknown>;
  expect(style('page')['paddingTop']).toBe(INSETS.top);
  expect(style('page')['paddingBottom']).toBeUndefined();
  expect(style('root')['paddingBottom']).toBe(INSETS.bottom);
  expect(style('root')['paddingTop']).toBeUndefined();
  act(() => r.unmount());
});

// KEPT as a source check: app/player.tsx imports ~55 modules (player, social, queue, sheets,
// gestures); rendering it for one padding value is not worth the mocks. The root's "no edge on
// the player" half is rendered in root-layout.test.tsx.
it('the player pads its own bar by the bottom inset (owner, 2026-10-06)', () => {
  const player = readFileSync(join(__dirname, '../app/player.tsx'), 'utf8');
  expect(player).toMatch(/paddingBottom: insets\.bottom/);
});
