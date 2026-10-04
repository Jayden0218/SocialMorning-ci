// A row of words-only tiles moving slowly on the sign-in page.
/**
 * A row of show covers on the sign-in page (owner, 2026-10-03: was a loose wall). It moves
 * on one cover every second and loops without a jump back: the covers are drawn twice, and
 * on reaching the second copy's first cover it snaps, unanimated, to the identical first.
 * A finger can drag it; the timer starts again from where it lets go. Reduce Motion keeps it
 * still.
 * M17 (`SignIn-B`): 22 pt corners and a soft shadow under each cover (room left under the row
 * so the shadow is not cut off).
 * Owner, 2026-10-04: the covers are words-only tiles (`LANDING_TILES`), not podcast artwork —
 * there is no permission to show other people's covers. Nothing loads, so the row is ready at once.
 */
import { useEffect, useRef, type ComponentRef } from 'react';
import { AccessibilityInfo, ScrollView, useWindowDimensions } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { colour, spacing } from '@/design';
import type { ArtTile, ArtTone } from './art';
/** One tile forward this often (owner, 2026-10-04: every 2 seconds; was 1). */
export const ART_STEP_MS = 2000;
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

/** Each tone: the tile's fill, its small label and its words — all palette tokens. */
const TONE: Record<ArtTone, { box: string; kicker: string; title: string }> = {
  primary: { box: 'bg-primary', kicker: 'text-onPrimary', title: 'text-onPrimary' },
  surface: { box: 'bg-surface border border-border', kicker: 'text-accent', title: 'text-text' },
  dark: { box: 'bg-text', kicker: 'text-background', title: 'text-background' },
};

/**
 * `onReady` fires once, as soon as the row is drawn — the tiles are words, nothing loads —
 * so the page appears whole (owner, 2026-09-27).
 */
export function ArtWall(props: { tiles: readonly ArtTile[]; onReady?: () => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const card = Math.round(width * 0.5);
  const step = card + spacing.section;
  const n = props.tiles.length;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const at = useRef(0);
  const dragging = useRef(false);
  const fired = useRef(false);
  const ready = useRef(props.onReady);
  ready.current = props.onReady;
  const fire = (): void => { if (!fired.current) { fired.current = true; ready.current?.(); } };

  useEffect(() => { fire(); }, []);

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

  // Drawn twice so the loop has somewhere to go.
  const row = n >= 2 ? [...props.tiles, ...props.tiles] : props.tiles;
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
      {row.map((t, i) => (
          <Box key={`${i}-${t.kicker}`} className="rounded-artwork-lg bg-surface" style={[SHADOW, { width: card, height: card }]}>
            <Box className={`rounded-artwork-lg overflow-hidden flex-1 p-5 justify-between ${TONE[t.tone].box}`}>
              <Text className={`${TONE[t.tone].kicker} text-xs font-bold uppercase tracking-widest`}>{t.kicker}</Text>
              <Text className={`${TONE[t.tone].title} font-display text-[24px] leading-[28px]`} numberOfLines={4}>{t.title}</Text>
            </Box>
          </Box>
      ))}
    </ScrollView>
  );
}
