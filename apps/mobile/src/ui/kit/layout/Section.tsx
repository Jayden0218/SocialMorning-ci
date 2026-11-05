// A titled block of a page: a heading, an optional "See all" link, then its content.
/** Spec 039 (D3): the heading is the `heading` step; "See all" is a 44 tall link in hot text; the content sits `spacing.row` under the heading row. */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, spacing } from '@/design';
import { Type } from '../Type';

export function Section(props: { title: string; onSeeAll?: () => void; children?: React.ReactNode }): React.ReactElement {
  return (
    <Box testID="section" style={{ gap: spacing.row }}>
      <Box className="flex-row items-center justify-between">
        <Type step="heading" accessibilityRole="header" className="text-text flex-1" numberOfLines={1}>{props.title}</Type>
        {props.onSeeAll ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`See all ${props.title}`} onPress={props.onSeeAll} className="justify-center" style={{ minHeight: bars.circle }}>
            <Type step="strong" className="text-hotText">See all</Type>
          </Pressable>
        ) : null}
      </Box>
      {props.children}
    </Box>
  );
}
