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
 *     (`docs/m7-before/06-player.png`) shows the old bar sitting underneath the full
 *     player, announcing the same episode twice — to a screen reader, two "Play" buttons
 *     for one episode. Found on the phone, fixed here.
 *  3. **The play/pause button keeps M6's state-driven name.** J5 drove the player by
 *     accessible name alone and watched this button's label flip from "Play" to "Pause";
 *     the label, the role and the `accessibilityState` are the contract, not the glyph.
 */
import { Link, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colour, fontSize, hit, radius, spacing } from '../design';
import { usePlayer, usePlayerState } from '../playback/store';
import { useStores } from './providers';
import { Artwork } from './Artwork';
import { MINI_PLAYER_HEIGHT } from './Screen';

/** Artwork in the bar. Smaller than a list row's, because the bar is not a row. */
const MINI_ARTWORK = 40;

/** The three routes that live behind the tab bar (T012). */
export const TAB_ROUTES: readonly string[] = ['/', '/discover', '/following'];

/**
 * Where this instance is mounted. There are two, and only ever one is visible:
 *  - `root` — in the stack layout, so the bar follows you onto an episode, a show, a
 *    profile, a clip. It stands down on a tab route, where the other one draws.
 *  - `tabs` — inside the tab layout, **above** the tab bar, which is the arrangement
 *    the whole look is built around.
 */
export function MiniPlayer(props: { pathname?: string; context?: 'root' | 'tabs' }): React.ReactElement | null {
  const player = usePlayer();
  const state = usePlayerState();
  const stores = useStores();
  const routerPath = usePathname();
  const path = props.pathname ?? routerPath;
  const context = props.context ?? 'root';

  // Reason 2 above. `/player` is the only route that draws the same episode itself.
  if (path === '/player') return null;
  // Exactly one bar. Two would announce the episode twice to a screen reader.
  if (context === 'root' && TAB_ROUTES.includes(path)) return null;
  if (state.kind === 'idle') return null;

  if (state.kind === 'error') {
    return (
      <View style={styles.bar}>
        <Text style={styles.error} numberOfLines={2}>
          {state.message}
        </Text>
      </View>
    );
  }

  const episode = stores.feeds.getEpisode(state.episodeId);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const isPlaying = state.kind === 'playing' || state.kind === 'buffering';

  return (
    <View style={styles.bar}>
      <Link href="/player" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Now playing: ${episode?.title ?? 'an episode'}. Open the player.`}
          style={styles.grow}
        >
          <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={MINI_ARTWORK} />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {episode?.title ?? 'Now playing'}
            </Text>
            {show?.title ? (
              <Text style={styles.show} numberOfLines={1}>
                {show.title}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Link>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityState={{ selected: isPlaying }}
        style={styles.button}
        onPress={() => (isPlaying ? player.pause() : player.play())}
      >
        <Text style={styles.buttonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.row,
    paddingHorizontal: spacing.row,
    paddingVertical: spacing.gap,
    // No `height`: at the largest system font the title and the show name must be
    // allowed to push the bar taller rather than clip (M6 J6).
    minHeight: MINI_PLAYER_HEIGHT,
    backgroundColor: colour.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colour.separator,
  },
  grow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.row },
  text: { flex: 1 },
  title: { fontSize: fontSize.sm, color: colour.text },
  show: { fontSize: fontSize.xs, color: colour.muted },
  error: { flex: 1, fontSize: fontSize.sm, color: colour.accent },
  button: {
    minWidth: hit.min,
    minHeight: hit.min,
    paddingHorizontal: spacing.row,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: fontSize.sm, fontWeight: '600', color: colour.accent },
});
