/**
 * The sign-in landing page appears whole (owner, 2026-09-27): `onReady` waits for every
 * cover, fires once, and never waits past ART_WAIT_MS. Break that turns the first test
 * red: fire `onReady` on the first `onLoadEnd` instead of the last.
 */
import { createElement } from 'react';
import { Image } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ART_WAIT_MS, ArtWall } from '../src/ui/auth/ArtWall';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
// M10b US4: the component reads its palette through useStores(); pin it to light so the
// colour assertions compare against `colour`, whatever the runner's system scheme is.
jest.mock('../src/ui/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };

it('waits for every cover, then fires once', () => {
  const onReady = jest.fn();
  const r = render(createElement(ArtWall, { urls: ['a', 'b', 'c'], onReady }));
  const images = r.root.findAllByType(Image);
  expect(images).toHaveLength(3);
  act(() => { images[0]!.props['onLoadEnd'](); images[1]!.props['onLoadEnd'](); });
  expect(onReady).not.toHaveBeenCalled();
  act(() => { images[2]!.props['onLoadEnd'](); });
  expect(onReady).toHaveBeenCalledTimes(1);
});

it('with no covers it is ready at once; a slow cover is not waited for past the limit', () => {
  jest.useFakeTimers();
  const none = jest.fn();
  render(createElement(ArtWall, { urls: [], onReady: none }));
  expect(none).toHaveBeenCalledTimes(1);
  const slow = jest.fn();
  render(createElement(ArtWall, { urls: ['a'], onReady: slow }));
  expect(slow).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(ART_WAIT_MS); });
  expect(slow).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
