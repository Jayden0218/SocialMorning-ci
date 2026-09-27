/**
 * A loose wall of show covers above the sign-in choices (owner's reference, 2026-09-27).
 * The arrangement is ours; the covers are whatever `landingArt` found. The lower edge
 * fades into the page so the choices below sit on white.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
import { colour } from '../../design';

/** x, y and size as fractions of the screen width. Overlaps are on purpose. */
const SPOTS = [
  { x: -0.05, y: 0.08, s: 0.34 },
  { x: 0.4, y: 0.02, s: 0.24 },
  { x: 0.66, y: 0.1, s: 0.36 },
  { x: 0.26, y: 0.26, s: 0.3 },
  { x: 0.14, y: 0.52, s: 0.21 },
  { x: 0.64, y: 0.5, s: 0.22 },
  { x: -0.04, y: 0.74, s: 0.24 },
] as const;

/** The longest the page waits for covers before it shows without the slow ones. */
export const ART_WAIT_MS = 1500;

/**
 * `onReady` fires once, when every cover has loaded or failed (or after `ART_WAIT_MS`),
 * so the page can appear whole instead of cover by cover (owner, 2026-09-27).
 */
export function ArtWall(props: { urls: string[]; onReady?: () => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const height = width * 1.02;
  const settled = useRef(0);
  const fired = useRef(false);
  const ready = useRef(props.onReady);
  ready.current = props.onReady;
  const fire = (): void => { if (!fired.current) { fired.current = true; ready.current?.(); } };
  const one = (): void => { settled.current += 1; if (settled.current >= props.urls.length) fire(); };
  useEffect(() => {
    if (props.urls.length === 0) { fire(); return; }
    const t = setTimeout(fire, ART_WAIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.urls.length]);
  return (
    <View style={{ height }} className="overflow-hidden" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {props.urls.map((uri, i) => {
        const spot = SPOTS[i % SPOTS.length]!;
        const size = spot.s * width;
        return (
          <Image
            key={uri}
            source={{ uri }}
            onLoadEnd={one}
            className="absolute rounded-row bg-surface"
            style={{ left: spot.x * width, top: spot.y * width, width: size, height: size }}
          />
        );
      })}
      <LinearGradient colors={[colour.clear, colour.background]} className="absolute left-0 right-0 bottom-0" style={{ height: height * 0.35 }} />
    </View>
  );
}
