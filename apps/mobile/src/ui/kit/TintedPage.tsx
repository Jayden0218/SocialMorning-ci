// A paper page that fades to the cover's tint once it is known, never through a dark colour.
/**
 * M21 US4/US5 (FR-030): the episode and show pages take a light tint from the cover. The page
 * starts as paper (`bg-background`) and a layer of the tint fades in over it — opacity only,
 * so there is never a flash of another colour. `tint` must already be a readable page colour
 * (`tintFor` in `src/design/gradient.ts`); the paper itself means no layer at all.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { colour } from '@/design';
import { Box } from '@/ui/lib/box';

export const TINT_FADE_MS = 400;

export function TintedPage(props: { tint: string; children: React.ReactNode }): React.ReactElement {
  const fade = useRef(new Animated.Value(0)).current;
  const plain = props.tint === colour.background;
  useEffect(() => {
    if (plain) { fade.setValue(0); return; }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: TINT_FADE_MS, useNativeDriver: true }).start();
  }, [fade, plain, props.tint]);
  return (
    <Box className="flex-1 bg-background">
      {plain ? null : (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: props.tint, opacity: fade }]} testID="page-tint" />
      )}
      {props.children}
    </Box>
  );
}
