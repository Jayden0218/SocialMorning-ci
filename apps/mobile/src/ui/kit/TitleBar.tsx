// The title bar: Back and the actions in a row under the status bar, the large title and its subtitle under that row.
/**
 * 037 (option B, https://claude.ai/artifact/J7HKbsiAZoDFyypLbY9G9E; was M31 T022 "bottom title bars"): the bar is placed from the TOP —
 * `top` is `titleBarTop(safeTop)` in src/design/tokens.ts (the safe area plus 6). One row of 44 holds Back on the left and up to two
 * action circles (or a `right` control) on the right; under it sit the title (Unbounded 800 30 (−1 %), up to 2 lines, 3 at large text) and
 * the subtitle (Geist 500 13/18 in text2 — or, with `onSubtitle`, a hot-text link), then `extra` (a search field). Once the page scrolls
 * (`shrunk`) the title moves INTO the row at 20 on one line over 240 ms (instant under Reduce Motion) and the subtitle goes. The line
 * height is the font's own (38 and 25) where the drawing's 31 and 21 would crop Unbounded on Android — see `FACE_LEADING`.
 * Content scrolls under a `Fade` at the top edge; `onTitle` makes the title a link (T033, Me); the back gesture from the left edge still
 * works. The title is the screen's header for a screen reader and keeps its full name even when the lines are cut.
 */
import { useEffect, useState } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useFace } from '@/ui/lib/text';
import { bars, colour, gutter, motion, typeScale, type TypeName } from '@/design';
import { FACE_LEADING } from '@/design/tokens';
import { IconButton } from './PulseButton';
import { Type, TYPE_CAP } from './Type';
import type { IconName } from './Icon';
import { useReducedMotion } from './useReducedMotion';

export type TitleAction = { icon: IconName; label: string; onPress: () => void };

const BIG: TypeName = 'hero';
const LARGE_TEXT = 1.3;
/** M31 F9 / 036 E5: a word this long ("subscriptions") at large text keeps to two lines and shrinks to fit. */
const LONG_WORD = 10;
const longestWord = (t: string): number => Math.max(0, ...t.split(/\s+/).map((w) => w.length));
/** F10: the title's cap (the drawn 30 would be 60 at 200 %) and the one-word title's shrink-to-fit. */
const FIT = { adjustsFontSizeToFit: true, minimumFontScale: 0.6 } as const;
const SUB = { marginTop: bars.titleSub };
/** 036 T015: a title link or a subtitle link is one text line (38, 18); its frame is 44 (the frame is what is read, `hitSlop` is not in it) and a negative margin of the difference keeps the bar as drawn. */
const slack = (line: number): number => -Math.max(0, (bars.circle - line) / 2);
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
  /** Distance from the screen's top edge to this bar's top: `titleBarTop(safeTop)`. */
  top: number;
  /** The page has scrolled: shrink the title to 20 on one line. */
  shrunk?: boolean;
  /** M31 W3-C: the drawn size of a long title (History is drawn at 26, Favourites at 28); 30 by default. Its line is the font's own. */
  size?: number;
  /** Drawn under the title, e.g. the Discover search field. */
  extra?: React.ReactNode;
}): React.ReactElement {
  const { width, fontScale } = useWindowDimensions();
  const still = useReducedMotion();
  const face = useFace(`${typeScale[BIG].cls}`);
  const shrunk = props.shrunk === true;
  const [titleLine, setTitleLine] = useState(0);
  const [subLine, setSubLine] = useState<number>(typeScale.caption.lineSafe);
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
  const longWordLarge = fontScale > LARGE_TEXT && longestWord(props.title) >= LONG_WORD;
  // 036 E5: a title with a long word at large text keeps to two lines: with three, "subscription / s" fits and nothing shrinks, so the word broke mid-way.
  const lines = shrunk || oneWord ? 1 : fontScale > LARGE_TEXT && !longWordLarge ? 3 : 2;
  const fit = (oneWord || longWordLarge) && !shrunk ? FIT : undefined;
  const actions = (props.actions ?? []).slice(0, 2);
  // 037: the title sits under the row at the full width, so it never has to run on under the circles; shrunk, it shares the row and fits to one line.
  const fitted = shrunk ? FIT : fit;
  const titleEl = props.onTitle ? (
    <Pressable onPress={props.onTitle} accessibilityRole="link" accessibilityLabel={props.titleLabel ?? props.title} hitSlop={TITLE_SLOP} className="self-start max-w-full" style={{ minHeight: bars.circle, marginVertical: slack(titleLine > 0 ? titleLine : drawnLine), justifyContent: 'center' }}>
      <Animated.Text onLayout={(e) => setTitleLine(e.nativeEvent.layout.height)} numberOfLines={lines} maxFontSizeMultiplier={TYPE_CAP} {...fitted} style={[face, { color: colour.text, fontSize: size, lineHeight: line, letterSpacing: tracking }]}>
        {props.title}
      </Animated.Text>
    </Pressable>
  ) : (
    <Animated.Text
      accessibilityRole="header"
      accessibilityLabel={props.title}
      numberOfLines={lines}
      maxFontSizeMultiplier={TYPE_CAP}
      {...fitted}
      style={[face, { color: colour.text, fontSize: size, lineHeight: line, letterSpacing: tracking }]}
    >
      {props.title}
    </Animated.Text>
  );
  return (
    <Box testID="title-bar" className="absolute left-0 right-0" style={{ top: props.top, paddingHorizontal: gutter(width), zIndex: 20 }}>
      <Box testID="title-bar-row" className="flex-row items-center gap-row" style={{ minHeight: bars.circle }}>
        {props.onBack ? <IconButton icon={props.backIcon ?? 'chevron-back'} label={props.backLabel ?? 'Back'} onPress={props.onBack} fill size={22} /> : null}
        {shrunk ? <Box testID="title-bar-title" className="flex-1">{titleEl}</Box> : <Box className="flex-1" />}
        {props.right ?? actions.map((a) => <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} fill />)}
      </Box>
      {shrunk ? null : (
        <Box className="gap-gap" style={{ marginTop: bars.titleTop }}>
          <Box>
            <Box testID="title-bar-title">{titleEl}</Box>
            {props.subtitle ? (
              props.onSubtitle ? (
                <Pressable onPress={props.onSubtitle} accessibilityRole="link" accessibilityLabel={props.subtitle} hitSlop={13} className="self-start" style={{ minHeight: bars.circle, justifyContent: 'center', marginTop: bars.titleSub + slack(subLine), marginBottom: slack(subLine) }}>
                  <Type step="caption" className="text-hotText font-semibold" numberOfLines={1} onLayout={(e) => setSubLine(e.nativeEvent.layout.height)}>{props.subtitle}</Type>
                </Pressable>
              ) : (
                <Type step="caption" className="text-text2" style={SUB} numberOfLines={props.subtitleLines ?? 2}>{props.subtitle}</Type>
              )
            ) : null}
          </Box>
          {props.extra}
        </Box>
      )}
      {shrunk ? props.extra : null}
    </Box>
  );
}
