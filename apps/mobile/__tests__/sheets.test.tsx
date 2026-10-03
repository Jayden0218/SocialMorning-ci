/**
 * M9 T039: the sheets rebuilt on gluestack's Actionsheet keep their promises.
 * - Moment sheet: someone else's comment has Report (iOS i8 — only the episode page had it);
 *   every action is at least 44 pt (iOS i4 — Close, Reply, Delete were 36–42 × 17).
 * The break that turns it red: drop the Report branch or the `TAP` class in src/ui/MomentSheet.tsx.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/social/context', () => ({ useSocial: () => ({ composer: { remove: jest.fn() }, listener: { listenerId: 'me' }, bump: jest.fn() }) }));
jest.mock('../src/ui/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
jest.mock('../src/safety/context', () => ({ useSafety: () => ({ safety: { report: () => 'hidden' } }), announce: jest.fn() }));

import { MomentSheet } from '../src/ui/MomentSheet';
import { GluestackUIProvider } from '../src/ui/lib/gluestack-ui-provider';
import type { Comment } from '../src/social/api';

const comment = (id: string, mine: boolean): Comment =>
  ({ id, authorId: mine ? 'me' : 'them', displayName: mine ? 'Me' : 'Bea', body: 'x', offsetMs: 872_000, parentId: null, createdAt: 'now', deleted: false, mine });

function render(comments: Comment[]): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(createElement(GluestackUIProvider, null,
      createElement(MomentSheet, { episodeId: 'e', title: 'At 14:32', comments, onClose: jest.fn(), onReply: jest.fn() })));
  });
  return r;
}

/** Host nodes that are buttons, outermost first. */
const buttons = (r: ReactTestRenderer): ReactTestInstance[] =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'button');

it('i8: someone else\'s comment has Report; your own has Delete instead', () => {
  const other = render([comment('c1', false)]);
  expect(other.root.findAll((n) => n.props['accessibilityLabel'] === 'Report this comment' && typeof n.type === 'string')).toHaveLength(1);
  const own = render([comment('c2', true)]);
  expect(own.root.findAll((n) => n.props['accessibilityLabel'] === 'Report this comment')).toHaveLength(0);
});

it('i4: every action in the moment sheet is at least 44 pt tall and wide', () => {
  const r = render([comment('c1', false)]);
  const found = buttons(r);
  expect(found.length).toBeGreaterThanOrEqual(3); // Close, Reply, Report
  for (const b of found) {
    const s = (StyleSheet.flatten(b.props['style']) ?? {}) as Record<string, unknown>;
    expect([b.props['accessibilityLabel'] ?? 'button', Number(s['minHeight']) >= 44, Number(s['minWidth']) >= 44]).toEqual([b.props['accessibilityLabel'] ?? 'button', true, true]);
  }
});
