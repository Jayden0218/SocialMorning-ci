// The empty block of a page: a flat curve, a title, a line, and one button if there is one.
/**
 * M31 T033 (design-pulse2 `empty`, kit.js): 200 wide flat curve of 40 bars (20 tall, the `line`
 * colour), the title in Unbounded 18, the line in Geist 14 / 20 text2, both centred, and the button
 * (light, 48) 6 under the line. The title and the line are one spoken sentence; the button is its
 * own control. Same block as `EmptyState`'s whole-page empty; this one takes its words directly
 * (the Chat tab's "Chat" / "No chats yet." titles are not the first sentence of a table row).
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';

const FLAT = { width: 200 };
const NONE: readonly number[] = [];
const HIDE = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const };

export function EmptyBlock(props: { title: string; line: string; children?: ReactNode }): React.ReactElement {
  return (
    <Box testID="empty-block" className="items-center" style={{ gap: spacing.gap + 2, paddingHorizontal: spacing.block, paddingVertical: spacing.gap + 2 }}>
      <Box style={FLAT} {...HIDE}><Curve data={NONE} count={40} height={20} min={20} flat /></Box>
      <Box className="items-center" style={{ gap: spacing.gap + 2 }} accessible accessibilityLabel={`${props.title} ${props.line}`}>
        <Type step="lede" className="text-text font-bold text-center">{props.title}</Type>
        <Type step="note" className="text-text2 text-center">{props.line}</Type>
      </Box>
      {props.children ? <Box style={{ marginTop: spacing.hair + 2 }}>{props.children}</Box> : null}
    </Box>
  );
}
