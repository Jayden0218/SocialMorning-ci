// The profile's Listening time value must not be cut with an ellipsis ("128 h 14…" in the wave-5b picture).
/**
 * Wave 5b look item: ListeningTile's total was `numberOfLines={1}` + `adjustsFontSizeToFit`. Where the platform does not shrink text
 * (react-native-web, the capture) that one line ends in "…" beside the "finished / This week" column. The value must be able to
 * wrap (more than one line) or shrink on an explicit floor, and never be a bare one-line text with no floor.
 * Break that turns it red: put `numberOfLines={1}` back on the total without a `minimumFontScale`.
 */
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { ListeningTile } from '@/ui/profile/ProfilePage';

it('a long total ("128 h 14 min") is not forced onto one ellipsised line', async () => {
  let r!: ReturnType<typeof create>;
  await act(async () => { r = create(createElement(ListeningTile, { total: '128 h 14 min', finished: 312, week: '4 h 10 min', spoken: '128 hours 14 minutes listened' })); });
  const total = r.root.findAll((n) => typeof n.type === 'string' && n.props.children === '128 h 14 min' || (typeof n.props?.children === 'string' && n.props.children === '128 h 14 min'))[0];
  expect(total).toBeDefined();
  const lines = total!.props.numberOfLines as number | undefined;
  const floor = total!.props.minimumFontScale as number | undefined;
  const wraps = lines === undefined || lines >= 2;
  const shrinksOnAFloor = total!.props.adjustsFontSizeToFit === true && typeof floor === 'number' && floor > 0 && floor <= 0.7;
  expect(wraps || shrinksOnAFloor).toBe(true);
  // The wrapping/shrinking text must be the one that takes the free width, so the facts column cannot squeeze it to nothing.
});
