// One editor's pick: the episode plus a short quote on why.
/**
 * An editorial pick (M5 FR-001): the episode with the owner's one-line "why".
 *
 * M31 D-A (T031): a Deck card as Discover draws its picks — raise, radius 24, a 1 line; the cover (64) with the show and the title
 * (Unbounded 700 16) in the first row, the owner's note in italics (`quote`), and the light Play disc (38) at the foot. The whole card
 * opens the episode, as the row did (Updates shows these only before you follow anything).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { spacing } from '@/design';
import type { DiscoverItem } from '@/social/api';
import { DECK, DeckCard, UNBOUNDED } from './Deck';

/** Drawn like the Picks deck's cards: the cover 64. */
const COVER = 64;

export function PickCard(props: { item: DiscoverItem; onPress: () => void }): React.ReactElement {
  const e = props.item.episode;
  return (
    <DeckCard>
      <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`${e.title}, ${e.showTitle}`} className="flex-1" style={{ padding: DECK.pad, gap: spacing.row }}>
        <Box className="flex-row items-center" style={{ gap: spacing.row }}>
          <Artwork url={e.imageUrl} size={COVER} name={e.showTitle} />
          <Box className="flex-1 min-w-0">
            <Type step="caption" className="text-text2" numberOfLines={1}>{e.showTitle}</Type>
            <Type step="lede" className="text-text font-bold" style={UNBOUNDED[16]} numberOfLines={2}>{e.title}</Type>
          </Box>
        </Box>
        {props.item.why ? <Type step="quote" className="text-quote italic" numberOfLines={3}>{`“${props.item.why}”`}</Type> : null}
      </Pressable>
    </DeckCard>
  );
}
