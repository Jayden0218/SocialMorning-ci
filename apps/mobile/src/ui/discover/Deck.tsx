// The Deck: a section's row of cards that snaps card by card, under the section's edge label.
/**
 * M31 T030 (design-pulse2 `discover.html#home--fold-a`, `#home--fold-b`; layout pattern Deck). Each
 * section below the Discover mosaic is `DeckSection` (the vertical edge label in the 28 lane, 2 above
 * and 18 below the content, at least 120 tall) holding a `Deck`: cards of one width, `DECK.gap` (10)
 * apart, the first starting at the 28 lane, the next one peeking in at the right; a flick moves one
 * card (`snapToInterval`). `DeckCard` is the card (radius 24, raise, a 1 line border); `DeckLink` the
 * hot-text "Full chart ›" line under a deck (13/600, 10 under the deck, 28 from the left).
 *
 * Small parts the cards share: `CoverBand` (a cover cut to a band, the made-for-you tile behind it
 * while it loads), `DiscPlay` (the light Play disc, 38–40) and `RingAdd` (the "+" ring). They are
 * 38–40 drawn and 48 to touch (`hitSlop`).
 *
 * The edge label keeps the admin's rename (Admin › Discover › section titles): `useEdge` gives the drawn
 * short name ("For you") unless the owner gave the section another one.
 */
import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Image } from '@/ui/lib/image';
import { Text } from '@/ui/kit/Text';
import { coverLetters, coverTone } from '@socialmorning/social-core';
import { colour, gutter, radius, spacing } from '@/design';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { thumbUrl } from '@/ui/kit/Artwork';
import { useSectionTitle } from '@/config/store';
import { drawnType } from '@/design/type-px';

/** The deck's measures (drawn): the left lane the edge label lives in, the gap between cards, the section's padding. */
export const DECK = { lane: 28, gap: 10, top: 2, bottom: 18, min: 120, edgeTop: 4, linkTop: 10, pad: 14 } as const;

/** The drawing's own small numbers between the named spacing steps (4 · 8 · 12 · 16): 2, 3, 6, 10, 14, 18 — chip paddings, card gaps, the Hidden card's padding. */
export const PX = { two: 2, three: 3, four: 4, six: 6, ten: 10, fourteen: 14, eighteen: 18 } as const;

/**
 * Unbounded 700 at the sizes the cards are drawn in. The type scale has Lede (18) and Heading (20) but nothing between the 11 of the edge
 * label and 18, and a card's title is drawn 15, 16 or 17 — in a 270 wide card with a 64 cover, 18 wraps a third line. The line height is the
 * font's own (1.24, see `FACE_LEADING`), rounded up. Used with `Type step="lede"`.
 */
export const UNBOUNDED = drawnType.unbounded;

/**
 * The edge label of a section: the drawn short name ("For you"), or the owner's own name for it when they renamed it
 * (Admin › Discover); a screen reader always hears the full name (the owner's, or `title`).
 */
export function useEdge(title: string, short: string): { label: string; spoken: string } {
  const named = useSectionTitle(title);
  return { label: named === title ? short : named, spoken: named };
}

export function DeckSection(props: { label: string; /** What a screen reader says when `label` is a short form. */ spoken?: string; bottom?: number; children: ReactNode; onLayout?: React.ComponentProps<typeof Box>['onLayout'] }): React.ReactElement {
  return (
    <Box onLayout={props.onLayout} style={{ paddingTop: DECK.top, paddingBottom: props.bottom ?? DECK.bottom, minHeight: DECK.min }}>
      <EdgeLabel label={props.label} {...(props.spoken ? { spoken: props.spoken } : {})} top={DECK.edgeTop} />
      {props.children}
    </Box>
  );
}

/** Cards `width` x `height`, snapping one at a time. `focus` scrolls the deck to that card when it changes. `lead` (D-A, Updates): the first card's left edge. */
export function Deck(props: { width: number; height: number; children: ReactNode[] | ReactNode; focus?: number; accessibilityLabel?: string; /** Where the first card starts: the 28 lane by default; the Updates deck has no edge label beside it and starts at the gutter (20). */ lead?: number }): React.ReactElement {
  const { width: window } = useWindowDimensions();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const cards = Array.isArray(props.children) ? props.children : [props.children];
  useEffect(() => {
    if (props.focus === undefined) return;
    scroller.current?.scrollTo?.({ x: props.focus * (props.width + DECK.gap), animated: true });
  }, [props.focus, props.width]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={props.width + DECK.gap}
      snapToAlignment="start"
      decelerationRate="fast"
      testID="deck"
      {...(props.accessibilityLabel ? { accessibilityLabel: props.accessibilityLabel } : {})}
      style={{ height: props.height, flexGrow: 0 }}
      contentContainerStyle={{ paddingLeft: props.lead ?? DECK.lane, paddingRight: gutter(window) - spacing.hair, gap: DECK.gap }}
    >
      {cards.map((card, i) => (
        <Box key={i} style={{ width: props.width, height: props.height }}>{card}</Box>
      ))}
    </ScrollView>
  );
}

/** The card: raise, a line, radius 24. `premium` is the violet Premium card; `dashed` the hidden For You card. */
export function DeckCard(props: { children: ReactNode; tone?: 'plain' | 'premium' | 'dashed'; className?: string }): React.ReactElement {
  const tone = props.tone ?? 'plain';
  const cls = tone === 'premium' ? 'bg-premiumTint border-violet/40' : tone === 'dashed' ? 'bg-void border-dashed border-switchOff' : 'bg-raise border-line';
  return (
    <Box testID="deck-card" className={`flex-1 border overflow-hidden ${cls} ${props.className ?? ''}`} style={{ borderRadius: radius.card }}>
      {props.children}
    </Box>
  );
}

/** "Full chart ›": a hot-text line under a deck. */
export function DeckLink(props: { label: string; /** The spoken name when it differs from the words. */ accessibilityLabel?: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="link"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
      className="self-start"
      style={{ marginTop: DECK.linkTop, marginLeft: DECK.lane }}
    >
      <Type step="caption" className="text-hotText font-semibold">{`${props.label} ›`}</Type>
    </Pressable>
  );
}

/** A cover cut to a band (the drawn `height:120px;background:art`): the image fills it, the made-for-you tile shows until it loads. */
export function CoverBand(props: { url?: string | null; name: string; height: number; width?: number; children?: ReactNode }): React.ReactElement {
  const tone = coverTone(props.name);
  const mark = coverLetters(props.name);
  return (
    <Box accessible={false} importantForAccessibility="no-hide-descendants" style={{ height: props.height, ...(props.width ? { width: props.width } : {}), backgroundColor: tone.fill, overflow: 'hidden' }}>
      {mark ? <Text className="text-text font-bold absolute" style={{ left: spacing.row, top: spacing.row, ...drawnType.coverMark, color: tone.ink }} numberOfLines={1}>{mark}</Text> : null}
      {props.url ? <Image source={{ uri: thumbUrl(props.url, 300) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      {props.children}
    </Box>
  );
}

/** The light Play disc of a card: drawn 38–40, touched 48. The glyph sits 1 right of centre so it looks centred. */
export function DiscPlay(props: { size: number; title: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play ${props.title}`}
      hitSlop={Math.ceil((48 - props.size) / 2)}
      className="bg-text items-center justify-center"
      style={{ width: props.size, height: props.size, borderRadius: props.size / 2, paddingLeft: 2 }}
    >
      <Icon name="play" size={Math.round(props.size * 0.38)} color={colour.void} />
    </Pressable>
  );
}

/** The "+" ring: adds the episode to the queue. */
export function RingAdd(props: { size: number; title: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${props.title} to the queue`}
      hitSlop={Math.ceil((48 - props.size) / 2)}
      className="items-center justify-center border-[1.5px] border-outline"
      style={{ width: props.size, height: props.size, borderRadius: props.size / 2 }}
    >
      <Icon name="add" size={18} color={colour.text} />
    </Pressable>
  );
}

/** A bare Play glyph on a row (the chart's, the New arrivals'): 16 drawn, touched 48. */
export function PlayGlyph(props: { title: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} hitSlop={16} className="items-center justify-center" style={{ width: 16, height: 16 }}>
      <Icon name="play" size={16} color={colour.text2} />
    </Pressable>
  );
}
