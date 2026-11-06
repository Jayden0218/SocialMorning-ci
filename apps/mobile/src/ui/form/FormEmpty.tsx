// An empty state inside a Form page: the flat curve, a title and a line (the page's gutter is already there).
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';

export function FormEmpty(props: { title: string; line?: string }): React.ReactElement {
  return (
    <Box testID="page-empty" className="items-center" style={{ gap: spacing.row, paddingVertical: spacing.block }}>
      <Box style={{ width: 200 }} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={[]} count={40} height={20} min={20} flat /></Box>
      <Box className="items-center" style={{ gap: spacing.gap }} accessible accessibilityLabel={props.line ? `${props.title} ${props.line}` : props.title}>
        <Type step="lede" className="text-text font-bold text-center">{props.title}</Type>
        {props.line ? <Type step="note" className="text-text2 text-center">{props.line}</Type> : null}
      </Box>
    </Box>
  );
}
