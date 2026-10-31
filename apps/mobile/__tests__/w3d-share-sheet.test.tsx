// Checks the Share sheet is the Pulse one: kit sheet titled Share, 250 x 150 preview cards, 56 targets, 84 tiles.
/**
 * M31 W3-D (design-pulse2 listen.html `player--share-sheet`). Reds: put the targets back as tiles
 * (drop `target`), draw the cards another size (share.cardWidth/Height), or lose "More ways to share".
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Linking } from 'react-native';
import { SharePanel, useClipShare, useSharePanel } from '@/ui/clips/ShareChooser';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/kit/useColours', () => ({ useColours: () => require('@/design').colour }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => ({}) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}), useToast: () => jest.fn() }));
jest.mock('@/social/context', () => ({ useSocial: () => ({}) }));
jest.mock('../modules/clip-video', () => ({ isAvailable: () => true, MAX_CLIP_VIDEO_MS: 60000 }));
jest.mock('@/social/base-url', () => ({ apiBaseUrl: () => 'https://api' }));

const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const hostBy = (label: string): ReactTestInstance => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === label)[0]!;

function draw(extra: object = {}): void {
  act(() => {
    r = create(createElement(SharePanel, {
      open: true, onClose: jest.fn(), colour: '#fff', more: { run: jest.fn() },
      cards: [{ key: 'moment', label: 'Share this moment', title: 'Why mornings matter', at: '12:32' }, { key: 'episode', label: 'Episode · Show', title: 'Why mornings matter' }],
      chosen: 'moment', onChoose: jest.fn(),
      apps: [{ icon: 'logo-whatsapp', label: 'WhatsApp', onPress: jest.fn() }],
      rows: [
        { icon: 'chatbubbles-outline', label: 'Send in chat', target: true, onPress: jest.fn() },
        { icon: 'image-outline', label: 'Share as image', onPress: jest.fn() },
        { icon: 'link-outline', label: 'Copy link', onPress: jest.fn() },
        { icon: 'cut-outline', label: 'Clip', detail: 'the last 30 seconds', onPress: jest.fn() },
      ],
      ...extra,
    }));
  });
}

it('is the kit sheet titled Share', () => {
  draw();
  expect(r.root.findAll((n) => n.props['testID'] === 'action-sheet').length).toBeGreaterThan(0);
  expect(hostBy('Share')).toBeTruthy();
});
it('preview cards are 250 x 150 with a 22 radius; the chosen one has the 2 px light ring', () => {
  draw();
  const moment = flat(hostBy('Share this moment').props['style']);
  expect(moment).toMatchObject({ width: 250, height: 150, borderRadius: 22, borderWidth: 2 });
  expect(moment['borderColor']).toBe('#f4f2ee');
  expect(flat(hostBy('Episode · Show').props['style'])['borderColor']).not.toBe('#f4f2ee');
});
it('targets are 56 squares (radius 18): chat, the apps, then More; format tiles are 84 tall', () => {
  draw();
  const box = (label: string) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === label)[0]!;
  for (const l of ['Send in chat', 'Send with WhatsApp', 'More ways to share']) {
    const sq = box(l).findAll((n) => { const f = flat(n.props['style']); return f['width'] === 56 && f['height'] === 56; })[0];
    expect(sq).toBeTruthy();
    expect(flat(sq!.props['style'])['borderRadius']).toBe(18);
  }
  for (const l of ['Share as image', 'Copy link', 'Clip']) expect(flat(hostBy(l).props['style'])['height']).toBe(84);
});
it('a tap closes the panel then acts; no cards, no deck', () => {
  const onClose = jest.fn(); const run = jest.fn();
  draw({ onClose, more: { run }, cards: [], chosen: undefined });
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Share this moment').length).toBe(0);
  act(() => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'More ways to share' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); });
  expect(onClose).toHaveBeenCalled();
  expect(run).toHaveBeenCalled();
});

// F3 defect 3 (design-pulse2 `clip--share-sheet`): the clip page's Share sheet is the player's. Red: make `useClipShare` return only
// `more` (the old sheet listed "More" and nothing else), or drop `message` (the chat apps vanish).
it('F3: a clip\'s share sheet lists Send in chat, the chat apps, More, Share as video and Copy link', async () => {
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  const clip = { id: 'c1', author: { id: 'a', displayName: 'A' }, episodeId: 'e', startMs: 722_000, endMs: 752_000, caption: '', createdAt: 'now', deleted: false };
  const episode = { id: 'e', url: 'https://a/x.mp3', title: 'Why mornings matter', showTitle: 'Morning Notes' };
  function Probe(): React.ReactElement {
    const [share, panel] = useSharePanel();
    const clipShare = useClipShare();
    return createElement(require('react').Fragment, null, createElement(require('react-native').Pressable, { accessibilityLabel: 'open', onPress: () => share(clipShare(clip, episode)) }), panel);
  }
  act(() => { r = create(createElement(Probe)); });
  await act(async () => { r.root.findAll((n) => n.props['accessibilityLabel'] === 'open' && typeof n.props['onPress'] === 'function')[0]!.props['onPress'](); });
  await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
  const names = r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['accessibilityLabel'] === 'string').map((n) => n.props['accessibilityLabel'] as string);
  for (const l of ['Send in chat', 'Send with WhatsApp', 'Send with Telegram', 'More ways to share', 'Share as video', 'Copy link']) expect(names).toContain(l);
  expect(names.indexOf('Send in chat')).toBeLessThan(names.indexOf('Send with WhatsApp'));
  expect(names.indexOf('Send with Telegram')).toBeLessThan(names.indexOf('More ways to share'));
  expect(names.indexOf('Share as video')).toBeLessThan(names.indexOf('Copy link'));
});

it('F3: the targets row scrolls sideways, so More stays reachable when many chat apps are installed', () => {
  draw({ apps: ['WhatsApp', 'Telegram', 'WeChat', 'Messages', 'X'].map((label) => ({ icon: 'logo-whatsapp', label, onPress: jest.fn() })) });
  const row = r.root.findAll((n) => n.props['testID'] === 'share-targets')[0]!;
  expect(row.props['horizontal']).toBe(true);
  expect(row.findAll((n) => n.props['accessibilityLabel'] === 'More ways to share').length).toBeGreaterThan(0);
  expect(row.findAll((n) => typeof n.props['accessibilityLabel'] === 'string' && String(n.props['accessibilityLabel']).startsWith('Send with ')).length).toBeGreaterThanOrEqual(5);
});
