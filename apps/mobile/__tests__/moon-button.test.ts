// Tests what the player's moon button says and speaks for each sleep timer state.
import { moonA11y, moonLabel } from '@/ui/player/MoonButton';

it('M21 FR-001: "Sleep" when off, the time left while a deadline runs, "End" for End of episode alone', () => {
  expect(moonLabel({ endOfEpisode: false }, undefined)).toBe('Sleep');
  expect(moonLabel({ deadline: 1, minutes: 5, endOfEpisode: false }, 299_000)).toBe('4:59');
  expect(moonLabel({ endOfEpisode: true }, undefined)).toBe('End');
});

it('the spoken name says what is armed, not only a number', () => {
  expect(moonA11y({ endOfEpisode: false }, undefined)).toBe('Sleep timer, off');
  expect(moonA11y({ deadline: 1, endOfEpisode: true }, 61_000)).toBe('Sleep timer, pausing in 1:01');
  expect(moonA11y({ endOfEpisode: true }, undefined)).toBe('Sleep timer, stops at the end of this episode');
});
