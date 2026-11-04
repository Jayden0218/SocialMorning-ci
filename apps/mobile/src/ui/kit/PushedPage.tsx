// A pushed page in the Pulse shape: the glow, the content, a fade, and the title bar at the top (037, option B).
/**
 * M31 W3-B (design-pulse2 `listen.html` `pushed({ title, sub, actions, now, content, stage })`), moved to the top by spec 037 (option B,
 * https://claude.ai/artifact/J7HKbsiAZoDFyypLbY9G9E): the stage (the two-colour glow) behind everything, the page's content on top, a `Fade` of
 * the page colour at the TOP edge, and the `TitleBar` — Back and up to two circles in a row under the status bar, the title and subtitle under
 * the row. The content starts under that block (`top`) and its foot leaves room for the bars only (`reserve`).
 * Whether the now bar shows is the toast placement's rule (`toastPlacement`: `miniPlayerShows`, Moments), so a page, its toast and the bar agree.
 *
 * `children` is the content; give it a function to learn the page's measures: where the content starts (`top`, under the title block and
 * any `extra`), where the title bar sits (`titleTop`), the foot zone above the bars (`titleBottom`: what the `below` slot and a page's own
 * foot row stand on; the name is the old bottom title's) and how much room the last row must leave (`reserve`).
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { useWindowDimensions } from 'react-native';
import { bars, barsReserve, contentTopReserve, gutter, nowBarBottom, titleBarTop } from '@/design';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { Fade, topFade } from './Fade';
import { liftedBottom, useKeyboardHeight } from './useKeyboardHeight';
import { PageGlow, type GlowTone } from './PageGlow';
import { goBack } from './PageHeader';
import type { IconName } from './Icon';
import { TitleBar, type TitleAction } from './TitleBar';

/** Between the foot slot and what is drawn above it (`low()` in shell.html). */
const BELOW_GAP = 12;

export type PushedLayout = {
  /** Where the content starts: under the status bar, the title block and any `extra`. */
  top: number;
  /** 037: where the title bar's top sits (`titleBarTop`). */
  titleTop: number;
  /** Distance from the screen's bottom edge to the foot zone's bottom: what the `below` slot stands on (it clears the now bar when it shows). */
  titleBottom: number;
  /** Room the content leaves at its foot. */
  reserve: number;
};

/** Pure: where the title bar and the content sit on a pushed page, with or without the now bar. `extraAbove` is the height of a field under the title; `lift` the height of a `below` slot at the foot. */
export function pushedLayout(safeTop: number, now: boolean, extraAbove = 0, lift = 0, bare = false): PushedLayout {
  // The root layout pads the bottom inset once (guard G-T1), so the bars are measured from the page's own foot.
  const titleBottom = nowBarBottom(0) + (now ? bars.now + bars.titleAboveNow : 0);
  return {
    // A `bare` page draws no title bar (it has its own header or none), so nothing is reserved at its top.
    top: bare ? safeTop + extraAbove : titleBarTop(safeTop) + contentTopReserve() + extraAbove,
    titleTop: titleBarTop(safeTop),
    titleBottom,
    reserve: lift > 0 ? titleBottom + lift + bars.sheetGap : barsReserve({ now }),
  };
}

/** Between the keyboard's top and a foot slot riding above it. */
const KEYBOARD_GAP = 8;

export function usePushedLayout(extraAbove = 0, over?: { now?: boolean; safeBottom?: number; lift?: number; bare?: boolean }): PushedLayout {
  const insets = useContext(SafeAreaInsetsContext);
  const placed = useToastPlacement();
  const keyboard = useKeyboardHeight();
  const l = pushedLayout(insets?.top ?? 0, over?.now ?? placed.now, extraAbove, over?.lift ?? 0, over?.bare ?? false);
  // A page outside the root's padding (a modal route) pads the home strip itself.
  const padded = over?.safeBottom ? { ...l, titleBottom: l.titleBottom + over.safeBottom, reserve: l.reserve + over.safeBottom } : l;
  if (keyboard <= 0) return padded;
  // 035 B2, kept for the foot only (037): while the keyboard is up the `below` slot (a foot composer or button) rides above it. The title bar is at the
  // top and never moves. The page's foot is the padded home strip above the screen's edge, except on a modal route that pads itself (then the foot IS the edge).
  const strip = over?.safeBottom ? 0 : (insets?.bottom ?? 0);
  const titleBottom = liftedBottom(padded.titleBottom, keyboard, strip, KEYBOARD_GAP);
  return { ...padded, titleBottom, reserve: padded.reserve + (titleBottom - padded.titleBottom) };
}

export function PushedPage(props: {
  title: string;
  subtitle?: string;
  onSubtitle?: () => void;
  /** The subtitle's line limit when the drawing sets a longer one (Wallet's store sentence). */
  subtitleLines?: number;
  actions?: readonly TitleAction[];
  /** Replaces the default back (history back, or the first page when a link opened this one). `null` shows no back circle. */
  onBack?: (() => void) | null;
  backLabel?: string;
  backIcon?: IconName;
  /** The drawn size of a long title (History 26, the voice page 26); 30 by default. */
  size?: number;
  /** Replaces the circles at the row's end. */
  right?: React.ReactNode;
  /** Says whether the now bar floats under the title bar; left out, the toast placement's rule. A page the bar never shows on says `false`. */
  now?: boolean;
  /** The home strip, for a page outside the root layout's padding (a modal route). */
  safeBottom?: number;
  /** Drawn under the title (a field, a row of pills). Its height, so the content starts below it: `extraAbove`. */
  extra?: React.ReactNode;
  extraAbove?: number;
  tone?: GlowTone | 'none';
  shrunk?: boolean;
  /** Drawn at the page's foot, above the bars (Favourites' search field and switch, a Send button): `belowHeight` is its height, so the content leaves room for it and 12. */
  below?: React.ReactNode;
  belowHeight?: number;
  /** Makes the title a link (a playlist's name opens its rename); `titleLabel` is its spoken name. */
  onTitle?: () => void;
  titleLabel?: string;
  /** No title bar: the page draws its own foot (the rename form), over the glow and the fade. */
  bare?: boolean;
  /** Height of the top fade; by default the content start plus a breath. */
  fade?: number;
  children: React.ReactNode | ((layout: PushedLayout) => React.ReactNode);
}): React.ReactElement {
  const lift = props.below ? (props.belowHeight ?? 0) + BELOW_GAP : 0;
  const layout = usePushedLayout(props.extraAbove ?? 0, { lift, ...(props.bare ? { bare: true } : {}), ...(props.now !== undefined ? { now: props.now } : {}), ...(props.safeBottom !== undefined ? { safeBottom: props.safeBottom } : {}) });
  const { width } = useWindowDimensions();
  const onBack = props.onBack === undefined ? goBack : props.onBack ?? undefined;
  return (
    <Box className="flex-1 bg-void" testID="pushed-page">
      {props.tone === 'none' ? null : <PageGlow tone={props.tone ?? 'hot'} />}
      {typeof props.children === 'function' ? props.children(layout) : props.children}
      {/* F3: a bare page draws its own foot and fade inside its content; this one, a sibling after the content at zIndex 15, laid over it and hid the foot (the rename form). */}
      {props.bare ? null : <Fade top={0} height={props.fade ?? topFade(layout.top)} />}
      {props.bare ? null : <TitleBar
        title={props.title}
        top={layout.titleTop}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
        {...(props.onSubtitle ? { onSubtitle: props.onSubtitle } : {})}
        {...(props.subtitleLines ? { subtitleLines: props.subtitleLines } : {})}
        {...(props.actions ? { actions: props.actions } : {})}
        {...(onBack ? { onBack, ...(props.backLabel ? { backLabel: props.backLabel } : {}), ...(props.backIcon ? { backIcon: props.backIcon } : {}) } : {})}
        {...(props.right ? { right: props.right } : {})}
        {...(props.size ? { size: props.size } : {})}
        {...(props.shrunk ? { shrunk: true } : {})}
        {...(props.extra ? { extra: props.extra } : {})}
        {...(props.onTitle ? { onTitle: props.onTitle } : {})}
        {...(props.titleLabel ? { titleLabel: props.titleLabel } : {})}
      />}
      {props.below ? (
        <Box testID="pushed-below" className="absolute left-0 right-0" style={{ bottom: layout.titleBottom, paddingHorizontal: gutter(width), gap: BELOW_GAP, zIndex: 20 }}>{props.below}</Box>
      ) : null}
    </Box>
  );
}
