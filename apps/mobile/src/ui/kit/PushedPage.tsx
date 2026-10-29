// A pushed page in the Pulse shape: the glow, the content, a fade, and the title bar low by the thumb.
/**
 * M31 W3-B (design-pulse2 `listen.html` `pushed({ title, sub, actions, now, content, stage })`; index.html §Bars):
 * the stage (the two-colour glow) behind everything, the page's content on top, a `Fade` of the page
 * colour, and the `TitleBar` — back, title, subtitle and up to two circles — 6 above the page's foot
 * (the root layout already pads the home strip; the drawing's 40 is the strip's 34 plus 6), or 74 when the now
 * bar floats under it (the drawing's 108 less the strip; it sits 10 above the bar).
 * Whether the now bar shows is the toast placement's rule (`toastPlacement`: `miniPlayerShows`, Moments),
 * so a page, its toast and the bar agree.
 *
 * `children` is the content; give it a function to learn the page's measures: where the content starts
 * (`top`, under the status bar), where the title bar sits (`titleBottom`) and how much room the last row
 * must leave (`reserve`, the title bar's tallest height plus a breath).
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { useWindowDimensions } from 'react-native';
import { bars, gutter, titleBarBottom } from '@/design';
import { tabTitleReserve } from '@/ui/me/useTabTitle';
import { useToastPlacement } from '@/ui/shell/toastPlacement';
import { Fade } from './Fade';
import { PageGlow, type GlowTone } from './PageGlow';
import { goBack } from './PageHeader';
import type { IconName } from './Icon';
import { TitleBar, type TitleAction } from './TitleBar';

/** Between the title row and what is drawn below it (`low()` in shell.html). */
const BELOW_GAP = 12;

export type PushedLayout = { /** The status bar's height. */ top: number; /** Distance from the screen's bottom edge to the title bar's bottom. */ titleBottom: number; /** Room the content leaves at its foot. */ reserve: number };

/** Pure: where the title bar sits on a pushed page, with or without the now bar. */
export function pushedLayout(safeTop: number, now: boolean, extraAbove = 0): PushedLayout {
  // The root layout pads the bottom inset once (guard G-T1), so the bars are measured from the page's own foot.
  const titleBottom = titleBarBottom(0, { now });
  return { top: safeTop, titleBottom, reserve: tabTitleReserve(titleBottom) + extraAbove };
}

export function usePushedLayout(extraAbove = 0, over?: { now?: boolean; safeBottom?: number }): PushedLayout {
  const insets = useContext(SafeAreaInsetsContext);
  const placed = useToastPlacement();
  const l = pushedLayout(insets?.top ?? 0, over?.now ?? placed.now, extraAbove);
  // A page outside the root's padding (a modal route) pads the home strip itself.
  return over?.safeBottom ? { ...l, titleBottom: l.titleBottom + over.safeBottom, reserve: l.reserve + over.safeBottom } : l;
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
  /** Drawn above the title row (a field, a row of pills). Its height, so the content leaves room: `extraAbove`. */
  extra?: React.ReactNode;
  extraAbove?: number;
  tone?: GlowTone | 'none';
  shrunk?: boolean;
  /** Drawn BELOW the title row, lowest on the page (Favourites' search field and switch): `belowHeight` is its height, so the title row lifts by it and 12. */
  below?: React.ReactNode;
  belowHeight?: number;
  /** Makes the title a link (a playlist's name opens its rename); `titleLabel` is its spoken name. */
  onTitle?: () => void;
  titleLabel?: string;
  /** No title bar: the page draws its own foot (the rename form), over the glow and the fade. */
  bare?: boolean;
  /** Height of the fade; the drawing's `pushed()` uses 260 (370 with an `extra` row). */
  fade?: number;
  children: React.ReactNode | ((layout: PushedLayout) => React.ReactNode);
}): React.ReactElement {
  const lift = props.below ? (props.belowHeight ?? 0) + BELOW_GAP : 0;
  const layout = usePushedLayout((props.extraAbove ?? 0) + lift, { ...(props.now !== undefined ? { now: props.now } : {}), ...(props.safeBottom !== undefined ? { safeBottom: props.safeBottom } : {}) });
  const { width } = useWindowDimensions();
  const onBack = props.onBack === undefined ? goBack : props.onBack ?? undefined;
  return (
    <Box className="flex-1 bg-void" testID="pushed-page">
      {props.tone === 'none' ? null : <PageGlow tone={props.tone ?? 'hot'} />}
      {typeof props.children === 'function' ? props.children(layout) : props.children}
      {/* F3: a bare page draws its own foot and fade inside its content; this one, a sibling after the content at zIndex 15, laid over it and hid the foot (the rename form). */}
      {props.bare ? null : <Fade bottom={0} height={props.fade ?? (props.extra ? 370 : 260) + (layout.titleBottom - bars.pushedGap)} />}
      {props.bare ? null : <TitleBar
        title={props.title}
        bottom={layout.titleBottom + lift}
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
