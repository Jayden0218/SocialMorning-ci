/**
 * The seek bar (M1), made operable without sight in M6 (FR-023, research R4):
 * `adjustable` with a value a screen reader speaks ("14:32 of 34:17") and increment /
 * decrement actions that are the same ±15 / +30 a sighted listener taps. Guard G11.
 */
import { useState } from 'react';
import { Box } from './lib/box';
import { Slider, SliderFilledTrack, SliderThumb, SliderTrack } from './lib/slider';
import { useStores } from './providers';
import { useColours } from './useColours';
import { mmss } from './format';

/** The slider runs in thousandths of the episode, so a drag has 1000 steps at any length. */
const STEPS = 1000;

export const SCRUB_FORWARD_MS = 30_000;
export const SCRUB_BACK_MS = 15_000;

/** What the screen reader says for the bar. */
export function scrubberValue(positionMs: number, durationMs: number | undefined): { min: number; max: number; now: number; text: string } {
  const max = durationMs ?? 0;
  return { min: 0, max, now: Math.min(positionMs, max), text: durationMs === undefined ? `${mmss(positionMs)}, length unknown` : `${mmss(positionMs)} of ${mmss(durationMs)}` };
}

export function Scrubber(props: {
  positionMs: number;
  durationMs: number | undefined;
  onSeek: (toMs: number) => void;
  /** The same ±15 / +30 the buttons use; the player's `skip` takes that exact union. */
  onSkip: (deltaMs: 30_000 | -15_000) => void;
}): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  // While a finger drags, the bar follows the finger; the seek happens once, on release.
  const [drag, setDrag] = useState<number | undefined>();
  const fraction = props.durationMs === undefined || props.durationMs === 0 ? 0 : props.positionMs / props.durationMs;
  const value = drag ?? Math.round(Math.min(1, Math.max(0, fraction)) * STEPS);
  return (
    // M9: gluestack's Slider does the touch (tap or drag). This wrapper stays the ONE
    // accessible element: `adjustable`, named "Seek", the spoken value and the ±15 / +30
    // actions — the library thumb's own role is hidden beneath it, so a screen reader meets
    // one control, not two. `width: '100%'` is load-bearing: the player centres its column,
    // so a bar without an explicit width collapses to nothing (found on the phone, J5 on
    // build 16 — invisible AND absent from the accessibility tree). Width, height and colour
    // stay in `style`: two tests read them off this element's own props.
    <Box
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={scrubberValue(props.positionMs, props.durationMs)}
      accessibilityActions={[{ name: 'increment', label: 'Forward 30 seconds' }, { name: 'decrement', label: 'Back 15 seconds' }]}
      onAccessibilityAction={(e) => props.onSkip(e.nativeEvent.actionName === 'increment' ? 30_000 : -15_000)}
      className="rounded-sm mt-2 justify-center"
      style={{ width: '100%', height: 8, backgroundColor: c.track }}
    >
      <Box importantForAccessibility="no-hide-descendants" accessibilityElementsHidden className="w-full h-full justify-center">
        <Slider
          value={value}
          minValue={0}
          maxValue={STEPS}
          step={1}
          // Hidden beneath the wrapper, but named the same in case a reader reaches it.
          accessibilityLabel="Seek"
          isDisabled={props.durationMs === undefined}
          onChange={(v: number) => setDrag(v)}
          onChangeEnd={(v: number) => {
            setDrag(undefined);
            if (props.durationMs !== undefined) props.onSeek(Math.round((v / STEPS) * props.durationMs));
          }}
          className="w-full h-full"
        >
          <SliderTrack className="h-full bg-transparent rounded-sm">
            <SliderFilledTrack className="bg-text" />
          </SliderTrack>
          <SliderThumb className="bg-text h-4 w-4" />
        </Slider>
      </Box>
    </Box>
  );
}
