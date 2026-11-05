// A row of cards that scrolls sideways and runs off the right edge of the screen.
/**
 * Spec 039 (D3): the page has a 20 gutter, so a shelf pulls itself back out by that much on the RIGHT only (negative right margin) and pads
 * its content by the same on the right: the first card lines up with the gutter on the left, the last can scroll clear of the edge, and
 * cards are cut off at the right edge to show there is more.
 */
import { useRef, type ComponentRef } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { gutter, spacing } from '@/design';

export function Shelf(props: {
  /** The horizontal ScrollView, for a shelf that scrolls itself (a chart's name brings its card to the left). */
  scrollRef?: React.RefObject<ComponentRef<typeof ScrollView> | null>;
  children?: React.ReactNode;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const own = useRef<ComponentRef<typeof ScrollView>>(null);
  const scroller = props.scrollRef ?? own;
  return (
    <ScrollView ref={scroller} testID="shelf" horizontal showsHorizontalScrollIndicator={false} style={{ marginRight: -side }} contentContainerStyle={{ paddingRight: side, gap: spacing.row }}>
      {props.children}
    </ScrollView>
  );
}
