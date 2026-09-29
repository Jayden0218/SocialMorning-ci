/**
 * M12 guard G-P2 (FR-064): a profile's numbers sit in one row and the listening time is one
 * of them — "—" when private, never a made-up 0. The break: drop the time cell's value.
 */
jest.mock('../src/design/tailwind', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ProfileStatRow, listenedLabel } from '../src/ui/ProfileStatRow';

it('listening time reads as hours, minutes, or private', () => {
  expect(listenedLabel(3 * 3_600_000 + 10)).toEqual({ value: '3 h', spoken: '3 hours listened' });
  expect(listenedLabel(45 * 60_000)).toEqual({ value: '45 min', spoken: '45 minutes listened' });
  expect(listenedLabel(undefined).value).toBe('—');
});

it('four cells in one row, each named', () => {
  let r!: ReactTestRenderer;
  const time = listenedLabel(7_200_000);
  act(() => { r = create(createElement(ProfileStatRow, { cells: [
    { key: 'a', value: '3', label: 'Following', spoken: '3 following', href: '/x' },
    { key: 'b', value: '5', label: 'Followers', spoken: '5 followers' },
    { key: 'c', value: '9', label: 'Subscriptions', spoken: '9 subscriptions' },
    { key: 'd', value: time.value, label: 'Listened', spoken: time.spoken },
  ] })); });
  const json = JSON.stringify(r.toJSON());
  for (const t of ['"3"', '"5"', '"9"', '"2 h"', 'Listened']) expect(json).toContain(t);
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === '2 hours listened').length).toBeGreaterThan(0);
});
