// Spec 039 I2: the shared parts that pages still draw are on design B and the 038 tokens: no spine indent, no edge label, 038 radii and spacing.
/**
 * Written for the integration lane after the page lanes moved every user onto `Page`/`PageList`. Each guard names the revert that turns it red (each was seen red once, then restored):
 *  - GhostRows: no spine indent (the bars start at the page's gutter, not 56 in): put `paddingLeft: COMMENTS.cardIndent` back — red;
 *  - NotifCard: radius 16, padding 16, gap 8: `radius.row` -> `radius.bar` — red;
 *  - PageEmpty: the title is the `heading` step and the line the `body` step, 12 between the curve and the words: a typed `fontSize` back — red;
 *  - RetryTile: the kit InlineNotice with a Retry that acts, not a bespoke tile: `ErrTile` back — red;
 *  - CornerSquare: radius 16 tucked 8 past the corner;
 *  - IconBlock: a 64 disc, the line as a header, the action under it; keeps its testID.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { GhostRows } from '@/ui/comments/Spine';
import { NotifCard } from '@/ui/notifications/parts';
import { PageEmpty } from '@/ui/me/lists';
import { CornerSquare, RetryTile } from '@/ui/discover/Mosaic';
import { IconBlock } from '@/ui/profile/parts';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['testID'] === id);
const classOf = (n: ReactTestInstance): string => String(n.props['className'] ?? '');
const texts = (r: ReactTestRenderer): ReactTestInstance[] => r.root.findAll((x) => String(x.type) === 'Text');

it('GhostRows start at the gutter: no spine indent, 12 between rows', () => {
  const r = render(createElement(GhostRows, { rows: 3 }));
  const box = byId(r, 'ghost-rows')[0]!;
  expect(flat(box)['paddingLeft']).toBeUndefined();
  expect(flat(box)['marginLeft']).toBeUndefined();
  expect(flat(box)['gap']).toBe(12);
});

it('a notification card is raise, radius 16, padding 16, 8 between parts; an unread one has the 3 wide hot edge', () => {
  const r = render(createElement(NotifCard, { unread: true } as React.ComponentProps<typeof NotifCard>, createElement('Text' as never, null, 'x')));
  const card = byId(r, 'notif-card')[0]!;
  expect(classOf(card)).toContain('bg-raise');
  expect(flat(card)).toMatchObject({ borderRadius: 16, padding: 16, gap: 8 });
  expect(flat(byId(r, 'notif-unread-edge')[0])).toMatchObject({ width: 3 });
});

it('the empty block: the title is the heading step, the line the body step, 12 between curve and words', () => {
  const r = render(createElement(PageEmpty, { top: 0, title: 'Nothing here', line: 'Come back later.' }));
  const t = texts(r).find((x) => x.props['children'] === 'Nothing here')!;
  expect(classOf(t)).toContain('text-pulse-heading');
  const l = texts(r).find((x) => x.props['children'] === 'Come back later.')!;
  expect(classOf(l)).toContain('text-pulse-body');
  const column = byId(r, 'page-empty')[0]!.findAll((n) => typeof n.type === 'string' && flat(n)['paddingVertical'] === 8)[0];
  expect(flat(column)).toMatchObject({ gap: 12, paddingHorizontal: 24 });
});

it('RetryTile is the kit inline notice and its Retry acts', () => {
  const onRetry = jest.fn();
  const r = render(createElement(RetryTile, { line: "Couldn't load.", onRetry }));
  expect(byId(r, 'inline-notice')).toHaveLength(1);
  expect(byId(r, 'err-tile')).toHaveLength(0);
  const retry = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function')[0]!;
  act(() => { retry.props['onPress'](); });
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('a genre corner square is a 16 radius square tucked 8 past the corner', () => {
  const r = render(createElement(CornerSquare, { name: 'News', size: 60 }));
  expect(flat(byId(r, 'corner-square')[0])).toMatchObject({ width: 60, height: 60, borderRadius: 16, right: -8, bottom: -8 });
});

it('the icon block keeps its testID, a 64 disc, the line as a header and the action under it', () => {
  const r = render(createElement(IconBlock, { icon: 'wifi', failure: true, line: "Couldn't load.", testID: 'block' }, createElement('Text' as never, null, 'Retry')));
  expect(byId(r, 'block')).toHaveLength(1);
  const line = texts(r).find((x) => x.props['children'] === "Couldn't load.")!;
  expect(line.props['accessibilityRole']).toBe('header');
  expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['width'] === 64 && flat(n)['height'] === 64)).not.toHaveLength(0);
});
