// Tests that the Notifications page cards work as tabs and announce selection.
/**
 * M12 guard G-B2 (B2, found on the iPhone 2026-09-29): Notifications' System and People
 * cards were plain boxes — tapping them did nothing. Each is now a tab that selects what the
 * page lists, and says so to a screen reader.
 *
 * The break that turns it red: drop `onPress` from the Card in src/ui/social/NoticeCards.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { NoticeCards } from '@/ui/social/NoticeCards';

const tabs = (r: ReactTestRenderer) => r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'tab');
/** The pressable that owns the card's onPress (the host view underneath does not carry it). */
const press = (r: ReactTestRenderer, title: string) => {
  const owner = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel'] ?? '').startsWith(`${title}.`))[0];
  expect(owner).toBeDefined();
  act(() => { owner!.props['onPress'](); });
};

it('each card selects its list, and the selected one is announced as selected', () => {
  const onSelect = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(NoticeCards, { section: 'people', unread: 3, iconColour: '#111114', onSelect })); });
  const [system, people] = tabs(r);
  expect(system!.props['accessibilityLabel']).toMatch(/^System\./);
  expect(people!.props['accessibilityLabel']).toMatch(/^People\. 3 new\./);
  expect(people!.props['accessibilityState']).toEqual({ selected: true });
  expect(system!.props['accessibilityState']).toEqual({ selected: false });
  press(r, 'System');
  expect(onSelect).toHaveBeenCalledWith('system');
  press(r, 'People');
  expect(onSelect).toHaveBeenLastCalledWith('people');
});
