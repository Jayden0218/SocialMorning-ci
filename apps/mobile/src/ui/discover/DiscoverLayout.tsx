// Discover's parts of the 039 layout: a section on `Section`, a row of cards on `Shelf`, and the link under a section.
/**
 * Spec 039 (M4, `design/B-Discover.dc.html`). Every Discover section is `DiscoverSection` (the `Section` heading on the page's one 20 gutter)
 * and every sideways list is `DiscoverShelf` (a `Shelf`: it runs off the right edge, 12 between cards). A card keeps its own width and
 * height. `SectionLink` is the hot-text line under a section ("Today's picks, with every note ›"): a 44 tall target, on the same left edge.
 * `Deck`, `DeckSection` and `DeckLink` stay in `Deck.tsx` for the search page, which has not moved to the layout parts yet.
 */
import { Children, type ComponentRef } from 'react';
import type { ScrollView } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars } from '@/design';
import { Type } from '@/ui/kit/Type';
import { Section, Shelf } from '@/ui/kit/layout';

export function DiscoverSection(props: { title: string; onSeeAll?: () => void; onLayout?: React.ComponentProps<typeof Box>['onLayout']; children?: React.ReactNode }): React.ReactElement {
  return (
    <Box onLayout={props.onLayout}>
      <Section title={props.title} {...(props.onSeeAll ? { onSeeAll: props.onSeeAll } : {})}>{props.children}</Section>
    </Box>
  );
}

/** Cards `width` x `height` on a shelf. */
export function DiscoverShelf(props: { width: number; height: number; scrollRef?: React.RefObject<ComponentRef<typeof ScrollView> | null>; /** Where card `i` sits along the shelf (from its layout). */ onCardX?: (i: number, x: number) => void; children?: React.ReactNode }): React.ReactElement {
  return (
    <Shelf {...(props.scrollRef ? { scrollRef: props.scrollRef } : {})}>
      {Children.toArray(props.children).map((card, i) => (
        <Box key={i} testID="shelf-card" onLayout={props.onCardX ? (e) => props.onCardX?.(i, e.nativeEvent.layout.x) : undefined} style={{ width: props.width, height: props.height }}>{card}</Box>
      ))}
    </Shelf>
  );
}

/** A hot-text line under a section. */
export function SectionLink(props: { label: string; /** The spoken name when it differs from the words. */ accessibilityLabel?: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="link" accessibilityLabel={props.accessibilityLabel ?? props.label} className="self-start justify-center" style={{ minHeight: bars.circle }}>
      <Type step="small" className="text-hotText font-semibold">{`${props.label} ›`}</Type>
    </Pressable>
  );
}
