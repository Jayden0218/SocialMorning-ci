// A page drawn outside the router's pages — Terms, a legal document, the sign-in steps: glow, content, fade, low title bar, optional foot row.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `page({ title, sub, foot, … })`, `termsPage`, `legalPage`): the same shape as
 * `PushedPage` — the two-colour glow, the content, a `Fade`, the `TitleBar` low by the thumb — for a page that cannot ask the
 * router where it is: the Terms and the legal documents are drawn over the whole app by the providers, and the sign-in pages
 * never show a now bar. So the layout comes from the safe-area context alone (`pushedLayout`, never `usePathname`).
 *
 * `foot` is the drawn row under the title (a 52 button, 12 below the title, 6 above the edge): the title lifts to 70 over it
 * and the fade grows to 330. `inset` is the home strip the page must pad itself — the root layout pads it for a route page
 * (pass nothing), a page drawn over the root (Terms, the legal document in a modal) passes the safe-area bottom.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, gutter, titleBarBottom, typeScale } from '@/design';
import { Fade } from './Fade';
import { PageGlow, type GlowTone } from './PageGlow';
import type { PushedLayout } from './PushedPage';
import { TitleBar, type TitleAction } from './TitleBar';
import type { IconName } from './Icon';

/** The foot row's button is 52 and sits 12 under the title: the title's bottom is 6 + 52 + 12 above the edge. */
export const FOOT = { button: 52, titleGap: 12 } as const;
export const FOOT_TITLE_BOTTOM = bars.pushedGap + FOOT.button + FOOT.titleGap;
/** The drawing's fades: 250 without a foot row, 330 with one (`fade(0, foot ? 330 : 250)`). */
export const FADE = { plain: 250, withFoot: 330 } as const;

/** The title bar's tallest ordinary height (a two-line title, its subtitle) — the same allowance `PushedPage` makes. */
const TITLE_ROW = typeScale.hero.lineSafe + bars.titleSub + typeScale.caption.lineSafe;

/**
 * Pure: where the title bar sits and how much room the content leaves. The same numbers as `pushedLayout` (PushedPage.tsx), written
 * out here because that module reaches for the router and the player, which a page drawn over the whole app must not.
 */
export function overlayLayout(safeTop: number, o: { foot: boolean; inset?: number; extraAbove?: number }): PushedLayout {
  const inset = o.inset ?? 0;
  const titleBottom = (o.foot ? FOOT_TITLE_BOTTOM : titleBarBottom(0, { now: false })) + inset;
  return { top: safeTop, titleBottom, reserve: titleBottom + TITLE_ROW + bars.sheetGap + (o.extraAbove ?? 0) };
}

export function OverlayPage(props: {
  title: string;
  subtitle?: string;
  size?: number;
  /** `null` shows no back circle; left out, nothing happens either — a page with a back passes it. */
  onBack?: (() => void) | null;
  backIcon?: IconName;
  backLabel?: string;
  actions?: readonly TitleAction[];
  tone?: GlowTone | 'none';
  glowTop?: number;
  glowStrength?: number;
  glowFlip?: boolean;
  /** The row under the title (buttons). */
  foot?: React.ReactNode;
  /** Drawn above the title row (the code step's eyebrow); `extraAbove` is its height. */
  extra?: React.ReactNode;
  extraAbove?: number;
  /** The home strip this page pads itself. */
  inset?: number;
  children: React.ReactNode | ((layout: PushedLayout) => React.ReactNode);
}): React.ReactElement {
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const hasFoot = props.foot !== undefined && props.foot !== null && props.foot !== false;
  const layout = overlayLayout(insets?.top ?? 0, { foot: hasFoot, ...(props.inset !== undefined ? { inset: props.inset } : {}), ...(props.extraAbove !== undefined ? { extraAbove: props.extraAbove } : {}) });
  const inset = props.inset ?? 0;
  return (
    <Box className="flex-1 bg-void" testID="overlay-page">
      {props.tone === 'none' ? null : <PageGlow tone={props.tone ?? 'hot'} {...(props.glowTop !== undefined ? { top: props.glowTop } : {})} {...(props.glowStrength !== undefined ? { strength: props.glowStrength } : {})} {...(props.glowFlip ? { flip: true } : {})} />}
      {typeof props.children === 'function' ? props.children(layout) : props.children}
      <Fade bottom={inset} height={hasFoot ? FADE.withFoot : FADE.plain} />
      <TitleBar
        title={props.title}
        bottom={layout.titleBottom}
        {...(props.subtitle ? { subtitle: props.subtitle } : {})}
        {...(props.actions ? { actions: props.actions } : {})}
        {...(props.onBack ? { onBack: props.onBack, ...(props.backIcon ? { backIcon: props.backIcon } : {}), ...(props.backLabel ? { backLabel: props.backLabel } : {}) } : {})}
        {...(props.size ? { size: props.size } : {})}
        {...(props.extra ? { extra: props.extra } : {})}
      />
      {hasFoot ? (
        <Box testID="overlay-foot" className="absolute flex-row items-center gap-row" style={{ left: gutter(width), right: gutter(width), bottom: bars.pushedGap + inset, zIndex: 21 }}>{props.foot}</Box>
      ) : null}
    </Box>
  );
}
