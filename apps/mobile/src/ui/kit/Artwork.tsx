// Show or episode cover; shows the show's first letter while loading or broken.
/**
 * Episode or show artwork at a fixed size (M7). An episode with no artwork gets the
 * placeholder, never a blank square (research R4).
 *
 * M12 FR-004 (B5): the 2026-09-29 comparison saw artwork stay a plain grey square for up
 * to 20 s. Now the square carries the show's initial while the image loads, the image
 * fades in over it, and an image that fails keeps the initial — never a blank square.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import type { radius } from '@/design';

/** Whole class names, so Tailwind can find each one written out. */
const ROUNDED: Record<keyof typeof radius, string> = {
  row: 'rounded-row',
  artwork: 'rounded-artwork',
  artworkLarge: 'rounded-artwork-lg',
  pill: 'rounded-pill',
};

/** The placeholder's letter: the first letter or digit of the show's name. */
export function initialOf(name?: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name ?? '');
  return m ? m[0].toUpperCase() : '';
}

export function Artwork(props: { url?: string | null; size: number; rounded?: keyof typeof radius; className?: string; name?: string }): React.ReactElement {
  // M17: 16 pt corners, 22 from 96 pt up (`Show-B`, `Episode-B`); the placeholder is the accent tint.
  const round = props.rounded ?? (props.size >= 96 ? 'artworkLarge' : 'row');
  const cls = `bg-accentTint overflow-hidden items-center justify-center ${ROUNDED[round]} ${props.className ?? ''}`;
  // The size is a prop, so it stays a style.
  const box = { width: props.size, height: props.size };
  const letter = { fontSize: Math.round(props.size * 0.4) };
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setFailed(false);
    fade.setValue(0);
  }, [props.url, fade]);
  const initial = initialOf(props.name);
  return (
    <Box className={cls} style={box} accessible={false} importantForAccessibility="no-hide-descendants">
      {initial ? <Text className="text-muted font-bold" style={letter}>{initial}</Text> : null}
      {props.url && !failed ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Image
            source={{ uri: props.url }}
            style={box}
            onLoad={() => Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start()}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      ) : null}
    </Box>
  );
}
