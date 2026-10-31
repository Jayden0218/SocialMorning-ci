// Says whether the phone's Reduce Motion setting is on — the one place the kit asks.
/**
 * M31 T022 (design-pulse §System, "Reduce Motion: no rise, no breathe, fades only; the feed snaps
 * without parallax"). Every kit part that moves — the tab dot, the now bar, the title bar, a sheet,
 * the breathing buffering ring — reads this one hook instead of calling `AccessibilityInfo` itself,
 * so the rule is the same everywhere and a test can switch it in one spot (`setReducedMotionForTest`).
 *
 * The first render uses the last answer (false until the phone has answered), then the answer
 * arrives and the `reduceMotionChanged` event keeps it current.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let last = false;
let forced: boolean | undefined;

/** For tests: pin the answer (`undefined` releases it). */
export function setReducedMotionForTest(on: boolean | undefined): void {
  forced = on;
}

export function useReducedMotion(): boolean {
  const [on, setOn] = useState(last);
  const now = useRef(on);
  useEffect(() => {
    let live = true;
    // Only a changed answer re-renders: the usual one (unchanged) costs nothing and starts no update.
    const set = (v: boolean) => { last = v; if (live && v !== now.current) { now.current = v; setOn(v); } };
    void AccessibilityInfo.isReduceMotionEnabled().then(set).catch(() => undefined);
    let sub: { remove?: () => void } | undefined;
    try {
      sub = AccessibilityInfo.addEventListener('reduceMotionChanged', set);
    } catch { /* a test renderer without the event */ }
    return () => { live = false; sub?.remove?.(); };
  }, []);
  return forced ?? on;
}
