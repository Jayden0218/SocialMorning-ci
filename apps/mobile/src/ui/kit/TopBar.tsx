// Top bar with back (or close) button on left, page actions on right.
/**
 * The bar at the top of the show, episode and player pages (owner's reference,
 * 2026-09-27): a way back on the left, the page's own actions on the right, no title.
 * Those three routes hide the stack header and draw this instead.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { Chevron, Icon } from './Icon';

export const TAP = { minHeight: hit.min, minWidth: hit.min };
const SOLID = { zIndex: 2 };

export function TopBar(props: {
  onBack: () => void; back?: 'arrow' | 'down'; children?: React.ReactNode;
  /** M12 FR-060: the slim bar's middle (small art + title) once the page has scrolled. */ middle?: React.ReactNode;
  /** M16a (PageHeader): replaces the back button, e.g. a modal page's "Cancel". */ left?: React.ReactNode;
  /**
   * Owner's iPhone, 2026-10-07 ("I see it overlap"): a collapsed bar was see-through, so the page
   * showed under its title. `solid` (set once the page has scrolled) paints the paper colour and a
   * hairline under the bar, and keeps it above the page.
   */ solid?: boolean;
}): React.ReactElement {
  return (
    <Box className={`flex-row items-center justify-between px-row ${props.solid ? 'bg-background border-b-hairline border-separator' : ''}`} style={props.solid ? SOLID : undefined}>
      {props.left ?? (
        <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel={props.back === 'down' ? 'Close the player' : 'Back'} className="items-center justify-center" style={TAP}>
          {/* M24 US18: every B design draws a 22–24 pt "←" (a line with its head), not a 10 pt chevron. */}
          {props.back === 'down' ? <Chevron dir="down" size={14} /> : <Chevron dir="left" size={10} />}
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
