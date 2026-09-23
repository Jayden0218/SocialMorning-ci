/** quickstart A10 (half): the component renders the table's sentence and one action; loading, offline and error variants. */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

import { EMPTY_STATES, GIVE_UP_AFTER_MS, LOADING_AFTER_MS, OFFLINE_SENTENCE, SURFACES } from '@socialmorning/social-core';
import { EmptyState } from '../src/ui/EmptyState';

const render = (props: Record<string, unknown>): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(EmptyState, props as never)); });
  return r;
};
const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

it('every one of the 13 surfaces renders its sentence and a tappable action that routes where the table says', () => {
  for (const s of SURFACES) {
    mockPush.mockClear();
    const r = render({ surface: s });
    expect(text(r)).toContain(EMPTY_STATES[s].sentence);
    const btn = r.root.find((n) => n.props['accessibilityLabel'] === EMPTY_STATES[s].action.label && typeof n.props['onPress'] === 'function');
    act(() => { btn.props['onPress'](); });
    expect(mockPush).toHaveBeenCalledWith(EMPTY_STATES[s].action.route);
  }
});

it('quiet under 1 s, a labelled spinner from 1 s, the offline sentence with Retry, and a caller action overrides the table', () => {
  expect(render({ surface: 'queue', loadingMs: 200 }).toJSON()).toBeNull();
  expect(render({ surface: 'queue', loadingMs: LOADING_AFTER_MS }).root.findByProps({ accessibilityLabel: 'Loading' })).toBeTruthy();
  const onRetry = jest.fn();
  const off = render({ surface: 'feed', offline: true, onRetry });
  expect(text(off)).toContain(OFFLINE_SENTENCE);
  act(() => { off.root.find((n) => n.props['accessibilityLabel'] === 'Retry' && typeof n.props['onPress'] === 'function').props['onPress'](); });
  expect(onRetry).toHaveBeenCalled();
  const err = render({ surface: 'feed', loadingMs: GIVE_UP_AFTER_MS });
  expect(text(err)).toContain("Couldn't load this");
  const onPress = jest.fn();
  const custom = render({ surface: 'comments', action: { label: 'Comment at 14:32', onPress } });
  act(() => { custom.root.find((n) => n.props['accessibilityLabel'] === 'Comment at 14:32' && typeof n.props['onPress'] === 'function').props['onPress'](); });
  expect(onPress).toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalledWith('/player');
});
