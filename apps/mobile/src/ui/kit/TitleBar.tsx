// The title bar: a screen's title, back button and actions in the thumb zone at the bottom.
/**
 * M31 T022 (layout rule 1; design-pulse2 index.html §Bars, `kit.js` `titlebar`): the title, the
 * subtitle, the back button and the main actions sit low, 8 above whichever bar is highest — the
 * now bar when it shows, else the tab bar, else (a pushed page) 8 above the safe area.
 * `bottom` is that distance from the screen's bottom edge: `titleBarBottom(safe, { tabs, now })`
 * in src/design/tokens.ts (100 with a tab bar, 168 with a now bar too, 40 on a pushed page).
 *
 * Side padding is the gutter (20, or 16 on a phone narrower than 375). Back: a 44 circle, raise
 * fill, chevron 22. Title: Unbounded 800 30 (−1 %), up to 2 lines, 3 at large text; once the
 * page scrolls (`shrunk`) it shrinks to 20 on one line over 240 ms. The line height is the font's
 * own (38 and 25) where the drawing's 31 and 21 would crop Unbounded on Android — see `FACE_LEADING`. Subtitle: Geist 500 13/18 in
 * text2 — or, with `onSubtitle`, a hot-text link ("My subscriptions · 6 ›"). Actions: up to two
 * 44 raise circles on the right. `extra` sits above the row (a search field). Content scrolls
 * under a `Fade`; `onTitle` makes the title a link (T033, Me); the back gesture from the left edge still works. The title is the screen's header
 * for a screen reader and keeps its full name even when the lines are cut.
 */
import { useEffect, useState } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useFace } from '@/ui/lib/text';
import { bars, colour, gutter, motion, spacing, typeScale, type TypeName } from '@/design';
import { FACE_LEADING } from '@/design/tokens';
import { IconButton } from './PulseButton';
import { Type, TYPE_CAP } from './Type';
import type { IconName } from './Icon';
import { useReducedMotion } from './useReducedMotion';

export type TitleAction = { icon: IconName; label: string; onPress: () => void };

const BIG: TypeName = 'hero';
const LARGE_TEXT = 1.3;
/** M31 F9: a word this long ("subscriptions") cannot sit beside two circles, so a title holding one runs under them too (it was cut to "My subscrip…"). */
const LONG_WORD = 10;
const longestWord = (t: string): number => Math.max(0, ...t.split(/\s+/).map((w) => w.length));
/** F10: the title's cap (the drawn 30 would be 60 at 200 %) and the one-word title's shrink-to-fit. */
const FIT = { adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const;
const SUB = { marginTop: bars.titleSub };
/** A title link is one line tall (38), so it gets touch room to reach 48. */
const TITLE_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

export function TitleBar(props: {
  title: string;
  subtitle?: string;
  /** Makes the subtitle a hot-text link. */
  onSubtitle?: () => void;
  /** M31 W6-A: how many lines the subtitle may take (2 by default; Wallet's store sentence is three lines, drawn whole). */
  subtitleLines?: number;
  /** Makes the title itself a link (Me: your name opens your profile; "Sign in ›" opens sign-in). */
  onTitle?: () => void;
  /** The spoken name of a title link when it says more than the title ("Ana, open your profile"). */
  titleLabel?: string;
  onBack?: () => void;
  backLabel?: string;
  /** M31 W3-B: the back circle's glyph — a chevron by default, a × on a page that is closed rather than left (Voice status). */
  backIcon?: IconName;
  /** M31 W3-B: a control at the row's end instead of the circles (the voice page's hot Post pill). */
  right?: React.ReactNode;
  /** Up to two. */
  actions?: readonly TitleAction[];
  /** Distance from the screen's bottom edge to this bar's bottom. */
  bottom: number;
  /** The page has scrolled: shrink the title to 20 on one line. */
  shrunk?: boolean;
  /** M31 W3-C: the drawn size of a long title (History is drawn at 26, Favourites at 28); 30 by default. Its line is the font's own. */
  size?: number;
  /** Drawn above the row, e.g. the Discover search field. */
  extra?: React.ReactNode;
}): React.ReactElement {
  const { width, fontScale } = useWindowDimensions();
  const still = useReducedMotion();
  const face = useFace(`${typeScale[BIG].cls}`);
  const shrunk = props.shrunk === true;
  const [t] = useState(() => new Animated.Value(shrunk ? 1 : 0));
  useEffect(() => {
    if (still) { t.setValue(shrunk ? 1 : 0); return; }
    Animated.timing(t, { toValue: shrunk ? 1 : 0, duration: motion.move, useNativeDriver: false }).start();
  }, [shrunk, still, t]);
  const drawn = props.size ?? typeScale.hero.size;
  const drawnLine = props.size === undefined ? typeScale.hero.lineSafe : Math.ceil(props.size * FACE_LEADING.display);
  const tracking = props.size === undefined ? typeScale.hero.tracking : drawn * -0.01;
  const size = t.interpolate({ inputRange: [0, 1], outputRange: [drawn, typeScale.heading.size] });
  const line = t.interpolate({ inputRange: [0, 1], outputRange: [drawnLine, typeScale.heading.lineSafe] });
  // M31 F10: a title of one word cannot break between words, so it takes one line and shrinks to fit ("Commen / ts" at 200 %).
  const oneWord = !/\s/.test(props.title.trim());
  const lines = shrunk || oneWord ? 1 : fontScale > LARGE_TEXT ? 3 : 2;
  const fit = oneWord && !shrunk ? FIT : undefined;
  const actions = (props.actions ?? []).slice(0, 2);
  const reach = props.right === undefined && actions.length > 0 && (!/\s/.test(props.title) || longestWord(props.title) >= LONG_WORD) ? -(actions.length * (bars.circle + spacing.row)) : 0;
  return (
    <Box className="absolute left-0 right-0 gap-gap" style={{ bottom: props.bottom, paddingHorizontal: gutter(width), zIndex: 20 }}>
      {props.extra}
      <Box className="flex-row items-end gap-row">
        {props.onBack ? <IconButton icon={props.backIcon ?? 'chevron-back'} label={props.backLabel ?? 'Back'} onPress={props.onBack} fill size={22} /> : null}
        <Box className="flex-1">
          {/* F3 (design-pulse2 `downloads`): a title that is one word cannot break, so it runs on under the action circles (they are drawn over its end) instead of wrapping into letters ("Downloa / ds"). */}
          <Box testID="title-bar-title" style={{ marginRight: reach }}>
          {props.onTitle ? (
            <Pressable onPress={props.onTitle} accessibilityRole="link" accessibilityLabel={props.titleLabel ?? props.title} hitSlop={TITLE_SLOP} className="self-start max-w-full">
              <Animated.Text numberOfLines={lines} maxFontSizeMultiplier={TYPE_CAP} {...fit} style={[face, { color: colour.text, fontSize: size, lineHeight: line, letterSpacing: tracking }]}>
                {props.title}
              </Animated.Text>
            </Pressable>
          ) : (
            <Animated.Text
              accessibilityRole="header"
              accessibilityLabel={props.title}
              numberOfLines={lines}
              maxFontSizeMultiplier={TYPE_CAP}
              {...fit}
              style={[face, { color: colour.text, fontSize: size, lineHeight: line, letterSpacing: tracking }]}
            >
              {props.title}
            </Animated.Text>
          )}
          </Box>
          {props.subtitle ? (
            props.onSubtitle ? (
              <Pressable onPress={props.onSubtitle} accessibilityRole="link" accessibilityLabel={props.subtitle} hitSlop={13} className="self-start" style={SUB}>
                <Type step="caption" className="text-hotText font-semibold" numberOfLines={1}>{props.subtitle}</Type>
              </Pressable>
            ) : (
              <Type step="caption" className="text-text2" style={SUB} numberOfLines={props.subtitleLines ?? 2}>{props.subtitle}</Type>
            )
          ) : null}
        </Box>
        {props.right ?? actions.map((a) => <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} fill />)}
      </Box>
    </Box>
  );
}
