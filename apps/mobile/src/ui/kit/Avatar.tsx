// A person's round picture: their photo, or one letter on a soft colour when there is none.
/**
 * M19 T014 (US1, FR-001–FR-005): one avatar for every place a person is drawn. With a photo
 * (`url`, from the server's `avatarUrl`) it is the photo in a circle, drawn over the letter while
 * it loads; the letter stays when it fails. When `initials` is given and there is no photo it is
 * the small yellow-tint disc with those letters (comments).
 *
 * M24 US18 (design-social cause 1, `Profile-B`, `Followers-B`): a person is a flat circle with ONE
 * centred letter, heavy, on their own soft colour — not the show-cover tile (2 letters top-left and
 * a corner circle). The colours are the cover tile's seven fills (`coverTone`), the same ones the
 * designs use (#e8d5b0, #c9d8c5, #c7d3e3, #d9cfe6…), picked from the name so a person keeps theirs.
 *
 * Decoration only: the row it sits in says who it is, so it adds nothing for a screen reader.
 */
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Text } from '@/ui/lib/text';
import { coverTone } from '@socialmorning/social-core';
import { initialOf } from './Artwork';

/** `Followers-B` 56 → 26 pt letter, `Profile-B` 96 → 46: about 0.47 of the circle. */
const LETTER_SHARE = 0.47;

export function Avatar(props: {
  /** The photo, if the person set one. */
  url?: string | null;
  /** The person's name: its first letter and its colour make the circle when there is no photo. */
  name?: string | null;
  size: number;
  /** Draw the plain disc with these letters instead of the coloured circle (comments). */
  initials?: string;
  className?: string;
}): React.ReactElement {
  const { url, size } = props;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  const box = { width: size, height: size };
  if (props.initials !== undefined && !url) {
    const letters = { fontSize: Math.max(10, Math.round(size * 0.34)) };
    return (
      <Box className={`rounded-pill bg-accentTint items-center justify-center ${props.className ?? ''}`} style={box} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text className="text-text font-bold" style={letters} numberOfLines={1}>{props.initials}</Text>
      </Box>
    );
  }
  const name = props.name ?? '';
  const letter = { fontSize: Math.max(10, Math.round(size * LETTER_SHARE)), lineHeight: Math.round(size * LETTER_SHARE * 1.2) };
  return (
    <Box className={`rounded-pill overflow-hidden items-center justify-center ${props.className ?? ''}`} style={[box, { backgroundColor: coverTone(name).fill }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text className="text-text font-extrabold" style={letter} numberOfLines={1}>{initialOf(name)}</Text>
      {url && !failed ? <Image source={{ uri: url }} style={[StyleSheet.absoluteFill, box]} onError={() => setFailed(true)} /> : null}
    </Box>
  );
}
