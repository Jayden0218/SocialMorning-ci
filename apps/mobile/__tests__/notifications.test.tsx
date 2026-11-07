// Tests that the Notifications page cards work as tabs and announce selection.
/**
 * M12 guard G-B2 (B2, found on the iPhone 2026-09-29): Notifications' cards were plain boxes —
 * tapping them did nothing. Each tab now selects what the page lists, and says so to a screen
 * reader. M21 US10: the tabs are Interactions and People; System and From hosts are cards that
 * open their own pages (`NoticeEntries`).
 *
 * The break that turns it red: drop `onPress` from the Pressable in `Tab` (or `Entry`) in
 * src/ui/social/NoticeCards.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { NoticeCards, NoticeEntries } from '@/ui/social/NoticeCards';

const byRole = (r: ReactTestRenderer, role: string) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === role);
/** The pressable that owns the card's onPress (the host view underneath does not carry it). */
const press = (r: ReactTestRenderer, title: string) => {
  const owner = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel'] ?? '').startsWith(`${title}.`))[0];
  expect(owner).toBeDefined();
  act(() => { owner!.props['onPress'](); });
};

it('each tab selects its list, and the selected one is announced as selected', () => {
  const onSelect = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(NoticeCards, { section: 'people', unread: 3, interactionsUnread: 2, iconColour: '#111114', onSelect })); });
  // M24 US20 (`Notifications-B`): People is the first pill.
  const [people, interactions] = byRole(r, 'tab');
  expect(interactions!.props['accessibilityLabel']).toMatch(/^Interactions\. 2 new\./);
  expect(people!.props['accessibilityLabel']).toMatch(/^People\. 3 new\./);
  expect(people!.props['accessibilityState']).toEqual({ selected: true });
  expect(interactions!.props['accessibilityState']).toEqual({ selected: false });
  press(r, 'Interactions');
  expect(onSelect).toHaveBeenCalledWith('interactions');
  press(r, 'People');
  expect(onSelect).toHaveBeenLastCalledWith('people');
});

it('System and From hosts are links that open their own pages', () => {
  const onOpen = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(NoticeEntries, { iconColour: '#111114', onOpen })); });
  const links = byRole(r, 'link');
  expect([...new Set(links.map((l) => String(l.props['accessibilityLabel']).split('.')[0]))]).toEqual(['System', 'From hosts']);
  press(r, 'System');
  expect(onOpen).toHaveBeenCalledWith('system');
  press(r, 'From hosts');
  expect(onOpen).toHaveBeenLastCalledWith('hosts');
});
