// The now bar at the bottom showing what plays; tap to open the player. Draws the kit's NowBar from the player.
/**
 * The floating bar that says something is loaded, and the way back to the player from anywhere.
 *
 * Three things here are not decoration:
 *
 *  1. **It is absent when nothing is loaded.** An empty bar at the bottom of every screen is the
 *     single easiest way to make an app look unfinished.
 *  2. **It is absent on the player itself.** The "before" screenshot of 2026-09-25 shows the old bar
 *     under the full player, announcing the same episode twice — to a screen reader, two "Play"
 *     buttons for one episode. Found on the phone, fixed here.
 *  3. **The play/pause button keeps M6's state-driven name.** J5 drove the player by accessible name
 *     alone; the label, the role and the `accessibilityState` are the contract, not the glyph.
 *
 * M31 T024 (design-pulse2 index.html §Bars; kit `NowBar`, T022): the look is the kit's — a glass bar 58
 * tall, 8 above the tab bar, the cover, the title and a mono ticker ("12:32 / 48:10", plus the sleep
 * note " · sleep 12:00" as before), a light play circle, the playlist button, a progress line; it shrinks to
 * a 52 circle while a list scrolls down, and is hidden on Moments, with the keyboard up and under a sheet
 * (`nowBarMode`, fed by `nowbar-signals`). This file keeps what the kit leaves to the player lane: the
 * routes rule `miniPlayerShows`, the sleep note, the position from the player (rounded to the second, so
 * only the whole-second change redraws it, review C4), the playlist sheet, and where the bar sits
 * (`nowBarBottom`: 66 over the tab bar, the safe area + 6 on a pushed page).
 *
 * NOT DONE (the kit's NowBar has no marquee): a title longer than the bar is cut with "…" — M21's
 * sliding title (T048) is gone with the old bar, reported in the gate log.
 */
import { useContext, useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { useIsFocused, usePathname, router } from 'expo-router';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { nowBarBottom } from '@/design';
import { NowBar, nowBarMode } from '@/ui/kit/NowBar';
import { mmss } from '@/ui/kit/format';
import { sameClock, sameHead, selectClock, selectHead, selectIdle, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { episodeAndShow } from '@/ui/player/lookup';
import { TAB_HREF } from '@/ui/shell/tabs';
import { useQueueSheet } from '@/ui/queue/QueueSheetHost';
import { useNowBarSignals } from './nowbar-signals';

/**
 * The routes that live behind the tab bar (T012; `/library` since M10's reorder; `/me`
 * for the Discover · Updates · Me bar, 2026-09-27). `/following` stays until it leaves the bar.
 */
// iOS i12: read from TAB_HREF, so a new tab can never draw a second bar.
export const TAB_ROUTES: readonly string[] = [...Object.values(TAB_HREF), '/discover', '/following'];

/**
 * Where this instance is mounted. There are two, and only ever one is visible:
 *  - `root` — in the stack layout, so the bar follows you onto an episode, a show, a profile, a clip.
 *    It stands down on a tab route, where the other one draws.
 *  - `tabs` — inside the tab layout, **above** the tab bar.
 *
 * Whether the bar draws on this route (the rules below, in one place). Also read by the root layout.
 */
export function miniPlayerShows(path: string, context: 'root' | 'tabs', idle: boolean): boolean {
  // Reason 2 above. `/player` is the only route that draws the same episode itself.
  if (path === '/player') return false;
  // Owner, 2026-09-27: the sign-in and sign-up pages are not a place to be playing from.
  if (path.startsWith('/auth/')) return false;
  // Owner, 2026-10-01: the comments page has its own episode card with play/pause, and its
  // write box sits where the bar would — so the bar stands down there.
  if (path.startsWith('/comments/')) return false;
  // M31 W3-A (T040): the Episode page draws the tray at the foot where the bar would be (design-pulse2 episode--screen has no now bar);
  // its Play / Pause pill and the tray's queue are the page's own controls.
  if (path.startsWith('/episode/')) return false;
  // M31 W3-B (design-pulse2 clip--screen, clip-new--screen, transcript--screen): these three draw no now bar — the clip page's ring
  // and the composer's Preview play the audio themselves, and the transcript follows it — so the bar stands down.
  if (path.startsWith('/clip/') || path.startsWith('/transcript/')) return false;
  // M31 W4-B (design-pulse2 status--screen, status-text--screen): the Stage and the text-status page draw no now bar.
  if (path.startsWith('/status/')) return false;
  // Exactly one bar. Two would announce the episode twice to a screen reader.
  if (context === 'root' && TAB_ROUTES.includes(path)) return false;
  return !idle;
}

/** The keyboard being up hides the bar (the field being typed in sits where it would). */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return up;
}

function Bar(props: { context: 'root' | 'tabs'; bottom: number | undefined }): React.ReactElement | null {
  const player = usePlayer();
  const stores = useStores();
  const queueSheet = useQueueSheet();
  const head = usePlayerSelector(selectHead, sameHead);
  const clock = usePlayerSelector(selectClock, sameClock);
  const signals = useNowBarSignals();
  const keyboard = useKeyboardUp();
  const safe = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  if (head.episodeId === undefined) return null;
  // Read once per episode, not on every tick (src/ui/player/lookup.ts).
  const { episode, show } = episodeAndShow(stores.feeds, head.episodeId);
  const isPlaying = head.kind === 'playing' || head.kind === 'buffering';
  const durationMs = clock.durationMs ?? episode?.durationMs;
  // M21 FR-004: the sleep timer's time left, beside the position (redrawn with the clock).
  const sleepLeft = player.sleepRemainingMs();
  const sleepNote = sleepLeft !== undefined ? ` · sleep ${mmss(sleepLeft)}` : player.sleepTimer().endOfEpisode ? ' · sleep at end' : '';
  // With no length yet the ticker has only the clock; the show's name keeps the old bar's second line.
  const showNote = durationMs === undefined && show?.title ? ` · ${show.title}` : '';
  const note = head.kind === 'error' ? ' · couldn’t play' : `${showNote}${sleepNote}`;
  const mode = nowBarMode({ moments: signals.moments, keyboard, sheetOpen: signals.sheet, shrunk: signals.shrunk });
  return (
    <NowBar
      mode={mode}
      title={episode?.title ?? 'an episode'}
      coverUrl={episode?.imageUrl ?? show?.imageUrl}
      {...(show?.title !== undefined ? { coverName: show.title } : {})}
      playing={isPlaying}
      buffering={head.kind === 'buffering' || head.kind === 'loading'}
      positionMs={clock.positionMs}
      {...(durationMs !== undefined ? { durationMs } : {})}
      note={note}
      bottom={props.bottom ?? nowBarBottom(props.context === 'tabs' ? 0 : safe, { tabs: props.context === 'tabs' })}
      onToggle={() => (isPlaying ? player.pause() : player.play())}
      onOpen={() => router.push('/player')}
      onQueue={() => queueSheet.open()}
    />
  );
}

export function MiniPlayer(props: { pathname?: string; context?: 'root' | 'tabs'; /** Distance from the screen's bottom edge to the bar's; the default follows the context. */ bottom?: number }): React.ReactElement | null {
  const idle = usePlayerSelector(selectIdle);
  const routerPath = usePathname();
  const path = props.pathname ?? routerPath;
  const context = props.context ?? 'root';
  if (!miniPlayerShows(path, context, idle)) return null;
  return <Bar context={context} bottom={props.bottom} />;
}

/**
 * The bar above the tab bar (M12 FR-002, B3). The root bar hides by pathname, which changes
 * only when a back-swipe *finishes*; this one used to draw as soon as the tab screen showed
 * under the swipe, so two bars (the tab bar between them) were on screen together. It now
 * draws only while the tabs are the focused screen — the same state change that lets the root
 * bar stand down — so exactly one bar is ever drawn.
 */
export function TabsMiniPlayer(props: { bottom?: number }): React.ReactElement | null {
  const focused = useIsFocused();
  return focused ? <MiniPlayer context="tabs" {...(props.bottom !== undefined ? { bottom: props.bottom } : {})} /> : null;
}
