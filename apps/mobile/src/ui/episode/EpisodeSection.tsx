// One named section of the Episode page: a Section heading, then its content.
/**
 * Spec 039 (Detail template; was M31 W3-A's edge label and 28 lane): a section is the layout kit's `Section` (the `heading` step, 24 apart
 * on the page's one gutter), kept in a box with the old test id so the page's order stays checkable. A row of cards in it is a `Shelf`.
 */
import { Box } from '@/ui/lib/box';
import { Section } from '@/ui/kit/layout';

export function EpisodeSection(props: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box testID={`episode-section-${props.label.toLowerCase()}`}>
      <Section title={props.label}>{props.children}</Section>
    </Box>
  );
}
