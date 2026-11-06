// Tests that the sheet head's "Post" and the Updates card's hot-moment line are 44 pt frames, with the drawn size kept (039, run 42210796897).
/**
 * 039 (run 42210796897, a11y-frames): the device hierarchy measured "Post" 66 x 38 (r08 comments composer) and "00:43 · 10 already reacting" 260 x 22
 * (the Updates card's hot-moment line). Jest has no layout engine, so this reads the style the engine is given, as m36-frames-6 does:
 *  - "Post": the Pressable is the 44 frame (`minHeight` 44, `marginVertical` -3 so the 38 head row stays 38) and the pill that is drawn (38 tall, hot) is its child.
 *  - the hot line: `minHeight` 44 and `marginVertical` -11 (22 line, (44 - 22) / 2 off each side) so the card's column stays as drawn.
 * The break that turns it red: take `minHeight` or the margin off either (both were red before the fix).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { bars } from '@/design';

const mockStores = {
  settings: { get: () => undefined, set: () => undefined, delete: () => undefined },
  feeds: { getEpisode: () => undefined, getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Journey Morning' }) },
  subscriptions: { has: () => false, add: jest.fn() },
  positions: { get: () => undefined },
};
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useSubscriptionSync: () => ({ push: jest.fn() }), useToast: () => jest.fn() }));
jest.mock('@/social/live', () => ({ liveLabel: () => undefined, useListeningNow: () => undefined }));
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

import { ComposerSheet } from '@/ui/comments/Composer';
import { UpdateEpisodeRow } from '@/ui/episode/UpdateEpisodeRow';
import type { UpdateRow } from '@/me/updates';

const MIN = bars.circle;
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
async function mount(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 50, bottom: 34, left: 0, right: 0 } }, el)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}

describe('039: two controls the device measured under 44', () => {
  it('the sheet head\'s "Post" is a 44 frame, -3 above and below, around the 38 pill that is drawn', async () => {
    const r = await mount(createElement(ComposerSheet, { initial: { episodeId: 'e1', body: '', moment: { offsetMs: 872_000 } } as never, onClose: jest.fn(), onPosted: jest.fn() }));
    const post = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Post' && typeof n.props['onPress'] === 'function' && n.props['style'] !== undefined)[0]!;
    const s = flat(post);
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-3);
    const pill = post.findAll((n) => typeof n.props['className'] === 'string' && (n.props['className'] as string).includes('bg-hot'));
    expect(pill.length).toBeGreaterThan(0);
    expect(flat(pill[0]!)['height']).toBe(38);
  });
  it('the Updates card\'s "00:43 · 10 already reacting" line is a 44 frame, -11 above and below its 22 line', () => {
    const NOW = new Date(2026, 9, 1, 12).getTime();
    const row = { episode: { id: 'e1', feedUrl: 'https://f', title: 'Ep', durationMs: 69 * 60_000, publishedAt: NOW - 3_600_000 }, showTitle: 'Show', summary: 'Notes' } as unknown as UpdateRow;
    const noop = () => undefined;
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(UpdateEpisodeRow, { item: row, now: NOW, onOpenShow: noop, onOpenEpisode: noop, onQueue: noop, onComments: noop, onDownload: noop, onMore: noop, onPlay: noop, hot: { startMs: 43_000, reactions: 10 } } as never)); });
    mounted.push(r);
    const line = r.root.findAll((n) => n.props['testID'] === 'update-hot')[0]!;
    expect(line.props['accessibilityLabel']).toBe('00:43 · 10 already reacting');
    const s = flat(line);
    expect(s['minHeight']).toBe(MIN);
    expect(s['marginVertical']).toBe(-11);
  });
});
