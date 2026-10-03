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
export function MiniPlayer(props: { pathname?: string; context?: 'root' | 'tabs'; className?: string }): React.ReactElement | null {
  const player = usePlayer();
  const state = usePlayerState();
  const stores = useStores();
  const c = useColours(stores.settings);
  const routerPath = usePathname();
  const path = props.pathname ?? routerPath;
  const context = props.context ?? 'root';

  // Reason 2 above. `/player` is the only route that draws the same episode itself.
  if (path === '/player') return null;
  // Owner, 2026-09-27: the sign-in and sign-up pages are not a place to be playing from.
  if (path.startsWith('/auth/')) return null;
  // Owner, 2026-10-01: the comments page has its own episode card with play/pause, and its
  // write box sits where the bar would — so the bar stands down there.
  if (path.startsWith('/comments/')) return null;
  // Exactly one bar. Two would announce the episode twice to a screen reader.
  if (context === 'root' && TAB_ROUTES.includes(path)) return null;
  if (state.kind === 'idle') return null;

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
            <Text className="text-body text-text font-semibold" numberOfLines={1}>
              {episode?.title ?? 'Now playing'}
            </Text>
            <Text className="text-xs text-muted" numberOfLines={1}>
              {durationMs ? `${mmss(positionMs)}/${mmss(durationMs)}` : (show?.title ?? mmss(positionMs))}
            </Text>
          </Box>
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityState={{ selected: isPlaying }}
        className="rounded-pill items-center justify-center"
        style={ROUND}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      >
        <ProgressRing progress={progress} size={RING} stroke={3}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={c.text} />
        </ProgressRing>
      </Pressable>
      <Link href="/queue" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Queue" className="rounded-pill bg-surface border border-border items-center justify-center" style={ROUND}>
          <Icon name="list" size={22} color={c.accent} />
        </Pressable>
      </Link>
    </Box>
  );
}

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
