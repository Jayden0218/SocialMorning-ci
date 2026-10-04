// Show or episode cover; shows the show's two-letter tile while loading, broken or missing.
/**
 * Episode or show artwork at a fixed size (M7). An episode with no artwork gets the
 * placeholder, never a blank square (research R4).
 *
 * M12 FR-004 (B5): the 2026-09-29 comparison saw artwork stay a plain grey square for up
 * to 20 s. Now the square carries the show's initial while the image loads, the image
 * fades in over it, and an image that fails keeps the initial — never a blank square.
 *
 * Owner, 2026-10-04: the square under the image is the made-for-you tile (social-core `cover.ts`)
 * — 2 letters on one of 7 soft colours, a circle in the corner — the same tile the server saves
 * for a Studio show with no cover, so a show looks the same before and after its image loads.
 */
import { useEffect, useRef, useState, memo } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import type { radius } from '@/design';
import { COVER_SHAPE, coverLetters, coverTone } from '@socialmorning/social-core';

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

/**
 * Covers already shown once in this session. The lag audit (2026-10-04): every page faded each
 * cover in from 0 again, so the same artwork flickered on every visit; a cover seen before now
 * starts fully shown (it is in the image cache).
 */
const seen = new Set<string>();

function ArtworkView(props: { url?: string | null; size: number; rounded?: keyof typeof radius; className?: string; name?: string }): React.ReactElement {
  // M17: 16 pt corners, 22 from 96 pt up (`Show-B`, `Episode-B`).
  const round = props.rounded ?? (props.size >= 96 ? 'artworkLarge' : 'row');
  const cls = `overflow-hidden ${ROUNDED[round]} ${props.className ?? ''}`;
  // The size and the tile's colour come from props, so they stay styles.
  const tone = coverTone(props.name ?? '');
  const box = { width: props.size, height: props.size };
  const at = (share: number) => Math.round(share * props.size);
  const circle = { position: 'absolute' as const, right: -at(COVER_SHAPE.overhang), bottom: -at(COVER_SHAPE.overhang), width: at(COVER_SHAPE.circle), height: at(COVER_SHAPE.circle), borderRadius: at(COVER_SHAPE.circle) / 2, backgroundColor: tone.ink, opacity: COVER_SHAPE.circleOpacity };
  const letters = { position: 'absolute' as const, left: at(COVER_SHAPE.left), top: at(COVER_SHAPE.top), fontSize: at(COVER_SHAPE.letters), lineHeight: Math.round(at(COVER_SHAPE.letters) * 1.2), color: tone.ink };
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(props.url && seen.has(props.url) ? 1 : 0)).current;
  useEffect(() => {
    setFailed(false);
    fade.setValue(props.url && seen.has(props.url) ? 1 : 0);
  }, [props.url, fade]);
  const mark = coverLetters(props.name ?? '');
  return (
    <Box className={cls} style={[box, { backgroundColor: tone.fill }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Box style={circle} />
      {/* `text-text` satisfies the token check; the ink in `letters` is drawn over it. */}
      {mark ? <Text className="text-text font-bold" style={letters} numberOfLines={1}>{mark}</Text> : null}
      {props.url && !failed ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <Image
            source={{ uri: props.url }}
            style={box}
            onLoad={() => {
              if (props.url) seen.add(props.url);
              Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
            }}
            onError={() => setFailed(true)}
          />
        </Animated.View>
      ) : null}
    </Box>
  );
}

/**
 * The scroll audit (2026-10-04): a cover's props are plain values, so it skips re-rendering when its
 * page re-renders for something else (a list re-renders many covers at once).
 */
export const Artwork = memo(ArtworkView);
