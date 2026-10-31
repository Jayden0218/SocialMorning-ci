// One moment on the Moments feed: the cover fills the screen, the words sit low, the curve lights as it plays.
/**
 * M31 T025 (design-pulse2 `index.html#home--moments`, layout pattern Stage). A card is one page of the
 * feed. From the top: the sound pill (glass, 32 tall), the rising comments at the right, the action
 * column (flame + count, comments + count, share) above the Play circle, and at the foot the hot tag,
 * the title (Unbounded 800 30), the show line, and the curve (24 tall). The 52 switch capsule that
 * sits under it belongs to the Home screen. All distances below are from the page's own bottom edge:
 * the drawing's offsets minus the tab bar (92) — curve 76, Play circle 104, title block 114, action
 * column 208; the Play circle and the column are 16 from the right edge, the title block 84.
 * The scrim is the drawing's: 10 % at the top, 25 % at 38 %, 94 % from 76 % of the PHONE's height (the
 * page and the bars under it, `below`), so its stops fall where drawn.
 *
 * The preview (research T020 §4): while this card is the active one and nothing forbids it
 * (`previewRuns`), it runs muted — the hot bars light one by one over the moment's length (5–20 s,
 * looping) and the comments rise. It fetches no audio. Sound is the pill or the Play circle, from a tap.
 * Reduce Motion and the web build show a Play button and no movement.
 *
 * Deviations from the drawing (reported in the gate log): the cover is not tinted per cover (research
 * T020 §2: the glow is the fixed hot-to-violet pair until a colour library is compiled green); the
 * flame's number is the moment's reactions, the comment number the episode's comments once known.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { bucketOf } from '@socialmorning/social-core';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Image } from '@/ui/lib/image';
import { LinearGradient } from '@/design/tailwind';
import { bars, colour, gutter, spacing } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { thumbUrl } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import type { Moment } from '@/discover/moments-api';
import { RisingComments } from './RisingComments';
import { useEpisodeHeat } from './useEpisodeHeat';
import { hotBars, loopMs, loopProgress, momentLine, momentTag, previewRuns, shortCount } from './moments-logic';
import { reactAt } from './moment-actions';

/** The bars of the card's curve (the drawing draws 70). */
export const CARD_BARS = 70;
const CURVE_HEIGHT = 24;
/** Distances from the page's bottom edge (the drawing's, less the 92 tab bar; see the header). */
const AT = { curve: 76, circle: 104, title: 114, column: 208 } as const;
/** Drawn: the Play circle and the action column are 16 from the right edge; the title block ends 84 from it. */
const RIGHT = spacing.section;
const TITLE_RIGHT = RIGHT + 56 + spacing.row;
const SOUND_DROP = 10;
/** What the drawing has under the page: the tab bar 58 + the 34 safe area. */
const DRAWN_BELOW = bars.tab + 34;
/** Round each action's drawn 28 + 4 + 11 so the touch is 48+ without moving it. */
const ACTION_SLOP = { top: 3, bottom: 3, left: 7, right: 7 };
/** The drawn count is 11 tall (28 + 4 + 11 = 43 per action, 165 for the column); the face's safe line is 15, so 2 comes off above and below. */
export const COUNT_LINE = { marginVertical: -2 } as const;
const CIRCLE = 56;
const PILL = 32;
const TICK_MS = 250;
const NO_HEAT: readonly number[] = Array.from<number>({ length: 100 }).fill(0);
const SCRIM = [colour.scrimTop, colour.scrimMid, colour.scrimFoot, colour.scrimFoot] as const;
const SCRIM_AT = [0, 0.38, 0.76, 1] as const;
const GLOW = [colour.hot, colour.violet] as const;
const FILL = StyleSheet.absoluteFill;

export type CardActions = {
  playFull: (m: Moment) => void;
  toggleSound: (m: Moment, soundOn: boolean) => void;
  comments: (m: Moment) => void;
  react: (m: Moment, durationMs: number | undefined) => Promise<boolean | undefined>;
  share: (m: Moment) => void;
};

/** What lets a preview run, beside the card being the active one. */
export type Ambient = { focused: boolean; appActive: boolean; reduceMotion: boolean; web: boolean };

/** 0–1 through the loop while `run`; 0 when stopped. */
function useLoopProgress(run: boolean, lengthMs: number): number {
  const [p, setP] = useState(0);
  // Every (re)start begins at 0.
  const [seen, setSeen] = useState({ run, lengthMs });
  if (seen.run !== run || seen.lengthMs !== lengthMs) {
    setSeen({ run, lengthMs });
    setP(0);
  }
  useEffect(() => {
    if (!run) return undefined;
    const t0 = Date.now();
    const id = setInterval(() => setP(loopProgress(Date.now() - t0, lengthMs)), TICK_MS);
    return () => clearInterval(id);
  }, [run, lengthMs]);
  return run ? p : 0;
}

function MomentCardView(props: {
  item: Moment;
  width: number;
  height: number;
  /** The status bar's height, so the sound pill clears it. */
  top: number;
  /** What is under the card on the screen (tab bar + safe area): the drawing's gradient is the phone's height. */
  below?: number;
  active: boolean;
  /** Near enough to the screen to read its curve (the active card and its neighbours). */
  near: boolean;
  ambient: Ambient;
  /** This card's sound is playing now. */
  soundOn: boolean;
  actions: CardActions;
}): React.ReactElement {
  const { item, actions } = props;
  const side = gutter(props.width);
  // F10 (fontscale2 F6): at large text the title takes two lines, so the block does not climb over the sound pill.
  const bigText = useWindowDimensions().fontScale > 1.3;
  const heat = useEpisodeHeat(item.episodeId, props.near);
  const [paused, setPaused] = useState(false);
  if (!props.active && paused) setPaused(false);
  const runs = previewRuns({ active: props.active, ...props.ambient, paused });
  const length = loopMs(item);
  const progress = useLoopProgress(runs, length);

  // Wave 5b: the server's whole-episode curve (0..100) when the moment has one; the heat read is the fallback for an older server.
  const curve = useMemo(() => (item.curve && item.curve.length > 0 ? item.curve.map((v) => v / 100) : undefined), [item.curve]);
  const range = hotBars(item, heat.durationMs, CARD_BARS);
  const hot = useMemo<readonly [number, number] | undefined>(() => {
    if (!range) return undefined;
    if (!runs) return range;
    return [range[0], range[0] + Math.floor(progress * (range[1] - range[0] + 1))];
  }, [range, runs, progress]);

  // The flame: the listener's own reaction, from the curve's answer; a tap flips it at once.
  const mineBefore = heat.mine !== undefined && heat.durationMs !== undefined ? heat.mine.includes(bucketOf(reactAt(item), heat.durationMs)) : false;
  const [reacted, setReacted] = useState<boolean | undefined>(undefined);
  const isReacted = reacted ?? mineBefore;
  const count = item.reactions + (isReacted ? 1 : 0) - (mineBefore ? 1 : 0);
  const flame = (): void => {
    const before = isReacted;
    setReacted(!before);
    void actions.react(item, heat.durationMs).then((now) => setReacted(now === undefined ? before : now));
  };

  const coverBox = { position: 'absolute' as const, left: 0, top: 0, width: props.width, height: props.height + (props.below ?? DRAWN_BELOW) };
  const at = mmss(item.startMs);
  const showSound = props.active;
  const circleIcon = runs ? 'pause' : 'play';

  return (
    <Box style={{ width: props.width, height: props.height }} className="bg-void overflow-hidden">
      {/* The cover is laid out over the PHONE's height (the page and the bars under it), as the drawing's `inset:0` art is: a square cover crops
          to 390 x 844 there, not to the 752 the page is, so its shapes fall where drawn. The card clips what runs under the tab bar. */}
      {item.coverUrl ? (
        <Image source={{ uri: thumbUrl(item.coverUrl, props.width / 2) }} style={coverBox} accessibilityIgnoresInvertColors />
      ) : (
        <LinearGradient colors={GLOW} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[coverBox, { opacity: 0.55 }]} pointerEvents="none" />
      )}
      <LinearGradient colors={SCRIM} locations={SCRIM_AT} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: props.height + (props.below ?? DRAWN_BELOW) }} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />

      {/* Sound pill, top left. Visible text says the state; the name says what a tap does. */}
      {showSound ? (
        <Pressable
          onPress={() => actions.toggleSound(item, props.soundOn)}
          accessibilityRole="button"
          accessibilityLabel={props.soundOn ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on'}
          accessibilityState={{ selected: props.soundOn }}
          hitSlop={bars.dotSmall}
          className="absolute overflow-hidden"
          style={{ left: spacing.row + 2, top: props.top + SOUND_DROP, height: PILL, borderRadius: PILL / 2 }}
        >
          <BlurView intensity={30} tint="dark" style={[FILL, { backgroundColor: colour.glassDark }]} />
          <Box className="flex-row items-center justify-center" style={{ height: PILL, paddingHorizontal: spacing.row, gap: spacing.hair + 2 }}>
            <Icon name={props.soundOn ? 'volume-high' : 'volume-mute'} size={16} color={colour.text} />
            <Type step="chip" className="text-text">{props.soundOn ? 'Sound on' : 'Sound off'}</Type>
          </Box>
        </Pressable>
      ) : null}

      <RisingComments comments={item.comments} run={runs} top={props.top + 68} />

      {/* Action column: icon 28, 4, the count in mono 11; 18 between; 16 from the right edge. */}
      <Box className="absolute items-center" style={{ right: RIGHT, bottom: AT.column, gap: spacing.block - 6 }}>
        <Pressable onPress={flame} accessibilityRole="button" accessibilityLabel={`React at ${at}. ${count} reacted`} accessibilityState={{ selected: isReacted }} hitSlop={ACTION_SLOP} className="items-center" style={{ gap: spacing.hair }}>
          <Icon name={isReacted ? 'flame' : 'flame-outline'} size={28} color={isReacted ? colour.hot : colour.text} />
          <Type step="tag" className="text-text" style={COUNT_LINE}>{shortCount(count)}</Type>
        </Pressable>
        <Pressable onPress={() => actions.comments(item)} accessibilityRole="button" accessibilityLabel={`Comments at ${at}`} hitSlop={ACTION_SLOP} className="items-center" style={{ gap: spacing.hair }}>
          <Icon name="chatbubble-outline" size={28} color={colour.text} />
          <Type step="tag" className="text-text" style={COUNT_LINE}>{heat.comments !== undefined ? shortCount(heat.comments) : 'Chat'}</Type>
        </Pressable>
        <Pressable onPress={() => actions.share(item)} accessibilityRole="button" accessibilityLabel={`Share a clip of ${at}`} hitSlop={ACTION_SLOP} className="items-center" style={{ gap: spacing.hair }}>
          <Icon name="share-outline" size={28} color={colour.text} />
          <Type step="tag" className="text-text" style={COUNT_LINE} numberOfLines={1}>Share</Type>
        </Pressable>
      </Box>

      {/* Title block: the hot tag, the title, the show line. */}
      <Box className="absolute" style={{ left: side, right: TITLE_RIGHT, bottom: AT.title, gap: spacing.row - 2 }}>
        {/* The drawing's tag fills the block's width (a flex item stretches); built as drawn. */}
        <Box className="rounded-chip bg-hot" style={{ minHeight: bars.stamp, paddingHorizontal: bars.stampPad, justifyContent: 'center' }} testID="hot-tag">
          <Type step="mono" className="text-void" numberOfLines={1}>{momentTag(item)}</Type>
        </Box>
        <Pressable onPress={() => actions.playFull(item)} accessibilityRole="button" accessibilityLabel={`Play ${item.episodeTitle} from ${at}`} accessibilityHint={item.showTitle}>
          <Type step="hero" className="text-text" numberOfLines={bigText ? 2 : 3}>{item.episodeTitle}</Type>
        </Pressable>
        <Type step="caption" className="text-text2" numberOfLines={1}>{momentLine(item.showTitle, item.reactions)}</Type>
      </Box>

      {/* The Play circle: Pause while the preview runs (stops it); Play otherwise (plays from the moment). */}
      <Pressable
        onPress={() => (runs ? setPaused(true) : actions.playFull(item))}
        accessibilityRole="button"
        accessibilityLabel={runs ? 'Pause preview' : `Play from ${at}`}
        className="absolute items-center justify-center bg-text"
        style={{ right: RIGHT, bottom: AT.circle, width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2 }}
      >
        <Icon name={circleIcon} size={22} color={colour.void} />
      </Pressable>

      {/* The curve; the moment's bars are hot. */}
      <Box className="absolute" style={{ left: side, right: side, bottom: AT.curve }}>
        <Curve
          data={curve ?? heat.buckets ?? NO_HEAT}
          count={CARD_BARS}
          height={CURVE_HEIGHT}
          min={2}
          flat={curve === undefined && heat.buckets === undefined}
          {...(hot ? { hotRange: hot } : {})}
          accessibilityLabel={`Where people reacted. This moment: ${at}`}
        />
      </Box>
    </Box>
  );
}

export const MomentCard = memo(MomentCardView);
