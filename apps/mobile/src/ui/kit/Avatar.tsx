// A person's round picture: their photo, or their letters when there is none.
/**
 * M19 T014 (US1, FR-001–FR-005): one avatar for every place a person is drawn. With a photo
 * (`url`, from the server's `avatarUrl`) it is the photo in a circle; the letters stay under it
 * while it loads or when it fails (Artwork's fade-in). Without one it looks as before at each
 * place: the two-letter coloured tile (profiles, follow lists, chat), or — when `initials` is
 * given — the small yellow-tint disc with one letter (comments).
 *
 * Decoration only: the row it sits in says who it is, so it adds nothing for a screen reader.
 */
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { Artwork } from './Artwork';

export function Avatar(props: {
  /** The photo, if the person set one. */
  url?: string | null;
  /** The person's name: its letters make the tile when there is no photo. */
  name?: string | null;
  size: number;
  /** Draw the plain disc with these letters instead of the coloured tile (comments). */
  initials?: string;
  className?: string;
}): React.ReactElement {
  const { url, size } = props;
  if (props.initials !== undefined && !url) {
    const box = { width: size, height: size };
    const letters = { fontSize: Math.max(10, Math.round(size * 0.34)) };
    return (
      <Box className={`rounded-pill bg-accentTint items-center justify-center ${props.className ?? ''}`} style={box} accessible={false} importantForAccessibility="no-hide-descendants">
        <Text className="text-text font-bold" style={letters} numberOfLines={1}>{props.initials}</Text>
      </Box>
    );
  }
  return (
    <Artwork
      size={size}
      rounded="pill"
      {...(url ? { url } : {})}
      {...(props.name ? { name: props.name } : {})}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}
