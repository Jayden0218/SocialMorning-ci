// A page drawn outside the router's pages — Terms, a legal document, the sign-in steps: glow, content, fade, title bar at the top, optional foot row.
/**
 * M31 S-C (T061; design-pulse2 `settings.html` `page({ title, sub, foot, … })`, `termsPage`, `legalPage`): the same shape as
 * `PushedPage` — the two-colour glow, the content, a `Fade`, the `TitleBar` (at the TOP since spec 037, option B) — for a page that cannot ask the
 * router where it is: the Terms and the legal documents are drawn over the whole app by the providers, and the sign-in pages
 * never show a now bar. So the layout comes from the safe-area context alone (`pushedLayout`, never `usePathname`).
 *
 * `foot` is the drawn row at the page's foot (a 52 button, 6 above the edge): the content leaves room for it. 037: the title no longer lifts over it. `inset` is the home strip the page must pad itself — the root layout pads it for a route page
 * (pass nothing), a page drawn over the root (Terms, the legal document in a modal) passes the safe-area bottom.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { bars, barsReserve, contentTopReserve, gutter, titleBarTop } from '@/design';
import { Fade, topFade } from './Fade';
import { PageGlow, type GlowTone } from './PageGlow';
import type { PushedLayout } from './PushedPage';
import { TitleBar, type TitleAction } from './TitleBar';
import type { IconName } from './Icon';

/** The foot row's button is 52 and sits 12 under the title: the title's bottom is 6 + 52 + 12 above the edge. */
export const FOOT = { button: 52, titleGap: 12 } as const;
export const FOOT_TITLE_BOTTOM = bars.pushedGap + FOOT.button + FOOT.titleGap;

/**
 * Pure: where the title bar sits and how much room the content leaves. The same numbers as `pushedLayout` (PushedPage.tsx), written
 * out here because that module reaches for the router and the player, which a page drawn over the whole app must not.
 * `titleBottom` is the foot zone's bottom (the foot row's top less its gap), kept under its old name so a page's own foot row stands where it did.
 */
export function overlayLayout(safeTop: number, o: { foot: boolean; inset?: number; extraAbove?: number }): PushedLayout {
  const inset = o.inset ?? 0;
  const titleBottom = (o.foot ? FOOT_TITLE_BOTTOM : bars.pushedGap) + inset;
  return {
    top: titleBarTop(safeTop) + contentTopReserve() + (o.extraAbove ?? 0),
    titleTop: titleBarTop(safeTop),
    titleBottom,
    reserve: (o.foot ? titleBottom : barsReserve({}) + inset),
  };
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
  /** 035 A2: the top fade's height; 0 draws none (a page whose words do not scroll behind the title bar, as the sign-in steps). */
  fade?: number;
  glowTop?: number;
  glowStrength?: number;
  glowFlip?: boolean;
  /** The row under the title (buttons). */
  foot?: React.ReactNode;
  /** Drawn under the title (the code step's eyebrow); `extraAbove` is its height. */
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
      {props.fade === 0 ? null : <Fade top={0} height={props.fade ?? topFade(layout.top)} />}
      <TitleBar
        title={props.title}
        top={layout.titleTop}
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
