// Big cover with soft shadow at the top of episode and show pages.
/**
 * M17 (`Episode-B`, `Show-B`): the big centred artwork at the top of the episode and show pages,
 * with its soft drop shadow. The shadow sits on a wrapper because `Artwork` clips its corners;
 * its colour is the text token (no literal), so it reads as a warm shade on the paper page.
 */
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { useColours } from '@/ui/kit/useColours';

export function HeroArtwork(props: { url?: string | null | undefined; size: number; name?: string | undefined }): React.ReactElement {
  const c = useColours();
  const shadow = { shadowColor: c.text, shadowOpacity: 0.15, shadowRadius: 15, shadowOffset: { width: 0, height: 14 }, elevation: 8 };
  return (
    <Box className="bg-surface rounded-artwork-lg" style={shadow}>
      <Artwork url={props.url ?? null} size={props.size} rounded="artworkLarge" {...(props.name !== undefined ? { name: props.name } : {})} />
    </Box>
  );
}
