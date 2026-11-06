// The PLUS card in Wallet: what PLUS gives, its price, Subscribe, and Restore purchases.
/**
 * M20 US6 (spec FR-022; owner Q3 = A): PLUS gives a PLUS badge on your profile and a choice of app
 * icon. Nothing free is behind it — said on the card. Android only, with purchases switched on and
 * not in teen mode (`usePlayStore().ready`); otherwise the card is not drawn and Wallet's "not
 * available yet" stays. "Restore purchases" sends what Google still holds to the server again.
 *
 * M31 W6-A (T070; design-pulse2 `shell.html` `plusCard`, `wallet--screen`, `wallet--plus`), restyled by spec 039 I2 on the 038 tokens: the card is a raise tile (radius 24,
 * 1 px line, 16 of padding, 12 between parts) that fades from the premium tint at the top to raise at 70 %; the solid PLUS tag (hot, void words, mono) and a 30 gem in
 * hot-text on one row; "SocialNet PLUS" / "You have PLUS" at the `heading` step; the promise at the `body` step; Subscribe (light) and Restore purchases (ring) side by side.
 * Subscribe keeps the price in its name ("Subscribe · US$2.99 a month"), which does not fit half a row, so with a price the two buttons stack (not as drawn: the
 * drawing's Subscribe has no price). Same store calls, same names.
 */
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { colour, radius, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { Text } from '@/ui/kit/Text';
import { PLUS } from '@/billing/products';
import type { PlayStore } from '@/billing/play';
import { WALLET } from '@/ui/wallet/measures';

export function PlusCard(props: { play: PlayStore; hasPlus: boolean }): React.ReactElement | null {
  if (!props.play.ready) return null;
  const price = props.play.price(PLUS);
  const stacked = price !== undefined && price !== '';
  return (
    <LinearGradient
      testID="plus-card"
      colors={[colour.premiumTint, colour.raise, colour.raise]}
      locations={[0, 0.7, 1]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.7, y: 1 }}
      style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row, borderWidth: 1, borderColor: colour.line }}
    >
      <Box className="flex-row items-start justify-between">
        <Box className="bg-hot rounded-chip justify-center" style={{ paddingVertical: spacing.hair, paddingHorizontal: spacing.gap }}><Type step="time" className="text-void">PLUS</Type></Box>
        <Icon name="diamond-outline" size={WALLET.gem} color={colour.hotText} />
      </Box>
      <Type step="heading" className="text-text">{props.hasPlus ? 'You have PLUS' : 'SocialNet PLUS'}</Type>
      <Type step="body" className="text-text2">A PLUS badge next to your name, and a choice of app icon. Listening, comments and everything free today stay free.</Type>
      <Box testID="plus-buttons" className={stacked ? 'flex-col' : 'flex-row'} style={{ gap: spacing.gap }}>
        {props.hasPlus ? null : <PulseButton label={price ? `Subscribe · ${price} a month` : 'Subscribe'} onPress={() => void props.play.buy(PLUS)} className={stacked ? '' : 'flex-1'} full={stacked} />}
        <PulseButton kind="ring" label="Restore purchases" onPress={() => void props.play.restore()} className={stacked && !props.hasPlus ? '' : 'flex-1'} full={stacked && !props.hasPlus} />
      </Box>
    </LinearGradient>
  );
}

/** The PLUS badge beside a name (profile, Me). */
export function PlusBadge(): React.ReactElement {
  return (
    <Box className="self-center bg-primary rounded-pill px-gap" style={{ paddingVertical: 2 }} accessible accessibilityLabel="PLUS member">
      <Text className="text-onPrimary text-micro font-bold">PLUS</Text>
    </Box>
  );
}
