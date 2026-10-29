// The dashed card that stands where a deck of cards would be, when there is nothing to put in it.
/**
 * M31 W3-A (T040; design-pulse2 `episode--clips-empty`, `episode--related-empty`): 180 tall, radius 22, a 1.5 dashed `line`
 * outline, holding the shared empty block — a flat curve (40 bars, 200 wide, 20 tall), the title in Unbounded 18 and today's
 * sentence under it in text2. No button: what fills it is done elsewhere (clips are made from the player's scissors).
 */
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';
import { EPISODE } from './measures';

const NONE: readonly number[] = [];
const FLAT = { width: 200 };

export function EmptyDeck(props: { title: string; sentence: string }): React.ReactElement {
  return (
    <Box
      testID="empty-deck"
      accessibilityLiveRegion="polite"
      className="items-center justify-center gap-row px-block"
      style={{ height: EPISODE.emptyCard.height, borderRadius: EPISODE.emptyCard.radius, borderWidth: EPISODE.emptyCard.line, borderStyle: 'dashed', borderColor: colour.line }}
    >
      <Box style={FLAT} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={NONE} count={40} height={20} min={20} flat /></Box>
      <Type step="lede" className="text-text text-center">{props.title}</Type>
      <Type step="note" className="text-text2 text-center">{props.sentence}</Type>
    </Box>
  );
}
