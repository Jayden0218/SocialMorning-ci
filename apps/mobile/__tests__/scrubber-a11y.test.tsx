/** quickstart A10 / guard G11: the scrubber is operable without sight — a spoken value and ±30/−15 actions. */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SCRUB_BACK_MS, SCRUB_FORWARD_MS, Scrubber, scrubberValue } from '../src/ui/Scrubber';
import { heatLabel, heatMessage } from '../src/ui/HeatCurve';
import { EMPTY_STATES } from '@socialmorning/social-core';

it('the bar fills its row: without an explicit width it collapses in the player\'s centred column (found on the phone)', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Scrubber, { positionMs: 0, durationMs: 1000, onSeek: () => undefined, onSkip: () => undefined })); });
  const bar = r.root.find((n) => n.props['accessibilityRole'] === 'adjustable');
  const style = (StyleSheet.flatten(bar.props['style']) ?? {}) as Record<string, unknown>;
  expect(style['width']).toBe('100%');
  expect(Number(style['height'])).toBeGreaterThan(0);
  expect(bar.props['accessible']).toBe(true);
});

it('scrubberValue speaks the position and the length, and says so when the length is unknown', () => {
  expect(scrubberValue(872_000, 2_057_000)).toEqual({ min: 0, max: 2_057_000, now: 872_000, text: '14:32 of 34:17' });
  expect(scrubberValue(1_000, undefined).text).toBe('0:01, length unknown');
  expect(scrubberValue(9_000, 5_000).now).toBe(5_000);
});

it('G11: the bar is adjustable, carries the value, and increment / decrement skip +30 / −15', () => {
  const onSkip = jest.fn();
  const onSeek = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Scrubber, { positionMs: 872_000, durationMs: 2_057_000, onSeek, onSkip })); });
  const bar = r.root.find((n) => n.props['accessibilityRole'] === 'adjustable');
  expect(bar.props['accessibilityLabel']).toBe('Seek');
  expect(bar.props['accessibilityValue']).toEqual({ min: 0, max: 2_057_000, now: 872_000, text: '14:32 of 34:17' });
  expect(bar.props['accessibilityActions'].map((a: { name: string }) => a.name)).toEqual(['increment', 'decrement']);
  act(() => { bar.props['onAccessibilityAction']({ nativeEvent: { actionName: 'increment' } }); });
  act(() => { bar.props['onAccessibilityAction']({ nativeEvent: { actionName: 'decrement' } }); });
  expect(onSkip.mock.calls).toEqual([[SCRUB_FORWARD_MS], [-SCRUB_BACK_MS]]);
  act(() => { bar.props['onLayout']({ nativeEvent: { layout: { width: 200 } } }); });
  act(() => { bar.props['onPress']({ nativeEvent: { locationX: 100 } }); });
  expect(onSeek).toHaveBeenCalledWith(1_028_500);
});

it('FR-024: the heat curve announces its loudest moment, or the empty sentence with the action in it', () => {
  const buckets = new Array<number>(100).fill(0);
  buckets[43] = 1;
  expect(heatLabel({ available: true, buckets }, 2_057_000)).toBe('Reaction curve. Most reactions at 14:44.');
  expect(heatLabel({ available: true, buckets }, undefined)).toBe('Reaction curve. Most reactions at segment 44 of 100.');
  expect(heatLabel({ available: true, buckets: new Array<number>(100).fill(0) }, 1000)).toBe(EMPTY_STATES.heat.sentence);
  expect(heatMessage({ available: false })).toBe("Heat isn't available yet for this episode");
  expect(heatLabel({ available: false }, 1000)).toBe("Heat isn't available yet for this episode");
});
