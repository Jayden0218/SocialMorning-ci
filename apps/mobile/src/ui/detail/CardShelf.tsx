// A row of equal cards on a Shelf: each card gets the shelf's width and height (the Deck's job, without its 28 lane and edge label).
/**
 * Spec 039 (Detail lane): the old `Deck` started its cards at a 28 lane under a vertical edge label and snapped card by card. A Detail page puts
 * the same cards on a `Shelf` inside a `Section` (the 20 gutter on the left, running off the right edge), so this wraps each child in a box
 * of the card size. `label` names the row for a screen reader and `testID` stays "deck", so a test that looks for the row finds it.
 */
import { Box } from '@/ui/lib/box';
import { Shelf } from '@/ui/kit/layout';

export function CardShelf(props: { width: number; height: number; label?: string; children: React.ReactNode }): React.ReactElement {
  const cards = Array.isArray(props.children) ? props.children : [props.children];
  return (
    <Box testID="deck" accessible={false} {...(props.label ? { accessibilityLabel: props.label } : {})}>
      <Shelf>
        {cards.map((card, i) => <Box key={i} style={{ width: props.width, height: props.height }}>{card}</Box>)}
      </Shelf>
    </Box>
  );
}
