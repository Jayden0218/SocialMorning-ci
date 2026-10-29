// Tests that the shared episode sheet a history row's ⋯ opens keeps Share, the comment count and the page's Play.
/**
 * M24 lane B3 (US20, `History-B`), split out of m24-screens.test.tsx: a history row lost its
 * ▶ / Share line, so the extras must be in the shared `EpisodeRowSheet` it opens — Share (the
 * share chooser), "View comments (N)" from the count the list passes, and the list's own actions
 * (history passes Play). Rendered the way app/history.tsx calls it; the page's own wiring stays a
 * source check in m24-screens.test.tsx. NOT VERIFIED on a phone until a build is shot.
 *
 * The break that turns it red: drop the `{ label: 'Share', … }` tile from `shared` in
 * src/ui/kit/EpisodeRowSheet.tsx (or stop it opening the ShareChooser), or stop passing the count
 * to `commentsLabel`, or stop appending `props.actions` to the rows.
 */
// The gluestack sheet animates with @legendapp/motion on timers; keep them inside the test.
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockShareChooser = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), router: { push: mockPush } }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { recordShare: () => Promise.resolve() } }) }));
jest.mock('@/ui/shell/providers', () => ({
  useStores: () => ({
    settings: { get: () => 'light' },
    feeds: { getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }) },
    positions: { get: () => undefined },
    inboxState: { mark: () => undefined },
  }),
  useToast: () => () => undefined,
  useDownloads: () => undefined,
}));
// The sheet's tiles (queue, download, favourites/playlists — M31 W3-A: src/ui/episode/EpisodeSheetBody, rendered in
// m31-w3a-episode.test.tsx) draw nothing here; the body hands back only the rows this guard is about.
jest.mock('@/ui/episode/EpisodeSheetBody', () => ({ EpisodeSheetBody: (p: { rows?: unknown }) => p.rows ?? null, SHEET_GAP: 14 }));
jest.mock('@/ui/clips/ShareChooser', () => ({ ShareChooser: (p: unknown) => { mockShareChooser(p); return null; } }));

import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';

const EPISODE = { id: 'e1', title: 'Casey Wants to Believe', feedUrl: 'https://f/x.xml' };

function render(props: Parameters<typeof EpisodeRowSheet>[0]): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(GluestackUIProvider, null, createElement(EpisodeRowSheet, props))); });
  return r;
}
const pressable = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const lastShare = (): { open: boolean; episode: { id: string } } => mockShareChooser.mock.calls[mockShareChooser.mock.calls.length - 1]![0];

it('the history row\'s sheet shows Share, the comment count and the page\'s Play; Share opens the chooser', () => {
  const onClose = jest.fn();
  const onPlay = jest.fn();
  const r = render({ episode: EPISODE, onClose, comments: 12, actions: [{ icon: 'play', label: 'Play', onPress: onPlay }] });
  for (const label of ['View comments (12)', 'Details', 'Share', 'Play']) expect([label, pressable(r, label) !== undefined]).toEqual([label, true]);
  // M31 W3-A: the drawing's order — Details, View comments (n), Share, then the list's own.
  const names = [...new Set(r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && typeof n.props['onPress'] === 'function').map((n) => n.props['accessibilityLabel']))];
  expect(names.filter((l) => ['Details', 'View comments (12)', 'Share', 'Play'].includes(l as string))).toEqual(['Details', 'View comments (12)', 'Share', 'Play']);
  expect(lastShare().open).toBe(false);

  act(() => { pressable(r, 'Share')!.props['onPress'](); });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(lastShare().open).toBe(true);
  expect(lastShare().episode.id).toBe('e1');

  act(() => { pressable(r, 'Play')!.props['onPress'](); });
  expect(onPlay).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
});

it('with no count the comments tile still shows, unnumbered', () => {
  const r = render({ episode: EPISODE, onClose: jest.fn() });
  expect(pressable(r, 'View comments')).toBeDefined();
  expect(pressable(r, 'Share')).toBeDefined();
  act(() => r.unmount());
});
