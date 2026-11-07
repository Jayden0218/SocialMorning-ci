// Tests that the player's "Show: <name>" link and the comment sheet's "Cancel" are 44 pt frames (036 D7).
/**
 * 036 D7 (owner, 2026-11-03: "Follow your suggestion go"). The frame guard read these off device hierarchies: the player title block's
 * "Show: Journey Morning" 114 x 18 and the New-comment / Reply sheet head's "Cancel" 56 x 20 (62 x 26 at the largest text).
 * Jest has no layout engine, so this reads the style the engine is given: `minHeight` 44 on the pressable that carries the name and the
 * negative vertical margin that keeps the row as drawn (never `hitSlop` alone). The show link sits in an 18 line: (44 - 18) / 2 = 13 off
 * each side. The Cancel sits in the 38 head row the Post pill sets: (44 - 38) / 2 = 3 off each side, so the head stays 38 at any text size.
 *
 * The break that turns it red: take `minHeight` or the margin off either pressable (both were red before the fix, 2026-11-03).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars } from '@/design';

const mockSettings = new Map<string, string>();
const mockStores = {
  settings: { get: (k: string) => mockSettings.get(k), set: (k: string, v: string) => { mockSettings.set(k, v); }, delete: () => undefined },
  feeds: { getEpisode: () => undefined, getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Journey Morning' }) },
  subscriptions: { has: () => false, add: jest.fn() },
  positions: { get: () => undefined },
};
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => jest.fn() }));
jest.mock('@/social/live', () => ({ liveLabel: () => undefined, useListeningNow: () => undefined }));
jest.mock('@/playback/store', () => ({
  ...jest.requireActual('@/playback/store'),
  usePlayer: () => ({ clip: () => undefined }),
  usePlayerSelector: (sel: (s: unknown) => unknown) => sel({ kind: 'idle' }),
}));
jest.mock('@/social/context', () => ({
  useSocial: () => ({
    composer: { canSubmit: () => false, submit: jest.fn(), edit: (s: unknown) => s, removeMoment: (s: unknown) => s },
    useEpisodeSocial: () => ({ cached: undefined, stale: false }),
  }),
}));
jest.mock('@/social/comment-extras-api', () => ({
  ...jest.requireActual('@/social/comment-extras-api'),
  useCommentExtrasApi: () => ({ imagesOn: () => Promise.resolve(false) }),
}));

import { PlayerTitleBlock } from '@/ui/player/PlayerTitleBlock';
import { ComposerSheet } from '@/ui/comments/Composer';

const MIN = bars.circle;
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['style'] !== undefined && typeof n.props['onPress'] === 'function');
  if (found.length === 0) throw new Error(`no host named ${label}`);
  return found[0]!;
};
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
async function mount(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}

describe('036 D7: two links that were 18 and 26 tall', () => {
  it('the player\'s "Show: <name>" is a 44 frame, -13 above and below its 18 line', async () => {
    const episode = { id: 'e1', feedUrl: 'https://f/x.xml', title: 'Why mornings matter' };
    const r = await mount(createElement(PlayerTitleBlock, { episodeId: 'e1', episode: episode as never, show: { feedUrl: 'https://f/x.xml', title: 'Journey Morning' } as never }));
    const s = flat(byLabel(r, 'Show: Journey Morning'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-13);
  });
  it('the sheet head\'s "Cancel" is a 44 frame, -3 above and below, so the 38 head row stays as drawn', async () => {
    const r = await mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: '', moment: { offsetMs: 872_000 } } as never, onClose: jest.fn(), onPosted: jest.fn() }));
    const s = flat(byLabel(r, 'Cancel'));
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-3);
    expect(s['minWidth']).toBeGreaterThanOrEqual(MIN);
  });
});

describe('038: the reply composer\'s Post (a11y-frames, run 41934113529: 65 x 38)', () => {
  it('"Post" is a 44 frame, -3 above and below, so the 38 pill and the head row stay as drawn', async () => {
    const r = await mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: 'Hi', moment: { offsetMs: 872_000 } } as never, onClose: jest.fn(), onPosted: jest.fn() }));
    const found = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Post' && n.props['style'] !== undefined && typeof n.props['accessibilityRole'] === 'string' && typeof n.type === 'string');
    expect(found.length).toBeGreaterThan(0);
    const s = flat(found[0]!);
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-3);
    expect(Number(s['minWidth'] ?? 0)).toBeGreaterThanOrEqual(MIN);
  });
});
