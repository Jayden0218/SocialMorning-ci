// A row of show covers moving slowly on the sign-in page.
/**
 * A row of show covers on the sign-in page (owner, 2026-10-03: was a loose wall). It moves
 * on one cover every second and loops without a jump back: the covers are drawn twice, and
 * on reaching the second copy's first cover it snaps, unanimated, to the identical first.
 * A finger can drag it; the timer starts again from where it lets go. Reduce Motion keeps it
 * still. The covers are whatever `landingArt` found.
 * M17 (`SignIn-B`): 22 pt corners and a soft shadow under each cover (room left under the row
 * so the shadow is not cut off).
 */
import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';

/** The longest the page waits for covers before it shows without the slow ones. */
export const ART_WAIT_MS = 1500;
/** One cover forward this often (owner, 2026-10-03). */
export const ART_STEP_MS = 1000;
/** How long the animated step takes before the loop may snap back. */
const SETTLE_MS = 400;
/** `SignIn-B`: 0 12 28 at 10 % of the text colour. */
const SHADOW = { shadowColor: colour.text, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 6 };

/**
 * One tick of the loop from cover `at` of `n`: where to scroll, and whether to snap back to
 * the first cover once there (the second copy's first cover looks the same).
 */
export function nextStep(at: number, n: number): { to: number; snapBack: boolean } {
  const to = at + 1;
  return { to, snapBack: to >= n };
}

/**
 * `onReady` fires once, when every cover has loaded or failed (or after `ART_WAIT_MS`),
 * so the page can appear whole instead of cover by cover (owner, 2026-09-27).
 */
export function ArtWall(props: { urls: string[]; onReady?: () => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const card = Math.round(width * 0.5);
  const step = card + spacing.section;
  const n = props.urls.length;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const at = useRef(0);
  const dragging = useRef(false);
  const settled = useRef(0);
  const fired = useRef(false);
  const ready = useRef(props.onReady);
  ready.current = props.onReady;
  const fire = (): void => { if (!fired.current) { fired.current = true; ready.current?.(); } };
  const one = (): void => { settled.current += 1; if (settled.current >= n) fire(); };

  useEffect(() => {
    if (n === 0) { fire(); return; }
    const t = setTimeout(fire, ART_WAIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  useEffect(() => {
    if (n < 2) return;
    let still = false;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) still = v; }).catch(() => undefined);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = setInterval(() => {
      if (still || dragging.current) return;
      const next = nextStep(at.current, n);
      at.current = next.to;
      scroller.current?.scrollTo?.({ x: next.to * step, animated: true });
      if (next.snapBack) {
        timers.push(setTimeout(() => { at.current = 0; scroller.current?.scrollTo?.({ x: 0, animated: false }); }, SETTLE_MS));
      }
    }, ART_STEP_MS);
    return () => { live = false; clearInterval(tick); timers.forEach(clearTimeout); };
  }, [n, step]);

  // Drawn twice so the loop has somewhere to go; only the first copy counts towards `onReady`.
  const row = n >= 2 ? [...props.urls, ...props.urls] : props.urls;
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: spacing.screenX, paddingBottom: 28, gap: spacing.section }}
      onScrollBeginDrag={() => { dragging.current = true; }}
      onMomentumScrollEnd={(e) => {
        dragging.current = false;
        at.current = Math.round(e.nativeEvent.contentOffset.x / step) % Math.max(n, 1);
        scroller.current?.scrollTo?.({ x: at.current * step, animated: false });
      }}
      style={{ flexGrow: 0 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {row.map((uri, i) => (
        <Box key={`${i}-${uri}`} className="rounded-artwork-lg bg-surface" style={[SHADOW, { width: card, height: card }]}>
          <Box className="rounded-artwork-lg overflow-hidden">
            <Image source={{ uri }} onLoadEnd={i < n ? one : undefined} style={{ width: card, height: card }} />
          </Box>
        </Box>
      ))}
    </ScrollView>
  );
}
