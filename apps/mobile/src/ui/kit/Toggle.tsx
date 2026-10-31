// The app's own on/off switch.
/**
 * M16a T004 (FR-014, owner 2026-10-02): the app's own on/off switch. The lib `Switch` wraps
 * React Native's `Switch`, which on iOS is the system UISwitch — native chrome the owner asked
 * twice to remove. This one is drawn from views and tokens.
 *
 * M31 T022 (design-pulse2 `kit.css` `.toggle`): a 46 × 28 pill. Off → the #2e2e36 track
 * (`switchOff`) with a 22 text2 thumb 3 from the left; on → the hot track with a 22 void thumb
 * 3 from the right (6.30 against the track). The track is decorative at 1.50 on the page (as the
 * old switch was) — the thumb's side, the label and `accessibilityState.checked` carry the state.
 *
 * Still a switch to a screen reader: role "switch" with `accessibilityState.checked` (guard
 * G-N2), the label the caller gives, and a 48 pt target around the track. The slide is 120 ms
 * (motion.tap), and instant when Reduce Motion is on.
 */
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit, motion } from '@/design';
import { useReducedMotion } from './useReducedMotion';

/** Owner, 2026-10-04: a `small` switch (32 × 18) for tight rows, e.g. a category's filter. The regular one is the Pulse 46 × 28. */
const SIZES = {
  regular: { track: { width: 46, height: 28 }, thumb: 22 },
  small: { track: { width: 32, height: 18 }, thumb: 14 },
} as const;
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** Owner, 2026-10-04 ("no padding" under All / Newest): the small switch takes no room beyond
 *  its track; hitSlop stretches the tap to 48 × 48 instead. */
const SLOP_SMALL = { top: 15, bottom: 15, left: 8, right: 8 };

export function Toggle(props: {
  value: boolean;
  onChange: (next: boolean) => void;
  /** What the switch turns on or off — spoken with its state. */
  label: string;
  disabled?: boolean;
  /** `small`: 32 × 18 instead of 46 × 28. The tap area stays 48 pt either way (hitSlop on `small`). */
  size?: keyof typeof SIZES;
}): React.ReactElement {
  const { track: TRACK, thumb: THUMB } = SIZES[props.size ?? 'regular'];
  // The thumb sits 3 from each edge on the regular switch (2 on the small one).
  const RIM = props.size === 'small' ? 2 : 3;
  const TRAVEL = TRACK.width - THUMB - RIM * 2;
  const [at] = useState(() => new Animated.Value(props.value ? 1 : 0));
  const still = useReducedMotion();
  useEffect(() => {
    const to = props.value ? 1 : 0;
    if (still) { at.setValue(to); return; }
    Animated.timing(at, { toValue: to, duration: motion.tap, useNativeDriver: true }).start();
  }, [props.value, still, at]);
  const disabled = props.disabled === true;
  return (
    <Pressable
      onPress={() => { if (!disabled) props.onChange(!props.value); }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.value, disabled }}
      className={`items-center justify-center ${disabled ? 'opacity-40' : ''}`}
      {...(props.size === 'small' ? { hitSlop: SLOP_SMALL } : { style: TAP })}
    >
      <Box className={`rounded-pill justify-center ${props.value ? 'bg-hot' : 'bg-switchOff'}`} style={TRACK}>
        <Animated.View
          className={`rounded-pill ${props.value ? 'bg-void' : 'bg-text2'}`}
          style={{ width: THUMB, height: THUMB, marginLeft: RIM, transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }}
        />
      </Box>
    </Pressable>
  );
}
