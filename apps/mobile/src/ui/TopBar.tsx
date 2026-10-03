/**
 * The bar at the top of the show, episode and player pages (owner's reference,
 * 2026-09-27): a way back on the left, the page's own actions on the right, no title.
 * Those three routes hide the stack header and draw this instead.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Chevron, Glyph } from './Icon';

export const TAP = { minHeight: hit.min, minWidth: hit.min };

export function TopBar(props: {
  onBack: () => void; back?: 'arrow' | 'down'; children?: React.ReactNode;
  /** M12 FR-060: the slim bar's middle (small art + title) once the page has scrolled. */ middle?: React.ReactNode;
  /** M16a (PageHeader): replaces the back button, e.g. a modal page's "Cancel". */ left?: React.ReactNode;
}): React.ReactElement {
  return (
    <Box className="flex-row items-center justify-between px-row">
      {props.left ?? (
        <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel={props.back === 'down' ? 'Close the player' : 'Back'} className="items-center justify-center" style={TAP}>
          {props.back === 'down' ? <Chevron dir="down" size={14} /> : <Glyph>←</Glyph>}
        </Pressable>
      )}
      {props.middle ? <Box className="flex-1 flex-row items-center gap-2 px-1">{props.middle}</Box> : null}
      <Box className="flex-row items-center gap-1">{props.children}</Box>
    </Box>
  );
}

/** One icon button in the bar. */
export function BarButton(props: { label: string; onPress: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={props.label} className="items-center justify-center" style={TAP}>
      {props.children}
    </Pressable>
  );
}
