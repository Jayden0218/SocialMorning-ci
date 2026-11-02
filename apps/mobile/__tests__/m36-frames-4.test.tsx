// Tests that the comments sort chips and the Notifications tabs are 44 pt frames around the drawn pills (036 D6).
/**
 * 036 D6 (owner, 2026-11-02, "follow your option suggestion"). The frame guard read the Capsule chips (Newest / Most liked / By moment, 96 x 34) and the Notifications
 * tabs ("People. 3 new...", 101 x 38) as under 44 pt. Jest has no layout engine, so this reads the style the engine is given: the named Pressable carries `minHeight` 44
 * and a negative `marginVertical` that keeps the track as drawn (34 / 38 of layout), and the drawn pill (background, radius, its own height) is an inner Box.
 * The two pins that read the pill on the Pressable moved to the inner Box (m31-comments "the capsule"; m31-w4c-social "the switch is a 44 raise track"), each commented "036 D6".
 *
 * The break that turns it red: put `minHeight` back to the pill's height, or the pill's class back on the Pressable (each was red before the fix, 2026-11-02).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { bars } from '@/design';
import { Capsule } from '@/ui/comments/CommentsBottom';
import { COMMENTS } from '@/ui/comments/measures';
import { NoticeCards, NOTICE } from '@/ui/social/NoticeCards';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/x', Link: ({ children }: { children: unknown }) => children }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined, set: () => undefined } }), useToast: () => jest.fn() }));

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style'] as never) ?? {}) as Record<string, unknown>;
const hostsOf = (r: ReactTestRenderer, role: string): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === role);
const pills = (n: ReactTestInstance): ReactTestInstance[] => n.findAll((x) => typeof x.type === 'string' && x.props['testID'] === 'frame-pill');
const mounted: ReactTestRenderer[] = [];
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const mount = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };

describe('036 D6 the comments sort chips are 44 pt frames', () => {
  const items = [{ value: 'a', label: 'Newest' }, { value: 'b', label: 'Most liked' }, { value: 'c', label: 'By moment' }];
  const track = COMMENTS.capsuleHeight - 2 * COMMENTS.capsulePad; // 34: the row the chips take in the 40 raise track
  it.each([false, true])('each chip (hug %s): minHeight 44, a negative margin that leaves 34 of layout; the pill (radius 17, light when chosen) is an inner Box', (hug) => {
    const r = mount(createElement(Capsule, { items, value: 'a', onChange: jest.fn(), hug }));
    const tabs = hostsOf(r, 'tab');
    expect(tabs).toHaveLength(3);
    tabs.forEach((t, i) => {
      expect(flat(t)['minHeight']).toBe(bars.circle);
      expect((flat(t)['minHeight'] as number) + 2 * (flat(t)['marginVertical'] as number)).toBe(track);
      const pill = pills(t);
      expect(pill).toHaveLength(1);
      expect(flat(pill[0]!)['borderRadius']).toBe(COMMENTS.capsuleItemRadius);
      expect(flat(pill[0]!)['borderRadius']).toBe(17);
      expect(String(pill[0]!.props['className']).includes('bg-text')).toBe(i === 0);
    });
  });
});

describe('036 D6 the Notifications tabs are 44 pt frames', () => {
  it('each tab: minHeight 44, margin -3 (38 of layout in the 44 track); the 38 pill (radius 19, light when chosen) is an inner Box', () => {
    const r = mount(createElement(NoticeCards, { section: 'people', unread: 3, interactionsUnread: 2, onSelect: () => undefined }));
    const tabs = hostsOf(r, 'tab');
    expect(tabs).toHaveLength(2);
    tabs.forEach((t, i) => {
      expect(flat(t)['minHeight']).toBe(bars.circle);
      expect((flat(t)['minHeight'] as number) + 2 * (flat(t)['marginVertical'] as number)).toBe(NOTICE.choiceHeight);
      const pill = pills(t);
      expect(pill).toHaveLength(1);
      expect(flat(pill[0]!)).toMatchObject({ height: NOTICE.choiceHeight, borderRadius: 19 });
      expect(String(pill[0]!.props['className']).includes('bg-text')).toBe(i === 0);
    });
  });
});
