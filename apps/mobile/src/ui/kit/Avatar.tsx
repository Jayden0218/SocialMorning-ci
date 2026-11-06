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
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Text } from '@/ui/kit/Text';
import { coverToneIndex } from '@socialmorning/social-core';
import { colour } from '@/design';
import { initialOf } from './Artwork';

/**
 * 039 T025 (row M, `design/M-Palette.dc.html`): every disc is one neutral (`line`, #2C313A) with the `text` letter (14:1 and up); the per-name pick
 * stays as a one-entry list so `avatarTone(name)` keeps its shape for its callers.
 * Before 039 (M31 F2a): a person's disc was one of five saturated colours picked from the name, with a void or a light letter by contrast. Row M
 * dropped them: one neutral disc, so the colour says nothing about who a person is and the letter always reads (avatar-contrast.test.ts). The
 * class names are written out in full so the colour check reads them.
 */
export const AVATAR_TONES = [{ fill: colour.line, ink: 'text' }] as const;

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
  // The address that failed to load: a new address is tried afresh.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = url != null && failedUrl === url;
  const box = { width: size, height: size };
  const name = props.name ?? '';
  const tone = avatarTone(name);
  const letter = { fontSize: Math.max(10, Math.round(size * LETTER_SHARE)), lineHeight: Math.round(size * LETTER_SHARE * 1.2) };
  return (
    <Box className={`rounded-pill overflow-hidden items-center justify-center ${props.className ?? ''}`} style={[box, { backgroundColor: tone.fill }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text className={tone.ink === 'text' ? 'text-text font-extrabold' : 'text-onPrimary font-extrabold'} style={letter} numberOfLines={1}>{initialOf(name)}</Text>
      {url && !failed ? <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, box]} onError={() => setFailedUrl(url ?? null)} /> : null}
    </Box>
  );
}
