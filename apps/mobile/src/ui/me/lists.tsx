// The parts the Me tab's list pages share: a card, the play dot, the search field, the empty block, the two-way switch, a mosaic tile.
/**
 * M31 W3-C (T041), restyled by spec 039 I2 (design B, the 038 tokens). The thread parts (the comments spine, a node's 46 column and its card 56 in), the page dots and
 * the card deck were drawn by pages that now sit on `Page`/`PageList` with a `Section` per day and a `Shelf` for sideways cards; nothing draws them, and they are
 * deleted with their tests. What stays:
 *
 *  - `ThreadCard`: a raise card, radius 16 (`radius.row`), padding 16 (`spacing.section`), 8 between its parts.
 *  - `DayTag` and `PlayedBars` (History's light day tag and its played curve), `PlayDot`, `SearchField` (48 tall, raise2, radius 16), `ArtTile` (a cover with a fade to void and the words low), `GlowTile`, `round`, `slop`, `KeyboardPage`.
 *  - `PageEmpty`: the empty block of a page: the flat curve, a title and a line (and a button).
 *  - `SegmentSwitch`: the track of a page's head: a pill track 46 tall (raise, a 1 line, 4 of padding and 4 between), pill choices 36 tall.
 *
 * Sizes are styles, not classes: the token check reads class names; every radius and space is a 038 token.
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { KeyboardAvoidingView } from '@/ui/lib/keyboard-avoiding-view';
import { Input, InputField } from '@/ui/lib/input';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { LinearGradient } from '@/design/tailwind';
import { colour, glow, gutter, radius, spacing } from '@/design';
import { coverLetters, coverTone } from '@socialmorning/social-core';
import { Icon } from '@/ui/kit/Icon';
import { thumbUrl } from '@/ui/kit/Artwork';
import { shortDate } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Text } from '@/ui/kit/Text';
import { Curve } from '@/ui/kit/Curve';
import { Pressable } from '@/ui/lib/pressable';
import { ME_TYPE } from './measures';
import { drawnType } from '@/design/type-px';

/** The numbers of a card and the search field (038 tokens). */
export const LIST = {
  /** A card: raise, radius 16, padding 16, 8 between parts. */
  cardRadius: radius.row,
  cardPad: spacing.section,
  cardGap: spacing.gap,
  /** The gap between the parts of a card's head (cover, words, play). */
  headGap: spacing.row,
  /** A cover in a card, its corner and the play dot. */
  cover: 44,
  coverRadius: radius.chip,
  playDot: 34,
  likeCover: 52,
  /** Day tag (History): 22 tall, 8 of padding, the chip radius. */
  tagHeight: 22,
  tagPad: spacing.gap,
  tagRadius: radius.chip,
  /** The tick circle of select mode (History): 24, 34 left of the card, 20 down. */
  tick: 24,
  tickLeft: -34,
  tickTop: 20,
  /** The search field. */
  field: 48,
  fieldRadius: radius.row,
} as const;

/** "now", "5m", "4h", "3d" for the first week, then the date: what sits at the right of a card's foot. */
export function ageLabel(createdAtMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - createdAtMs) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return shortDate(createdAtMs);
}

/** A raise card. */
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
    <Box testID="search-field" className="flex-row items-center bg-raise2" style={{ height: LIST.field, borderRadius: LIST.fieldRadius, paddingHorizontal: spacing.row, gap: spacing.gap }}>
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
      <Box className="items-center" style={{ gap: spacing.row, paddingHorizontal: spacing.block, paddingVertical: spacing.gap }}>
        <Box style={{ width: 200 }} accessible={false} importantForAccessibility="no-hide-descendants"><Curve data={[]} count={40} height={20} min={20} flat /></Box>
        <Box className="items-center" style={{ gap: spacing.gap }} accessible accessibilityLabel={props.line ? `${props.title} ${props.line}` : props.title}>
          <Type step="heading" className="text-text text-center">{props.title}</Type>
          {props.line ? <Type step="body" className="text-text2 text-center">{props.line}</Type> : null}
        </Box>
        {props.action ? <Box style={{ marginTop: spacing.gap }}><PulseButton label={props.action.label} kind="light" onPress={props.action.onPress} /></Box> : null}
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
      style={{ width: props.width, height: props.height, borderRadius: radius.card, backgroundColor: tone.fill }}
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

/** A round tool on a card (edit, delete, move, remove): the raise disc the drawing's `ibtn fill` is, `size` wide (36 or 40). */
export function round(size: number): { width: number; height: number; borderRadius: number } {
  return { width: size, height: size, borderRadius: size / 2 };
}

/** A tool's touch slop: it is drawn 36–40 and touched 48. */
export function slop(size: number): number {
  return Math.ceil((48 - size) / 2);
}

/**
 * The switch of a page's head (`shell.html` `seg`, 039 I2 on the 038 tokens): a pill track with a 1 line, `spacing.hair` of padding and between, and pill
 * choices 36 tall; the chosen one is the light fill with void words in 700. Spoken as tabs; the choice reaches 48 to touch by `hitSlop`.
 * `roomy` (Listening data and the Charts asked for the taller track) is accepted and no longer changes the size: there is one track.
 */
export function SegmentSwitch<T extends string>(props: { items: readonly { value: T; label: string; accessibilityLabel?: string }[]; value: T; onChange: (v: T) => void; roomy?: boolean }): React.ReactElement {
  return (
    <Box testID="segment-switch" accessibilityRole="tablist" className="flex-row bg-raise border border-line" style={{ height: 46, borderRadius: radius.pill, padding: spacing.hair, gap: spacing.hair }}>
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
            style={{ height: 36, borderRadius: radius.pill }}
          >
            <Type step="small" className={on ? 'text-void font-bold' : 'text-text2 font-semibold'} numberOfLines={1}>{it.label}</Type>
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
