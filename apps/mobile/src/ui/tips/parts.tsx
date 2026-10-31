// Tips I gave: the faint wall of bars behind the empty page, and a tip as a 64 tile.
/**
 * M31 W6-A (T070 part 1; design-pulse2 `shell.html` `tips--screen`): the wall is 60 bars 220 tall (at least 20), side by side from 20 to 20, each a shade of
 * white at 4 to 10 % (`.04 + .06 sin^2(k / 3)`), behind the heart tile; it is decoration and says nothing. A tip is the same 64 raise tile as a purchase:
 * the show's name, the date under it, the amount in mono at the end.
 */
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { shortDate } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { moneyLabel } from '@/me/money';
import type { Tip } from '@/social/m12-api';
import { STAGE_TYPE, TIPS, WALLET } from '@/ui/wallet/measures';

/** The bar `k` of the wall: its height (from the 220) and its shade of white. Pure, so a test can read it. */
export function wallBar(k: number): { height: number; opacity: number } {
  const v = 0.35 + 0.65 * Math.abs(Math.sin(k * 0.7) * Math.cos(k * 0.23));
  return { height: Math.round(TIPS.wallMin + (TIPS.wallHeight - TIPS.wallMin) * v), opacity: Number((0.04 + 0.06 * Math.sin(k / 3) ** 2).toFixed(2)) };
}

export function TipsWall(props: { top: number }): React.ReactElement {
  return (
    <Box testID="tips-wall" className="absolute flex-row items-end" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ left: TIPS.wallSide, right: TIPS.wallSide, top: props.top, height: TIPS.wallHeight, gap: 2 }}>
      {Array.from({ length: TIPS.wallBars }, (_, k) => {
        const b = wallBar(k);
        return <Box key={k} className="flex-1" style={{ height: b.height, borderRadius: 2, backgroundColor: colour.text, opacity: b.opacity }} />;
      })}
    </Box>
  );
}

export function TipTile(props: { tip: Tip }): React.ReactElement {
  const item = props.tip;
  return (
    <Box testID="tip-tile" className="flex-row items-center bg-raise border border-line" style={{ minHeight: WALLET.tileMin, borderRadius: WALLET.tileRadius, paddingVertical: WALLET.tilePadY, paddingHorizontal: WALLET.tilePadX, gap: WALLET.tileGap, marginBottom: TIPS.listGap }} accessible accessibilityLabel={`${item.showTitle ?? 'A show'}, ${moneyLabel(item.amountMicros, item.currency)}, ${shortDate(Date.parse(item.createdAt))}`}>
      <Box className="flex-1">
        <Type step="row" className="text-text" numberOfLines={1}>{item.showTitle ?? item.feedUrl}</Type>
        <Type step="caption" className="text-text3" style={STAGE_TYPE.small12}>{shortDate(Date.parse(item.createdAt))}</Type>
      </Box>
      <Type step="mono" className="text-text" style={STAGE_TYPE.mono15}>{moneyLabel(item.amountMicros, item.currency)}</Type>
    </Box>
  );
}

export const TIPS_SIDE = spacing.screenX;
