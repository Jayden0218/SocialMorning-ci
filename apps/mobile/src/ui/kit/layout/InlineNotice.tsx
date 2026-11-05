// A short notice inside a page ("You are offline") with one action.
/** Spec 039 (D3): a raise-coloured card (radius 16, padding 16) led by a warn dot, with the words and a 44 tall button at the end. */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, radius, spacing } from '@/design';
import { Type } from '../Type';

export function InlineNotice(props: { text: string; actionLabel: string; onAction: () => void }): React.ReactElement {
  return (
    <Box testID="inline-notice" className="flex-row items-center bg-raise" style={{ gap: spacing.row, padding: spacing.section, borderRadius: radius.row }}>
      <Box testID="inline-notice-warn" className="bg-warn" style={{ width: spacing.gap, height: spacing.gap, borderRadius: radius.pill }} />
      <Type step="body" className="text-text flex-1">{props.text}</Type>
      <Pressable accessibilityRole="button" accessibilityLabel={props.actionLabel} onPress={props.onAction} className="items-center justify-center" style={{ minHeight: bars.circle, minWidth: bars.circle }}>
        <Type step="strong" className="text-hotText">{props.actionLabel}</Type>
      </Pressable>
    </Box>
  );
}
