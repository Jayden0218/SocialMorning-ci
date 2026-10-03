/**
 * M16a T004 (FR-014, owner 2026-10-02): the app's own on/off switch. The lib `Switch` wraps
 * React Native's `Switch`, which on iOS is the system UISwitch — native chrome the owner asked
 * twice to remove. This one is drawn from views and tokens: a pill track (`bg-primary` on,
 * `bg-separator` off) and a round `bg-background` thumb that slides across.
 *
 * Still a switch to a screen reader: role "switch" with `accessibilityState.checked` (guard
 * G-N2), the label the caller gives, and a 48 pt target around the 52 × 32 track. The slide is
 * 150 ms, and instant when Reduce Motion is on.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { Pressable } from './lib/pressable';
import { Box } from './lib/box';
import { hit } from '../design';

const TRACK = { width: 52, height: 32 };
const THUMB = 28;
/** How far the thumb travels: the track, less the thumb and a 2 pt rim each side. */
const TRAVEL = TRACK.width - THUMB - 4;
const TAP = { minHeight: hit.min, minWidth: hit.min };

export function Toggle(props: {
  value: boolean;
  onChange: (next: boolean) => void;
  /** What the switch turns on or off — spoken with its state. */
  label: string;
  disabled?: boolean;
}): React.ReactElement {
  const at = useRef(new Animated.Value(props.value ? 1 : 0)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setStill(v); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const to = props.value ? 1 : 0;
    if (still) { at.setValue(to); return; }
    Animated.timing(at, { toValue: to, duration: 150, useNativeDriver: true }).start();
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
      style={TAP}
    >
      <Box className={`rounded-pill justify-center ${props.value ? 'bg-primary' : 'bg-separator'}`} style={TRACK}>
        <Animated.View
          className="rounded-pill bg-background"
          style={{ width: THUMB, height: THUMB, marginLeft: 2, transform: [{ translateX: at.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }}
        />
      </Box>
    </Pressable>
  );
}
