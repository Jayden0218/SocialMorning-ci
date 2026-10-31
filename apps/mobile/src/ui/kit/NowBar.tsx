// The now bar: what is playing, floating above the tab bar — cover, title, a live ticker, play, playlist.
/**
 * M31 T022 (design-pulse2 index.html §Bars, `kit.js` `nowbar`): replaces the MiniPlayer look. This
 * file draws it from props only; the player lane wires the store (src/ui/player/MiniPlayer.tsx
 * keeps the routes rule `miniPlayerShows` and the sleep note).
 *
 * Sizes: 8 above the tab bar (`bottom` = tab bar top + `bars.nowGap`), 10 from each side, 58 tall
 * (grows with large text), radius 18, `glass` (raise2 at 86 %) over a blur, 1 px line at 8 % white.
 * Inside: the cover (42, radius 10) at x 8; the title (Geist 600 14/18, one line); under it the
 * ticker (Geist Mono 12/16) — "12:32 / 48:10" in text2, or "🔥 41 reacting at 14:32" in hot-text
 * while the position is inside a hot moment, when the cover also gets a 1 px hot ring; a 40 light
 * play/pause circle with a void glyph; a 40 playlist button. A 2 px progress line runs along the
 * bottom edge inside the radius, hot to violet over `trackSoft`.
 *
 * Round 2 (owner, 2026-10-28): the parts are 10 apart and 8 in from the edge as drawn (`gap:10`, `padding:0 8px`) — they had been
 * 12 apart and 8 in, which moved the play circle 2 and the title 2 off — and the sizes are the `player` / `bars` tokens.
 *
 * States (the drawings' "Every state" table):
 *   bar        — as above;            buffering — the play circle's edge breathes in hot (2.4 s
 *                loop; static hot ring with Reduce Motion);          hot — the ticker and ring above;
 *   circle     — scrolling down a list: a 52 circle (cover + progress ring) at the right, above the
 *                tab bar; scrolling up, or 600 ms still, brings the bar back (`useNowBarShrink`);
 *   hidden     — on the Moments feed, with the keyboard up, on the player or under a sheet
 *                (`nowBarMode` decides; the bar fades out in 240 ms).
 * Taps: the bar opens the player; so does a swipe up; play/pause toggles; the playlist opens the
 * queue sheet. Same names as the old bar: "Now playing: … Open the player.", "Play" / "Pause", "Playlist".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { Animated, PanResponder, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from '@/design/tailwind';
import Svg, { Circle } from 'react-native-svg';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, coverRadius, motion, radius } from '@/design';
import { player } from '@/design/tokens';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { Type } from './Type';
import { mmss } from './format';
import { useColours } from './useColours';
import { useReducedMotion } from './useReducedMotion';
import { drawnType } from '@/design/type-px';

export type NowBarMode = 'bar' | 'circle' | 'hidden';

/**
 * Which form the bar takes. `hidden` wins (Moments, keyboard, the player, a sheet), then the
 * `shrunk` flag from scrolling; otherwise the bar.
 */
export function nowBarMode(s: { moments?: boolean; keyboard?: boolean; playerOpen?: boolean; sheetOpen?: boolean; shrunk?: boolean }): NowBarMode {
  if (s.moments === true || s.keyboard === true || s.playerOpen === true || s.sheetOpen === true) return 'hidden';
  return s.shrunk === true ? 'circle' : 'bar';
}

/** Whether a scroll step shrinks the bar: moving down past the top shrinks, moving up (or being at the top) restores. */
export function shrinkAfterScroll(prevY: number, y: number, was: boolean): boolean {
  if (y <= 0) return false;
  if (y > prevY + 4) return true;
  if (y < prevY - 4) return false;
  return was;
}

/**
 * `const { shrunk, onScroll } = useNowBarShrink()` — pass `onScroll` (with `scrollEventThrottle={16}`)
 * to the page's list. Shrinks on a scroll down, restores on a scroll up or after 600 ms still.
 */
export function useNowBarShrink(): { shrunk: boolean; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void } {
  const [shrunk, setShrunk] = useState(false);
  const y = useRef(0);
  const was = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y;
    const s = shrinkAfterScroll(y.current, next, was.current);
    y.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (s) timer.current = setTimeout(() => { was.current = false; setShrunk(false); }, motion.nowReturn);
    if (s !== was.current) { was.current = s; setShrunk(s); }
  }, []);
  return { shrunk, onScroll };
}

/** The ticker's words for a position (the hot moment overrides the clock). */
export function tickerText(positionMs: number, durationMs: number | undefined, hot?: { count: number; atMs: number }, note = ''): string {
  if (hot) return `🔥 ${hot.count} reacting at ${mmss(hot.atMs)}`;
  return `${durationMs ? `${mmss(positionMs)} / ${mmss(durationMs)}` : mmss(positionMs)}${note}`;
}

const SWIPE_UP = 24;
const SWIPE_FLICK = 0.5;

/** Whether a swipe that ended at `dy` points (negative = up) and `vy` speed opens the player. */
export function opensOnSwipe(dy: number, vy: number): boolean {
  return dy < -SWIPE_UP || vy < -SWIPE_FLICK;
}

const R = bars.nowCircle / 2 - 2;
const CIRC = 2 * Math.PI * R;

/** T103: the drawn 40 circles and the 42 cover are under 44 to touch; slop makes up the difference (the look is unchanged; the 8 pt gap between the buttons is wider than the slop). */
const CIRCLE_SLOP = Math.ceil((44 - bars.playCircle) / 2);
const OPEN_SLOP = { top: Math.ceil((44 - bars.cover) / 2), bottom: Math.ceil((44 - bars.cover) / 2), left: 0, right: 0 };

export type NowBarProps = {
  mode: NowBarMode;
  title: string;
  coverUrl?: string | null;
  /** The show's name, for the cover's placeholder letters. */
  coverName?: string;
  playing: boolean;
  buffering?: boolean;
  positionMs: number;
  durationMs?: number;
  /** Inside a hot moment: how many are reacting, and where. */
  hot?: { count: number; atMs: number };
  /** Appended to the clock line, e.g. " · sleep 12:00". */
  note?: string;
  /** Distance from the screen's bottom edge to the bar's bottom: `nowBarBottom(safe, { tabs })` (100 over a tab bar on a 34 pt inset, 40 on a pushed page). */
  bottom: number;
  onToggle: () => void;
  onOpen: () => void;
  onQueue: () => void;
};

function progressOf(p: NowBarProps): number {
  return p.durationMs && p.durationMs > 0 ? Math.min(1, Math.max(0, p.positionMs / p.durationMs)) : 0;
}

export function NowBar(props: NowBarProps): React.ReactElement | null {
  const still = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(props.mode === 'hidden' ? 0 : 1));
  const [mounted, setMounted] = useState(props.mode !== 'hidden');
  const [form, setForm] = useState<'bar' | 'circle'>(props.mode === 'circle' ? 'circle' : 'bar');
  useEffect(() => {
    if (props.mode === 'hidden') {
      if (still) { shown.setValue(0); return; }
      Animated.timing(shown, { toValue: 0, duration: motion.move, useNativeDriver: true }).start(({ finished }) => { if (finished) setMounted(false); });
      return;
    }
    if (still) { shown.setValue(1); return; }
    shown.setValue(0);
    Animated.timing(shown, { toValue: 1, duration: motion.move, useNativeDriver: true }).start();
  }, [props.mode, still, shown]);
  // Showing mounts the bar (in the form asked for) in the same render; hiding with Reduce Motion unmounts it at once.
  if (props.mode !== 'hidden') {
    if (!mounted) setMounted(true);
    if (form !== props.mode) setForm(props.mode);
  } else if (still && mounted) setMounted(false);
  // Swipe up on the bar opens the player.
  const open = useLatest(props.onOpen);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => g.dy < -8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_e, g) => { if (opensOnSwipe(g.dy, g.vy)) open()(); },
  }), [open]);
  if (!mounted) return null;
  const rise = still ? 0 : 6;
  const wrap = { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] };
  return form === 'circle' ? <Circular {...props} wrap={wrap} /> : <Bar {...props} wrap={wrap} panHandlers={pan.panHandlers} />;
}

type Wrap = { opacity: Animated.Value; transform: { translateY: Animated.AnimatedInterpolation<number> }[] };

function Bar(props: NowBarProps & { wrap: Wrap; panHandlers: object }): React.ReactElement {
  const c = useColours();
  const still = useReducedMotion();
  const hot = props.hot !== undefined;
  const progress = progressOf(props);
  // Buffering: the play circle's edge breathes (opacity 1 → 0.5 → 1 on 2.4 s); with Reduce Motion it is a still ring.
  const [breathe] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (props.buffering !== true || still) { breathe.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [props.buffering, still, breathe]);
  return (
    <Animated.View
      testID="now-bar"
      style={[{ position: 'absolute', left: bars.nowSide, right: bars.nowSide, bottom: props.bottom, zIndex: 51 }, props.wrap]}
      {...props.panHandlers}
    >
      <Box
        testID="now-bar-row"
        className="flex-row items-center overflow-hidden border border-glassLine"
        style={{ minHeight: bars.now, borderRadius: radius.bar, backgroundColor: colour.glass, gap: player.nowGap, paddingHorizontal: player.nowPad }}
      >
        <BlurView intensity={30} tint="dark" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none" />
        <Pressable
          onPress={props.onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Now playing: ${props.title}. Open the player.`}
          hitSlop={OPEN_SLOP}
          className="flex-1 flex-row items-center"
          style={{ gap: player.nowGap }}
        >
          <Box testID="now-cover" style={{ width: bars.cover, height: bars.cover }}>
            <Artwork url={props.coverUrl} size={bars.cover} name={props.coverName} />
            {/* Inside a hot moment the cover gets a 1 px hot ring. */}
            {hot ? <Box testID="now-hot-ring" pointerEvents="none" className="absolute inset-0" style={{ borderRadius: coverRadius[0]!.r, borderWidth: 1, borderColor: c.hot }} /> : null}
          </Box>
          <Box className="flex-1">
            <Type step="compact" className="text-text" numberOfLines={1}>{props.title}</Type>
            <Type step="mono" className={hot ? 'text-hotText' : 'text-text2'} style={drawnType.ticker} numberOfLines={1}>
              {tickerText(props.positionMs, props.durationMs, props.hot, props.note)}
            </Type>
          </Box>
        </Pressable>
        <Pressable
          onPress={props.onToggle}
          accessibilityRole="button"
          accessibilityLabel={props.playing ? 'Pause' : 'Play'}
          accessibilityState={{ selected: props.playing, busy: props.buffering === true }}
          hitSlop={CIRCLE_SLOP}
          className="items-center justify-center"
          style={{ width: bars.playCircle, height: bars.playCircle }}
        >
          <Animated.View
            testID="now-play-ring"
            className="rounded-pill bg-text items-center justify-center"
            style={[
              { width: bars.playCircle, height: bars.playCircle },
              props.buffering === true ? { borderWidth: 2, borderColor: c.hot, opacity: breathe } : null,
            ]}
          >
            <Icon name={props.playing ? 'pause' : 'play'} size={16} color={c.void} />
          </Animated.View>
        </Pressable>
        <Pressable
          onPress={props.onQueue}
          accessibilityRole="button"
          accessibilityLabel="Playlist"
          hitSlop={CIRCLE_SLOP}
          className="items-center justify-center"
          style={{ width: bars.playCircle, height: bars.playCircle }}
        >
          <Icon name="list" size={22} color={c.text} />
        </Pressable>
        {/* The 2 px progress line along the bottom edge, inside the radius. */}
        <Box className="absolute left-0 right-0 bottom-0 bg-trackSoft" style={{ height: bars.progress }} pointerEvents="none">
          <LinearGradient testID="now-progress" colors={[c.hot, colour.violet]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${Math.round(progress * 100)}%`, height: bars.progress }} />
        </Box>
      </Box>
    </Animated.View>
  );
}

function Circular(props: NowBarProps & { wrap: Wrap }): React.ReactElement {
  const c = useColours();
  const progress = progressOf(props);
  return (
    <Animated.View testID="now-circle" style={[{ position: 'absolute', right: bars.nowSide, bottom: props.bottom, width: bars.nowCircle, height: bars.nowCircle, zIndex: 51 }, props.wrap]}>
      <Pressable
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${props.title}. Open the player.`}
        className="items-center justify-center rounded-pill"
        style={{ width: bars.nowCircle, height: bars.nowCircle }}
      >
        <Box className="overflow-hidden rounded-pill" style={{ width: bars.nowCircle - 8, height: bars.nowCircle - 8 }}>
          <Artwork url={props.coverUrl} size={bars.nowCircle - 8} name={props.coverName} rounded="pill" />
        </Box>
        <Svg width={bars.nowCircle} height={bars.nowCircle} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Circle cx={bars.nowCircle / 2} cy={bars.nowCircle / 2} r={R} stroke={colour.trackSoft} strokeWidth={3} fill="none" />
          <Circle
            testID="now-circle-arc"
            cx={bars.nowCircle / 2}
            cy={bars.nowCircle / 2}
            r={R}
            stroke={c.hot}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={CIRC * (1 - progress)}
            rotation={-90}
            origin={`${bars.nowCircle / 2}, ${bars.nowCircle / 2}`}
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}
