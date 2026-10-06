// Small bar at the bottom showing what plays; tap to open the player.
/**
 * The floating bar that says something is loaded, and the way back to the player from
 * anywhere. It replaces `MiniBar` (M1) — same job, M7's look.
 *
 * Three things here are not decoration:
 *
 *  1. **It is absent when nothing is loaded.** That was true of `MiniBar` and stays true:
 *     an empty bar at the bottom of every screen is the single easiest way to make an app
 *     look unfinished.
 *  2. **It is absent on the player itself.** The "before" screenshot of 2026-09-25
 *     (`docs/archive/m7-before/06-player.png`) shows the old bar sitting underneath the full
 *     player, announcing the same episode twice — to a screen reader, two "Play" buttons
 *     for one episode. Found on the phone, fixed here.
 *  3. **The play/pause button keeps M6's state-driven name.** J5 drove the player by
 *     accessible name alone and watched this button's label flip from "Play" to "Pause";
 *     the label, the role and the `accessibilityState` are the contract, not the glyph.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type LayoutChangeEvent } from 'react-native';
import { Link, useIsFocused, usePathname } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { colour, hit } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { usePlayer, usePlayerState } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { Artwork } from '@/ui/kit/Artwork';
import { mmss } from '@/ui/kit/format';
import { Icon } from '@/ui/kit/Icon';
import { ProgressRing } from '@/ui/kit/ProgressRing';
import { MINI_PLAYER_HEIGHT } from '@/ui/kit/Screen';
import { TAB_HREF } from '@/ui/shell/tabs';
import { useQueueSheet } from '@/ui/queue/QueueSheetHost';

/** Artwork in the bar. Smaller than a list row's, because the bar is not a row. */
const MINI_ARTWORK = 48;

/** The play button's ring, and the queue button beside it (owner's reference, 2026-09-27). */
const RING = hit.min;
const ROUND = { width: hit.min, height: hit.min, minWidth: hit.min, minHeight: hit.min };

/**
 * The routes that live behind the tab bar (T012; `/library` since M10's reorder; `/me`
 * for the Discover · Updates · Me bar, 2026-09-27). `/following` stays until it leaves the bar.
 */
// iOS i12: read from TAB_HREF, so a new tab can never draw a second bar.
export const TAB_ROUTES: readonly string[] = [...Object.values(TAB_HREF), '/discover', '/following'];

/**
 * No `height`: at the largest system font the title and the show name must be allowed to
 * push the bar taller rather than clip (M6 J6). `minHeight` stays a style because
 * `MINI_PLAYER_HEIGHT` is the one source for this number (`Screen` reserves it too).
 */
// M17 (`Me-B`): the white Editorial bar over the warm page.
const BAR = 'flex-row items-center gap-row px-section py-2 bg-surface border-t-hairline border-separator';
const BAR_HEIGHT = { minHeight: MINI_PLAYER_HEIGHT };

/**
 * Where this instance is mounted. There are two, and only ever one is visible:
 *  - `root` — in the stack layout, so the bar follows you onto an episode, a show, a
 *    profile, a clip. It stands down on a tab route, where the other one draws.
 *  - `tabs` — inside the tab layout, **above** the tab bar, which is the arrangement
 *    the whole look is built around.
 */
/**
 * Whether the bar draws on this route (the rules below, in one place). Also read by the root layout
 * (owner, 2026-10-06): while the root bar shows, the home-bar strip under it is the bar's white,
 * not the page's cream — the "yellow bar" under the mini player on a show page.
 */
export function miniPlayerShows(path: string, context: 'root' | 'tabs', idle: boolean): boolean {
  // Reason 2 above. `/player` is the only route that draws the same episode itself.
  if (path === '/player') return false;
  // Owner, 2026-09-27: the sign-in and sign-up pages are not a place to be playing from.
  if (path.startsWith('/auth/')) return false;
  // Owner, 2026-10-01: the comments page has its own episode card with play/pause, and its
  // write box sits where the bar would — so the bar stands down there.
  if (path.startsWith('/comments/')) return false;
  // Exactly one bar. Two would announce the episode twice to a screen reader.
  if (context === 'root' && TAB_ROUTES.includes(path)) return false;
  return !idle;
}

export function MiniPlayer(props: { pathname?: string; context?: 'root' | 'tabs'; className?: string }): React.ReactElement | null {
  const player = usePlayer();
  const state = usePlayerState();
  const stores = useStores();
  const c = useColours(stores.settings);
  const queueSheet = useQueueSheet();
  const routerPath = usePathname();
  const path = props.pathname ?? routerPath;
  const context = props.context ?? 'root';

  if (!miniPlayerShows(path, context, state.kind === 'idle') || state.kind === 'idle') return null;

  if (state.kind === 'error') {
    return (
      <Box className={`${BAR} ${props.className ?? ''}`} style={BAR_HEIGHT}>
        <Text className="flex-1 text-sm text-accent" numberOfLines={2}>
          {state.message}
        </Text>
      </Box>
    );
  }

  const episode = stores.feeds.getEpisode(state.episodeId);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const isPlaying = state.kind === 'playing' || state.kind === 'buffering';
  // "26:37/1:30:28" under the title, and the ring around the play button (the reference's bar).
  const positionMs = 'positionMs' in state && typeof state.positionMs === 'number' ? state.positionMs : 0;
  const durationMs = ('durationMs' in state ? state.durationMs : undefined) ?? episode?.durationMs;
  const progress = durationMs ? positionMs / durationMs : 0;
  // M21 FR-004: the sleep timer's time left, beside the position (redrawn with every tick).
  const sleepLeft = player.sleepRemainingMs();
  const sleepNote = sleepLeft !== undefined ? ` · sleep ${mmss(sleepLeft)}` : player.sleepTimer().endOfEpisode ? ' · sleep at end' : '';

  return (
    <Box className={`${BAR} ${props.className ?? ''}`} style={BAR_HEIGHT}>
      <Link href="/player" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Now playing: ${episode?.title ?? 'an episode'}. Open the player.`}
          className="flex-1 flex-row items-center gap-row"
        >
          <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={MINI_ARTWORK} name={show?.title} />
          <Box className="flex-1">
            <Marquee text={episode?.title ?? 'Now playing'} />
            <Text className="text-xs text-muted" numberOfLines={1}>
              {durationMs ? `${mmss(positionMs)}/${mmss(durationMs)}` : (show?.title ?? mmss(positionMs))}{sleepNote}
            </Text>
          </Box>
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityState={{ selected: isPlaying }}
        className="rounded-pill bg-playDisc items-center justify-center"
        style={ROUND}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      >
        <ProgressRing progress={progress} size={RING} stroke={3}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={c.playGlyph} />
        </ProgressRing>
      </Pressable>
      {/* M21 US3 (FR-020): ≡ opens the playlist sheet over this page, not the /queue page. */}
      <Pressable onPress={() => queueSheet.open()} accessibilityRole="button" accessibilityLabel="Playlist" className="rounded-pill bg-surface border border-border items-center justify-center" style={ROUND}>
        <Icon name="list" size={22} color={c.accent} />
      </Pressable>
    </Box>
  );
}

/** Points per second the long title slides, and the pause at each end of a pass. */
const MARQUEE_SPEED = 30;
const MARQUEE_REST_MS = 1_500;

/** How far a title wider than its box must slide (0 when it fits). */
export function marqueeDistance(textWidth: number, boxWidth: number): number {
  return boxWidth > 0 && textWidth > boxWidth ? Math.ceil(textWidth - boxWidth) : 0;
}

/**
 * M21 T048 (US3): a title too long for the bar slides slowly to its end and back, in a loop.
 * Measured with onLayout (the box, and the text drawn on one unbounded line); a title that fits
 * stands still. With Reduce Motion on it stands still and is cut with "…", as before.
 */
function Marquee(props: { text: string }): React.ReactElement {
  const [box, setBox] = useState(0);
  const [wide, setWide] = useState(0);
  const [still, setStill] = useState(false);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setStill(v); }).catch(() => undefined);
    // Optional calls: a test double may not return a subscription.
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setStill(v));
    return () => { live = false; sub?.remove(); };
  }, []);

  const distance = still ? 0 : marqueeDistance(wide, box);
  useEffect(() => {
    x.setValue(0);
    if (distance === 0) return;
    const run = (distance / MARQUEE_SPEED) * 1_000;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(MARQUEE_REST_MS),
      Animated.timing(x, { toValue: -distance, duration: run, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(MARQUEE_REST_MS),
      Animated.timing(x, { toValue: 0, duration: run, easing: Easing.linear, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [distance, x]);

  if (distance === 0) {
    return (
      <Box className="overflow-hidden" onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout.width)}>
        <Text className="text-body text-text font-semibold" numberOfLines={1}>{props.text}</Text>
        {/* Measures the whole title on one line, unseen, to know whether it needs to slide. */}
        {still ? null : (
          <Box className="absolute flex-row opacity-0" style={MEASURE} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text className="text-body text-text font-semibold" onLayout={(e: LayoutChangeEvent) => setWide(e.nativeEvent.layout.width)}>{props.text}</Text>
          </Box>
        )}
      </Box>
    );
  }
  return (
    <Box className="overflow-hidden" onLayout={(e: LayoutChangeEvent) => setBox(e.nativeEvent.layout.width)}>
      <Animated.View className="flex-row" style={{ width: wide, transform: [{ translateX: x }] }}>
        <Text className="text-body text-text font-semibold" numberOfLines={1}>{props.text}</Text>
      </Animated.View>
    </Box>
  );
}

/** The measuring copy is laid out wide enough never to wrap. */
const MEASURE = { width: 4_000, left: 0, top: 0 };

/**
 * The bar above the tab bar (M12 FR-002, B3). The root bar hides by pathname, which changes
 * only when a back-swipe *finishes*; this one used to draw as soon as the tab screen showed
 * under the swipe, so two bars (the tab bar between them) were on screen together. It now
 * draws only while the tabs are the focused screen — the same state change that lets the root
 * bar stand down — so exactly one bar is ever drawn.
 */
export function TabsMiniPlayer(): React.ReactElement | null {
  const focused = useIsFocused();
  return focused ? <MiniPlayer context="tabs" /> : null;
}
