// A person's round picture: their photo, or their letters when there is none.
/**
 * M19 T014 (US1, FR-001–FR-005): one avatar for every place a person is drawn. With a photo
 * (`url`, from the server's `avatarUrl`) it is the photo in a circle, drawn over the letter while
 * it loads; the letter stays when it fails.
 *
 * M24 US18 (design-social cause 1, `Profile-B`, `Followers-B`): a person is a flat circle with ONE
 * centred letter, heavy, on their own soft colour — not the show-cover tile (2 letters top-left and
 * a corner circle). The colours are the cover tile's seven fills (`coverTone`), the same ones the
 * designs use (#e8d5b0, #c9d8c5, #c7d3e3, #d9cfe6…), picked from the name so a person keeps theirs.
 *
 * v4.0.0 (Pulse, dark only; L5): the fills were the seven LIGHT pastels with the void letter. F2a: they are now the drawings'
 * saturated discs (`AVATAR_TONES`), each with the letter colour that measures ≥ 4.5 on it (avatar-contrast.test.ts).
 *
 * Decoration only: the row it sits in says who it is, so it adds nothing for a screen reader.
 */
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Text } from '@/ui/kit/Text';
import { coverToneIndex } from '@socialmorning/social-core';
import { colour } from '@/design';
import { initialOf } from './Artwork';

/**
 * M31 F2a (design-pulse2 `av('R','#FF4D6D')`, `av('A','#7A3CFF')`, `av('J','#22C55E')`, `av('K','#F59E0B')`): a person's disc is one of
 * the drawings' saturated colours, picked from the name so a person keeps theirs. The drawing sets every letter white; on hot, green,
 * amber and blue that reads 3.2–3.6:1, so those four take the void letter (6.3–8.4) and only violet keeps the light one (5.3) — AA either
 * way (avatar-contrast.test.ts). The two class names are written out in full so the colour check reads them.
 */
export const AVATAR_TONES = [
  { fill: colour.hot, ink: 'void' },
  { fill: colour.violet, ink: 'text' },
  { fill: colour.pinGreen, ink: 'void' },
  { fill: colour.pinAmber, ink: 'void' },
  { fill: colour.pinBlue, ink: 'void' },
] as const;

/** Wave 5b: THE avatar colour rule. A person's disc (fill) and letter colour (ink), picked from the name so a person keeps theirs, in every place. */
export function avatarTone(name?: string | null): (typeof AVATAR_TONES)[number] {
  return AVATAR_TONES[coverToneIndex(name ?? '') % AVATAR_TONES.length]!;
}

/** `Followers-B` 56 → 26 pt letter, `Profile-B` 96 → 46: about 0.47 of the circle. */
const LETTER_SHARE = 0.47;

export function Avatar(props: {
  /** The photo, if the person set one. */
  url?: string | null;
  /** The person's name: its first letter and its colour make the circle when there is no photo. */
  name?: string | null;
  size: number;
  className?: string;
}): React.ReactElement {
  const { url, size } = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const box = { width: size, height: size };
  const name = props.name ?? '';
  const tone = avatarTone(name);
  const letter = { fontSize: Math.max(10, Math.round(size * LETTER_SHARE)), lineHeight: Math.round(size * LETTER_SHARE * 1.2) };
  return (
    <Box className={`rounded-pill overflow-hidden items-center justify-center ${props.className ?? ''}`} style={[box, { backgroundColor: tone.fill }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text className={tone.ink === 'text' ? 'text-text font-extrabold' : 'text-onPrimary font-extrabold'} style={letter} numberOfLines={1}>{initialOf(name)}</Text>
      {url && !failed ? <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, box]} onError={() => setFailed(true)} /> : null}
    </Box>
  );
}
