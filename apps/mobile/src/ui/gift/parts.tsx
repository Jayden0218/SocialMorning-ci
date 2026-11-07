// The gift page's two pictures: the offer (cover, badge, words) and the link that does not work.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `giftPhone`, `gift--not-found`): the offer is the series cover at 240 with a pink glow and a
 * 56 hot gift badge on its corner, then centred "A PAID SERIES" (mono caps), the show's name (Unbounded 800 28) and the sentence (15, text-2), then the
 * server's answer in hot-text. A dead link is a dim 140 gift tile tilted 6 degrees left with no glow of its own, and its sentence (17, text-2) centred.
 */
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { giftColour } from '@/design/tokens';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { GIFT } from '@/ui/wallet/measures';
import { Big, Cap, Line } from '@/ui/wallet/stage';

export function GiftOffer(props: { top: number; show: { title: string; artworkUrl?: string | null }; sentence: string; said: string | undefined }): React.ReactElement {
  return (
    <>
      <Box testID="gift-cover" className="absolute left-0 right-0 items-center" pointerEvents="none" style={{ top: props.top + GIFT.coverTop }}>
        <Box style={{ width: GIFT.cover, height: GIFT.cover, borderRadius: GIFT.coverRadius, shadowColor: giftColour.pink, shadowOpacity: GIFT.coverGlowOpacity, shadowRadius: GIFT.coverGlowRadius, shadowOffset: { width: 0, height: 0 } }}>
          <Box className="overflow-hidden" style={{ width: GIFT.cover, height: GIFT.cover, borderRadius: GIFT.coverRadius }}>
            <Artwork url={props.show.artworkUrl} size={GIFT.cover} name={props.show.title} />
          </Box>
          <Box testID="gift-badge" className="absolute bg-hot items-center justify-center" accessible={false} importantForAccessibility="no-hide-descendants" style={{ right: GIFT.badgeOffset, top: GIFT.badgeOffset, width: GIFT.badge, height: GIFT.badge, borderRadius: GIFT.badge / 2, borderWidth: GIFT.badgeRing, borderColor: colour.void }}>
            <Icon name="gift-outline" size={GIFT.badgeIcon} color={colour.void} />
          </Box>
        </Box>
      </Box>
      <Box testID="gift-words" className="absolute items-center" style={{ left: GIFT.textSide, right: GIFT.textSide, top: props.top + GIFT.textTop, gap: GIFT.textGap }}>
        <Cap align="center">A paid series</Cap>
        <Big size="big28" align="center" header>{props.show.title}</Big>
        <Line size="line15" align="center">{props.sentence}</Line>
        {props.said ? <Line size="line15" tone="hot" align="center" live>{props.said}</Line> : null}
      </Box>
    </>
  );
}

export function GiftDead(props: { top: number; sentence: string }): React.ReactElement {
  return (
    <>
      <Box testID="gift-dead-tile" className="absolute left-0 right-0 items-center" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ top: props.top + GIFT.deadTop }}>
        <Box className="bg-raise2 items-center justify-center" style={{ width: GIFT.deadTile, height: GIFT.deadTile, borderRadius: Math.round(GIFT.deadTile * 0.26), transform: [{ rotate: '-6deg' }] }}>
          <Icon name="gift-outline" size={Math.round(GIFT.deadTile * 0.42)} color={colour.text3} />
        </Box>
      </Box>
      <Box testID="gift-dead-words" className="absolute" style={{ left: GIFT.deadSide, right: GIFT.deadSide, top: props.top + GIFT.deadSentenceTop }}>
        <Line size="line17" align="center">{props.sentence}</Line>
      </Box>
    </>
  );
}
