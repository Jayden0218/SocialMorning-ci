// The PLUS card in Wallet: what PLUS gives, its price, Subscribe, and Restore purchases.
/**
 * M20 US6 (spec FR-022; owner Q3 = A): PLUS gives a PLUS badge on your profile and a choice of app
 * icon. Nothing free is behind it — said on the card. Android only, with purchases switched on and
 * not in teen mode (`usePlayStore().ready`); otherwise the card is not drawn and Wallet's "not
 * available yet" stays. "Restore purchases" sends what Google still holds to the server again.
 *
 * M31 W6-A (T070; design-pulse2 `shell.html` `plusCard`, `wallet--screen`, `wallet--plus`): the card is a raise tile (radius 22, 1 px line,
 * 16 of padding, 10 between parts) that fades from the premium tint at the top to raise at 70 %; the solid PLUS tag (hot, void words, mono 12)
 * and a 30 gem in hot-text on one row; "SocialNet PLUS" / "You have PLUS" in Unbounded 800 22; the promise in Geist 500 13; Subscribe (light, 42) and
 * Restore purchases (ring, 42) side by side. Subscribe keeps the price in its name ("Subscribe · US$2.99 a month"), which does not fit
 * half a row, so with a price the two buttons stack (not as drawn: the drawing's Subscribe has no price). Same store calls, same names.
 */
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { Text } from '@/ui/kit/Text';
import { PLUS } from '@/billing/products';
import type { PlayStore } from '@/billing/play';
import { Big, Line } from '@/ui/wallet/stage';
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
      style={{ borderRadius: WALLET.radius, padding: WALLET.pad, gap: WALLET.cardGap, borderWidth: 1, borderColor: colour.line }}
    >
      <Box className="flex-row items-start justify-between">
        <Box className="bg-hot rounded-chip justify-center" style={{ height: 22, paddingHorizontal: 7 }}><Type step="mono" className="text-void">PLUS</Type></Box>
        <Icon name="diamond-outline" size={WALLET.gem} color={colour.hotText} />
      </Box>
      <Big size="big22">{props.hasPlus ? 'You have PLUS' : 'SocialNet PLUS'}</Big>
      <Line size="line13">A PLUS badge next to your name, and a choice of app icon. Listening, comments and everything free today stay free.</Line>
      <Box testID="plus-buttons" className={stacked ? 'flex-col' : 'flex-row'} style={{ gap: WALLET.buttonGap }}>
        {props.hasPlus ? null : <PulseButton label={price ? `Subscribe · ${price} a month` : 'Subscribe'} onPress={() => void props.play.buy(PLUS)} height={WALLET.buttonHeight} className={stacked ? '' : 'flex-1'} full={stacked} />}
        <PulseButton kind="ring" label="Restore purchases" onPress={() => void props.play.restore()} height={WALLET.buttonHeight} className={stacked && !props.hasPlus ? '' : 'flex-1'} full={stacked && !props.hasPlus} />
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
