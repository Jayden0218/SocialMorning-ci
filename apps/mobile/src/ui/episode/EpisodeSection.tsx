// One named section of the Episode page: an edge label on the left, its content starting 28 in.
/**
 * M31 W3-A (T040; layout rule 3, design-pulse2 `edge('Notes', 20)` + the content's `margin-left:28px;margin-right:16px`):
 * a section is named by the vertical `EdgeLabel` on the page's left edge instead of a heading row, and its content starts
 * 28 from the left (the label's lane) and ends 16 from the right. A decks' cards may run to the right edge (`bleed`): the
 * drawing's decks scroll sideways under the right edge. `top` is the space above the section (22 in the drawing).
 */
import { Box } from '@/ui/lib/box';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { EPISODE } from './measures';

export function EpisodeSection(props: { label: string; /** What a screen reader says, when it differs. */ spoken?: string; /** The deck runs to the right edge. */ bleed?: boolean; top?: number; children: React.ReactNode }): React.ReactElement {
  return (
    <Box testID={`episode-section-${props.label.toLowerCase()}`} style={{ marginTop: props.top ?? EPISODE.sectionGap }}>
      <EdgeLabel label={props.label} {...(props.spoken !== undefined ? { spoken: props.spoken } : {})} top={0} />
      <Box style={{ marginLeft: EPISODE.lane, marginRight: props.bleed === true ? 0 : EPISODE.right }}>{props.children}</Box>
    </Box>
  );
}
