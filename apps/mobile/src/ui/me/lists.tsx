// The parts the Me tab's list pages share: a thread's cards and day tags, a mosaic tile, a deck's dots, the search field.
/**
 * M31 W3-C (T041; design-pulse2 `listen.html` history / my-comments / likes / favourites / moments /
 * playlists entries, `shell.html` favourites). Every number below is read off those drawings:
 *
 *  - Thread (History, My comments, Likes, Favourites > Comments): a spine at x 40 (the comments lane's
 *    `SpineLine`), the list 18 from the left and 20 from the right, 10 under the page's top; a node is a head
 *    (a 46 column with its chip or avatar centred on the spine, then a label) over a card 56 from the left.
 *    A card is raise, radius 18, padding 12, 6 between its parts.
 *  - Day tag (History): the light tag on the spine — text fill, void words, Geist Mono 600 11 / 22, 22 tall, 8 of
 *    padding each side, radius 7, upper case.
 *  - Mosaic (Playlists, Favourites > Episodes): two columns in the Me tab's lane (28 left, 16 right), rows 84,
 *    10 apart; an art tile is radius 22 with the cover filling it and a fade to void at the foot.
 *  - Deck (Saved moments, a Playlist): cards 290 wide, 10 apart, the first at the gutter (20), snapping one at a
 *    time, and a row of dots under it (6 wide, the current one 18; 4 tall).
 *  - Search field: 48 tall, raise2, radius 18, 14 of padding, a 20 magnifier, Geist 500 15.
 *
 * Sizes are styles, not classes: the token check reads class names, and a number here is one the drawing wrote.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { ScrollView } from '@/ui/lib/scroll-view';
import { LinearGradient } from '@/design/tailwind';
import { colour, glow, gutter, radius, spacing } from '@/design';
import { player } from '@/design/tokens';
import { coverLetters, coverTone } from '@socialmorning/social-core';
import { Icon } from '@/ui/kit/Icon';
import { thumbUrl } from '@/ui/kit/Artwork';
import { shortDate } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Text } from '@/ui/kit/Text';
import { COMMENTS } from '@/ui/comments/measures';
import { SpineLine } from '@/ui/comments/Spine';
import { Curve } from '@/ui/kit/Curve';
import { Pressable } from '@/ui/lib/pressable';
import { drawnType } from '@/design/type-px';
import { ME_MOSAIC } from './mosaic';
import { ME_TYPE } from './measures';

/** The drawn numbers of a thread, a card, a tag and the deck. */
export const LIST = {
  /** A node's card: raise, radius 18, padding 12, 6 between parts (`card()` in listen.html). */
  cardRadius: radius.bar,
  cardPad: spacing.row,
  cardGap: 6,
  /** The list's first node is 10 under the top, 18 from the left, 20 from the right. */
  top: COMMENTS.listTop,
  left: COMMENTS.listLeft,
  right: COMMENTS.listRight,
  /** The head's column is 46 wide and the card 56 in. */
  column: COMMENTS.chipColumn,
  indent: COMMENTS.cardIndent,
  headGap: 10,
  /** Day tag. */
  tagHeight: 22,
  tagPad: 8,
  tagRadius: radius.chip,
  /** Between nodes: History 14, the others 18. */
  historyGap: 14,
  nodeGap: 18,
  /** History's cover and play dot; Likes' cover and dot. */
  cover: 44,
  coverRadius: radius.small,
  playDot: 34,
  likeCover: 52,
  /** The tick circle of select mode: 24, 34 left of the card, 20 down. */
  tick: 24,
  tickLeft: -34,
  tickTop: 20,
  /** The search field. */
  field: 48,
  fieldRadius: radius.input,
  /** A deck's card, and the dots under it. */
  deckWidth: 290,
  deckGap: 10,
  dotsTop: 20,
  dot: 6,
  dotOn: 18,
  dotHeight: 4,
  /** The empty spine (a grey line with nothing hung on it): left 40, 300 tall, 60 under the top of the phone. */
  emptySpineTop: 60,
  emptySpineHeight: 300,
  /** The empty block sits 300 under the top of the phone. */
  emptyBlockTop: 300,
} as const;

/** The status bar the drawing assumes (50) and where its lists start (56): everything below is measured from the status bar. */
export const DRAWN = { status: 50, listTop: 56 } as const;

/** Where an empty block drawn `drawnTop` from the top of the phone sits under the top of a list (56 on the drawing). */
export function emptyTop(drawnTop: number): number {
  return drawnTop - DRAWN.listTop;
}

/** "now", "5m", "4h", "3d" for the first week, then the date: what sits at the right of a card's foot. */
export function ageLabel(createdAtMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - createdAtMs) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return shortDate(createdAtMs);
}

/** The list's paddings for a thread: 10 / 20 / reserve / 18. */
export function threadPad(reserve: number): { paddingTop: number; paddingLeft: number; paddingRight: number; paddingBottom: number } {
  return { paddingTop: LIST.top, paddingLeft: LIST.left, paddingRight: LIST.right, paddingBottom: reserve };
}

/** The spine, drawn behind a list: fixed over the page (a list that pages has no container to hang it from), `top` under the status bar. */
export function ThreadSpine(props: { top: number }): React.ReactElement {
  return (
    <Box className="absolute left-0 right-0 bottom-0" style={{ top: props.top }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" testID="thread-spine">
      <SpineLine />
    </Box>
  );
}

/** The empty page's spine: a grey line, nothing hung on it. */
export function EmptySpine(props: { top: number; height?: number }): React.ReactElement {
  return (
    <Box
      testID="empty-spine"
      className="absolute bg-line"
      style={{ left: COMMENTS.spineX, top: props.top, height: props.height ?? LIST.emptySpineHeight, width: COMMENTS.spineWidth }}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** One node of a thread: the head (chip or avatar in the 46 column, then a label) over the card. `head` replaces the whole head row (Likes' tappable person). */
export function ThreadNode(props: { lead?: ReactNode; label?: ReactNode; head?: ReactNode; /** The lead is as wide as its text, from the column's left edge (History's day tags: EARLIER THIS WEEK is 128 wide, drawn 38 → 166). */ grow?: boolean; children: ReactNode }): React.ReactElement {
  return (
    <Box testID="thread-node" style={{ gap: LIST.headGap - 2 }}>
      {props.head ?? (
        <Box className="flex-row items-center" style={{ gap: LIST.headGap }}>
          {props.grow === true ? (
            <Box testID="thread-lead" style={{ minWidth: LIST.column, alignItems: 'flex-start', zIndex: 2 }}><Box style={{ flexShrink: 0 }}>{props.lead}</Box></Box>
          ) : (
            <Box testID="thread-lead" className="items-center" style={{ width: LIST.column, zIndex: 2 }}><Box>{props.lead}</Box></Box>
          )}
          {props.label}
        </Box>
      )}
      <Box style={{ marginLeft: LIST.indent }}>{props.children}</Box>
    </Box>
  );
}

/** The raise card of a node. */
export function ThreadCard(props: { children: ReactNode; testID?: string }): React.ReactElement {
  return (
    <Box testID={props.testID ?? 'thread-card'} className="bg-raise" style={{ borderRadius: LIST.cardRadius, padding: LIST.cardPad, gap: LIST.cardGap }}>
      {props.children}
    </Box>
  );
}

/** The light day tag on the spine (History): TODAY, YESTERDAY, EARLIER THIS WEEK, EARLIER. */
export function DayTag(props: { text: string }): React.ReactElement {
  return (
    <Box testID="day-tag" className="bg-text" style={{ height: LIST.tagHeight, paddingHorizontal: LIST.tagPad, borderRadius: LIST.tagRadius, justifyContent: 'center' }}>
      <Type step="mono" className="text-void font-semibold" style={ME_TYPE.dayTag} numberOfLines={1} accessibilityRole="header">{props.text.toUpperCase()}</Type>
    </Box>
  );
}

/** The light play dot of a card: a text-fill circle with a void play glyph (0.4 of the circle). */
export function PlayDot(props: { size: number }): React.ReactElement {
  return (
    <Box testID="play-dot" className="bg-text items-center justify-center" style={{ width: props.size, height: props.size, borderRadius: props.size / 2, paddingLeft: 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Icon name="play" size={Math.round(props.size * 0.4)} color={colour.void} />
    </Box>
  );
}

/**
 * The played curve of a history row: 40 bars, 12 tall, `played` of 40 lit hot to violet. History keeps no per-episode heat,
 * so the bars are an even curve (a progress meter); the drawing's bars are the episode's heat.
 */
const EVEN = Array.from({ length: 100 }, () => 0.5);
export function PlayedBars(props: { share: number }): React.ReactElement {
  return <Curve data={EVEN} count={40} height={12} min={2} played={props.share} />;
}

/** The search field a title-bar search circle opens: 48 tall, raise2, a magnifier and the typed words. */
export function SearchField(props: { value: string; onChange: (t: string) => void; placeholder: string; autoFocus?: boolean }): React.ReactElement {
  return (
    <Box testID="search-field" className="flex-row items-center bg-raise2" style={{ height: LIST.field, borderRadius: LIST.fieldRadius, paddingHorizontal: spacing.row + 2, gap: spacing.row - 2 }}>
      <Icon name="search-outline" size={20} color={colour.text3} />
      <Input className="flex-1 border-0 h-auto w-auto" style={{ paddingHorizontal: 0 }}>
        <InputField
          value={props.value}
          onChangeText={props.onChange}
          placeholder={props.placeholder}
          placeholderTextColor={colour.text3}
          autoCorrect={false}
          autoFocus={props.autoFocus === true}
          accessibilityLabel={props.placeholder}
          returnKeyType="search"
          className="text-text text-pulse-row font-medium" style={{ paddingVertical: 0 }}
        />
      </Input>
    </Box>
  );
}

/** The empty block of a page: the flat curve, a title and a line (and a button), as `PK.empty`. A line left out draws no line. */
export function PageEmpty(props: { title: string; line?: string; top: number; action?: { label: string; onPress: () => void }; children?: ReactNode }): React.ReactElement {
  return (
    <Box style={{ marginTop: props.top, paddingHorizontal: gutter(useWindowDimensions().width) }} testID="page-empty">
      <Box className="items-center" style={{ gap: spacing.gap + 2, paddingHorizontal: spacing.block, paddingVertical: spacing.gap + 2 }}>
        <Box style={{ width: 200 }} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={[]} count={40} height={20} min={20} flat /></Box>
        <Box className="items-center" style={{ gap: spacing.gap + 2 }} accessible accessibilityLabel={props.line ? `${props.title} ${props.line}` : props.title}>
          <Type step="lede" className="text-text font-bold text-center">{props.title}</Type>
          {props.line ? <Type step="note" className="text-text2 text-center">{props.line}</Type> : null}
        </Box>
        {props.action ? <Box style={{ marginTop: spacing.hair + 2 }}><PulseButton label={props.action.label} kind="light" onPress={props.action.onPress} /></Box> : null}
        {props.children}
      </Box>
    </Box>
  );
}

/** A tile in a mosaic: the cover fills it, a fade to void at the foot, the words low. `tall` is the 2-row, `wide` the 2-column one. */
export function ArtTile(props: { url?: string | null; name: string; width: number; height: number; children: ReactNode; /** Drawn in the top right corner (Favourites' star). */ corner?: ReactNode; testID?: string }): React.ReactElement {
  const tone = coverTone(props.name);
  const mark = coverLetters(props.name);
  return (
    <Box
      testID={props.testID ?? 'art-tile'}
      className="overflow-hidden bg-raise"
      style={{ width: props.width, height: props.height, borderRadius: ME_MOSAIC.radius, backgroundColor: tone.fill }}
    >
      {mark ? <Text className="text-text font-bold absolute" style={[drawnType.coverMark, { left: spacing.row, top: spacing.row, color: tone.ink }]} numberOfLines={1} accessible={false}>{mark}</Text> : null}
      {props.url ? <Image source={{ uri: thumbUrl(props.url, props.width) }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
      <LinearGradient
        colors={[colour.clear, colour.pickFoot]}
        locations={[0.2, 1]}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      />
      {props.corner ? <Box className="absolute" style={{ right: spacing.gap + 2, top: spacing.gap + 2 }} accessible={false} importantForAccessibility="no-hide-descendants">{props.corner}</Box> : null}
      <Box className="absolute" style={{ left: spacing.row, right: spacing.row, bottom: spacing.gap + 2, gap: 3 }}>{props.children}</Box>
    </Box>
  );
}

/** The width of one of the mosaic's two columns in a window: between the 28 lane and the 16 right margin, 10 apart. */
export function mosaicColumn(windowWidth: number): number {
  return Math.floor((windowWidth - ME_MOSAIC.lane - ME_MOSAIC.right - ME_MOSAIC.gap) / 2);
}

/** The row of dots under a deck: the current card's is 18 wide and light, the rest 6 wide and grey. */
export function PageDots(props: { count: number; index: number }): React.ReactElement | null {
  if (props.count < 2) return null;
  return (
    <Box testID="page-dots" className="flex-row" style={{ gap: 6 }} accessible={false} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: props.count }, (_, k) => (
        <Box key={k} style={{ width: k === props.index ? LIST.dotOn : LIST.dot, height: LIST.dotHeight, borderRadius: 2, backgroundColor: k === props.index ? colour.text : player.emptyInk }} />
      ))}
    </Box>
  );
}

/**
 * A deck of `count` cards, each `LIST.deckWidth` wide and `height` tall, 10 apart, the first at the gutter, snapping one at a
 * time, with the dots under it. `children(i)` draws card `i`.
 */
export function CardDeck(props: { count: number; height: number; card: (index: number) => ReactNode; label?: string }): React.ReactElement {
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const [at, setAt] = useState(0);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const step = LIST.deckWidth + LIST.deckGap;
  // A card removed or moved leaves the dots on a card that is there.
  useEffect(() => { if (at > props.count - 1) setAt(Math.max(0, props.count - 1)); }, [props.count, at]);
  return (
    <Box>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        testID="card-deck"
        {...(props.label ? { accessibilityLabel: props.label } : {})}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) => setAt(Math.max(0, Math.min(props.count - 1, Math.round(e.nativeEvent.contentOffset.x / step))))}
        style={{ height: props.height, flexGrow: 0 }}
        contentContainerStyle={{ paddingLeft: side, paddingRight: side - spacing.hair, gap: LIST.deckGap }}
      >
        {Array.from({ length: props.count }, (_, i) => (
          <Box key={i} style={{ width: LIST.deckWidth, height: props.height }}>{props.card(i)}</Box>
        ))}
      </ScrollView>
      <Box style={{ marginTop: LIST.dotsTop, marginLeft: side }}><PageDots count={props.count} index={at} /></Box>
    </Box>
  );
}

/** A round tool on a card (edit, delete, move, remove): the raise disc the drawing's `ibtn fill` is, `size` wide (36 or 40). */
export function round(size: number): { width: number; height: number; borderRadius: number } {
  return { width: size, height: size, borderRadius: size / 2 };
}

/** A tool's touch slop: it is drawn 36–40 and touched 48. */
export function slop(size: number): number {
  return Math.ceil((48 - size) / 2);
}

/**
 * The two-way switch of a page's foot (`shell.html` `seg`): a 44 track — raise, a 1 line, 3 of padding and 3 between — and
 * choices 36 tall (radius 18, drawn Geist 600 13); the chosen one is the light fill with void words in 700. Spoken as tabs;
 * the choice reaches 48 to touch by `hitSlop`.
 */
export function SegmentSwitch<T extends string>(props: { items: readonly { value: T; label: string; accessibilityLabel?: string }[]; value: T; onChange: (v: T) => void; /** The roomier track of Listening data (`seg` in discover.html): 4 of padding and 4 between, 46 tall. */ roomy?: boolean }): React.ReactElement {
  const pad = props.roomy ? 4 : 3;
  return (
    <Box testID="segment-switch" accessibilityRole="tablist" className="flex-row bg-raise border border-line" style={{ height: props.roomy ? 46 : 44, borderRadius: 22, padding: pad, gap: pad }}>
      {props.items.map((it) => {
        const on = it.value === props.value;
        return (
          <Pressable
            key={it.value}
            onPress={() => props.onChange(it.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.accessibilityLabel ?? it.label}
            hitSlop={{ top: 6, bottom: 6 }}
            className={`flex-1 items-center justify-center ${on ? 'bg-text' : ''}`}
            style={{ height: 36, borderRadius: 18 }}
          >
            <Type step="caption" className={on ? 'text-void font-bold' : 'text-text2 font-semibold'} numberOfLines={1}>{it.label}</Type>
          </Pressable>
        );
      })}
    </Box>
  );
}

/** A tilted tile with a glyph and a hot glow, the picture of an empty Stage (`glowTile` in shell.html). */
export function GlowTile(props: { icon: React.ComponentProps<typeof Icon>['name']; size: number; rotate?: number }): React.ReactElement {
  return (
    <LinearGradient
      testID="glow-tile"
      colors={[colour.hot, colour.violet]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: props.size, height: props.size, borderRadius: Math.round(props.size * 0.26), alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${props.rotate ?? 0}deg` }], shadowColor: glow.cover.color, shadowOpacity: 0.45, shadowRadius: glow.cover.radius, shadowOffset: { width: 0, height: 0 } }}
    >
      <Icon name={props.icon} size={Math.round(props.size * 0.42)} color={colour.void} />
    </LinearGradient>
  );
}

/**
 * A page with a field at its foot (a search, a name): the whole page rides above the keyboard on iOS (padding) and Android
 * (its window resizes), so the title bar and the field the thumb is typing in stay in sight.
 */
export function KeyboardPage(props: { children: ReactNode }): React.ReactElement {
  return (
    <KeyboardAvoidingView className="flex-1 bg-void" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {props.children}
    </KeyboardAvoidingView>
  );
}
