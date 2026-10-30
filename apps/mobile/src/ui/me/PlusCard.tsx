// The PLUS card in Wallet: what PLUS gives, its price, Subscribe, and Restore purchases.
/**
 * M20 US6 (spec FR-022; owner Q3 = A): PLUS gives a PLUS badge on your profile and a choice of app
 * icon. Nothing free is behind it — said on the card. Android only, with purchases switched on and
 * not in teen mode (`usePlayStore().ready`); otherwise the card is not drawn and Wallet's "not
 * available yet" stays. "Restore purchases" sends what Google still holds to the server again.
 */
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Button } from '@/ui/kit/Button';
import { PLUS } from '@/billing/products';
import type { PlayStore } from '@/billing/play';

export function PlusCard(props: { play: PlayStore; hasPlus: boolean }): React.ReactElement | null {
  if (!props.play.ready) return null;
  const price = props.play.price(PLUS);
  return (
    <Box className="bg-surface border border-border rounded-row px-section py-section gap-row">
      <Box className="self-start bg-primary rounded-pill px-row py-1"><Text className="text-onPrimary text-xs font-bold">PLUS</Text></Box>
      <Text className="text-text text-title font-display-semibold">{props.hasPlus ? 'You have PLUS' : 'SocialNet PLUS'}</Text>
      <Text className="text-muted text-sm">A PLUS badge next to your name, and a choice of app icon. Listening, comments and everything free today stay free.</Text>
      {props.hasPlus ? null : <Button label={price ? `Subscribe · ${price} a month` : 'Subscribe'} onPress={() => void props.play.buy(PLUS)} />}
      <Button kind="secondary" label="Restore purchases" onPress={() => void props.play.restore()} />
    </Box>
  );
}

/** The PLUS badge beside a name (profile, Me). */
export function PlusBadge(): React.ReactElement {
  return (
    <Box className="self-center bg-primary rounded-pill px-2 py-0.5" accessible accessibilityLabel="PLUS member">
      <Text className="text-onPrimary text-micro font-bold">PLUS</Text>
    </Box>
  );
}
