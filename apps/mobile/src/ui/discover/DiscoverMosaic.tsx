// The top of Discover as a mosaic: today's pick, the hottest moment now, and the shortcuts as tiles.
/**
 * M31 T025 (design-pulse2 `index.html#discover--screen`; layout pattern Mosaic). A two-column grid,
 * rows of 84, 10 apart, tile radius 22, padding 14, a 28 lane on the left for the edge label. In order:
 *   - the pick (2 wide x 3 tall): the cover fills it (90 %), words on a gradient that starts at 30 % and
 *     is void at 92 % at the foot — the eyebrow "TODAY'S PICK · OCT 27" (Geist Mono 11, 0.08 em) with
 *     "PAST →" in hot words at the right, then at the foot the title (Unbounded 800 24), the owner's
 *     note (Geist italic 14), the curve (26 tall, 50 bars, hot to violet), the counts in mono 11 (they
 *     wrap to a second line rather than cut) with "+" (40, ring) and Play (40, light);
 *   - Hot now (1 x 2, raise2): "HOT NOW" in mono 11, the hottest moment as a 34 Unbounded timestamp in
 *     the hot gradient (each character a step of it), what people said, and "41 reacting" at the foot;
 *     a tap plays from it; absent when there are none;
 *   - the shortcuts as 1 x 1 tiles (icon 24, label Geist 600 13), in the order drawn — Friends
 *     listening, Categories (both beside Hot now), Queue (with its count in mono), Issues, Premium
 *     (solid #2A1530), Academy, Plaza, Talked about — unless the admin saved another order;
 *   - offline with nothing cached: one 2 x 2 dashed tile in place of the pick and Hot now.
 * Every action the old pick card and shortcut grid had is here under the same name.
 *
 * Not as drawn (gate log): "Friends listening" shows no two faces (they would need a request the page
 * does not make, and drawn without data they would claim friends are listening).
 */
import { StyleSheet } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Image } from '@/ui/lib/image';
import { LinearGradient } from '@/design/tailwind';
import { colour, gutter, radius, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { Curve } from '@/ui/kit/Curve';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { thumbUrl } from '@/ui/kit/Artwork';
import { mixColour } from '@/ui/kit/pulse-math';
import { useColours } from '@/ui/kit/useColours';
import { compactCount, pluralCompact } from '@/ui/kit/format';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import type { EpisodeCard } from '@/social/api';
import type { PickWithFaces } from '@/discover/explore-api';
import type { Moment } from '@/discover/moments-api';
import { useEpisodeHeat } from './useEpisodeHeat';
import { shortDate } from './sections-common';
import { shortCount } from './moments-logic';
import { drawnType } from '@/design/type-px';

/** Row height, gap and tile radius of the mosaic. */
export const MOSAIC = { row: 84, gap: 10, radius: radius.card - 2, lane: 28, pad: 14, pickRows: 3, hotRows: 2 } as const;
export const PICK_HEIGHT = MOSAIC.row * MOSAIC.pickRows + MOSAIC.gap * (MOSAIC.pickRows - 1);
export const HOT_HEIGHT = MOSAIC.row * MOSAIC.hotRows + MOSAIC.gap * (MOSAIC.hotRows - 1);
const PICK_BARS = 50;
const PICK_CURVE = 26;
/** The eyebrow's spacing, 0.08 em of 11. */
const EYEBROW_TRACK = drawnType.trackEyebrow;
/** The pick's + and Play are drawn 40 tall; `hitSlop` 4 makes the touch 48. */
const BUTTON = 40;
const FILL = StyleSheet.absoluteFill;
const TILE = { borderRadius: MOSAIC.radius, padding: MOSAIC.pad, overflow: 'hidden' as const };
const WASH = [colour.violet, colour.hot] as const;
/** The pick's foot: clear at 30 %, void at 92 % at the bottom (the drawing's `transparent 30%, rgba(6,6,8,.92)`). */
const FOOT = [colour.clear, colour.pickFoot] as const;
const FOOT_AT = [0.3, 1] as const;
/** Touch room round the drawn 11 pt words, so the targets are 44+ without moving the words. */
const PAST_SLOP = { top: 16, bottom: 16, left: 16, right: 0 };
const TITLE_SLOP = { top: 10, bottom: 10 };
/** Two equal columns, whatever the words inside want: the drawing's grid is `1fr 1fr` (a bare `flex: 1` has an automatic minimum width on the web, so wider words widened their tile; `minWidth: 0` is the fix). */
export const HALF = { flex: 1, minWidth: 0 } as const;
const NO_HEAT: readonly number[] = new Array<number>(100).fill(0);

export type ShortcutTile = { label: string; icon: IconName; onPress: () => void; /** Premium is drawn in its own solid violet-brown. */ tinted?: boolean; /** Queue: how many are in it, drawn after the label in mono. */ count?: number };

export type MosaicActions = {
  onOpen: (card: EpisodeCard) => void;
  onPlay: (card: EpisodeCard) => void;
  onQueue: (card: EpisodeCard) => void;
  onPast?: () => void;
  onHot: (m: Moment) => void;
};

/** The pick tile: the first of today's picks. */
export function PickTile(props: { pick: PickWithFaces; date?: string; stats?: { listeners: number; comments: number } | undefined; actions: MosaicActions }): React.ReactElement {
  const { pick, actions } = props;
  const ep = pick.episode;
  const heat = useEpisodeHeat(ep.id, true);
  const stats = pick.stats ?? props.stats;
  const eyebrow = props.date ? `TODAY'S PICK · ${shortDate(props.date).toUpperCase()}` : "TODAY'S PICK";
  return (
    <Box className="bg-raise" style={[TILE, { minHeight: PICK_HEIGHT }]}>
      {ep.imageUrl ? <Image source={{ uri: thumbUrl(ep.imageUrl, 400) }} style={[FILL, { opacity: 0.9 }]} accessibilityIgnoresInvertColors /> : <LinearGradient colors={WASH} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[FILL, { opacity: 0.4 }]} pointerEvents="none" />}
      <LinearGradient colors={FOOT} locations={FOOT_AT} style={FILL} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
      <Box className="flex-row items-start justify-between">
        <Type step="tag" className="text-text flex-1" style={EYEBROW_TRACK} numberOfLines={1}>{eyebrow}</Type>
        {actions.onPast ? (
          <Pressable onPress={actions.onPast} accessibilityRole="link" accessibilityLabel="Past picks" hitSlop={PAST_SLOP}>
            <Type step="tag" className="text-hotText" style={EYEBROW_TRACK}>PAST →</Type>
          </Pressable>
        ) : null}
      </Box>
      <Box className="absolute" style={{ left: MOSAIC.pad, right: MOSAIC.pad, bottom: MOSAIC.pad, gap: spacing.gap }}>
        <Pressable onPress={() => actions.onOpen(ep)} accessibilityRole="button" accessibilityLabel={`Open ${ep.title}`} accessibilityHint={ep.showTitle} hitSlop={TITLE_SLOP}>
          <Type step="statement" className="text-text font-extrabold" numberOfLines={2}>{ep.title}</Type>
        </Pressable>
        {pick.why ? <Type step="quote" className="text-quote italic" numberOfLines={2}>{`“${pick.why}”`}</Type> : null}
        <Curve data={heat.buckets ?? NO_HEAT} count={PICK_BARS} height={PICK_CURVE} min={2} played={heat.buckets ? 1 : 0} flat={heat.buckets === undefined} />
        <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
          {stats ? <Type step="tag" className="text-text2 flex-1" numberOfLines={2}>{`${compactCount(stats.listeners)} listened · ${pluralCompact(stats.comments, 'comment')}`}</Type> : <Box className="flex-1" />}
          <Pressable onPress={() => actions.onQueue(ep)} accessibilityRole="button" accessibilityLabel={`Add ${ep.title} to the queue`} hitSlop={spacing.hair} className="items-center justify-center border-[1.5px] border-outline" style={{ width: BUTTON, height: BUTTON, borderRadius: BUTTON / 2 }}>
            <Icon name="add" size={18} color={colour.text} />
          </Pressable>
          <Pressable onPress={() => actions.onPlay(ep)} accessibilityRole="button" accessibilityLabel={`Play ${ep.title}`} hitSlop={spacing.hair} className="flex-row items-center justify-center bg-text" style={{ height: BUTTON, paddingHorizontal: spacing.section, borderRadius: BUTTON / 2, gap: spacing.gap - 2 }}>
            <Icon name="play" size={14} color={colour.void} />
            <Type step="row" className="text-void">Play</Type>
          </Pressable>
        </Box>
      </Box>
    </Box>
  );
}

/** "14:32" with each character (M31 F13: a number in a fixed 1 x 2 tile does not grow with the system font - cap 1 - and shrinks to fit rather than wrap) a step of the hot gradient (a gradient on words needs a masked view the app does not ship). */
export function GradientTime(props: { text: string; from: string }): React.ReactElement {
  const chars = [...props.text];
  return (
    <Type step="figure" className="text-hotText" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={1} style={{ marginTop: spacing.row - 2 }} testID="hot-now-time">
      {chars.map((ch, i) => <Type key={i} step="figure" className="text-hotText" maxFontSizeMultiplier={1} style={{ color: mixColour(props.from, colour.hotEnd, (i + 0.5) / chars.length) }}>{ch}</Type>)}
    </Type>
  );
}

/** Hot now: the hottest moment of the Moments list, as a timestamp. */
export function HotNowTile(props: { moment: Moment; onPress: (m: Moment) => void }): React.ReactElement {
  const m = props.moment;
  const c = useColours();
  const said = m.comments[0]?.text;
  return (
    <Pressable
      onPress={() => props.onPress(m)}
      accessibilityRole="button"
      accessibilityLabel={`Hot now: play ${m.episodeTitle} from ${mmss(m.startMs)}. ${shortCount(m.reactions)} reacting`}
      className="bg-raise2"
      // The padding is on an inner box, not on this tile: a pressable's box on the web is content-box, so its 28 of padding was added to its
      // `flex: 1` share and the tile came out 28 wider than the column beside it (found by the wave-1 capture).
      style={[{ borderRadius: MOSAIC.radius, overflow: 'hidden', minHeight: HOT_HEIGHT }, HALF]}
    >
      <Box style={{ padding: MOSAIC.pad, paddingBottom: spacing.row, flexGrow: 1 }}>
        <Type step="tag" className="text-text3">HOT NOW</Type>
        <GradientTime text={mmss(m.startMs)} from={c.hot} />
        {said ? <Type step="caption" className="text-text" style={{ marginTop: spacing.gap }} numberOfLines={3}>{`“${said}”`}</Type> : null}
        {/* M31 R2 (fontscale2 F7): in the flow after the quote, pushed to the foot by the auto margin when the tile has room - never over the quote. */}
        <Type step="tag" className="text-hotText" numberOfLines={1} style={{ marginTop: 'auto', paddingTop: spacing.gap }}>{`${shortCount(m.reactions)} reacting`}</Type>
      </Box>
    </Pressable>
  );
}

/** One shortcut: a 1 x 1 tile. */
export function ShortcutMosaicTile(props: { tile: ShortcutTile }): React.ReactElement {
  const c = props.tile;
  return (
    <Pressable
      onPress={c.onPress}
      accessibilityRole="button"
      accessibilityLabel={c.label}
      {...(c.count !== undefined ? { accessibilityValue: { text: `${c.count} queued` } } : {})}
      className={c.tinted ? 'bg-premiumTint' : 'bg-raise'}
      style={[TILE, { minHeight: MOSAIC.row, gap: spacing.gap }, HALF]}
    >
      <Icon name={c.icon} size={24} color={colour.text} />
      <Type step="caption" className="text-text font-semibold" numberOfLines={2}>
        {c.label}
        {c.count !== undefined ? <Type step="caption" className="text-text3 font-mono">{` ${c.count}`}</Type> : null}
      </Type>
    </Pressable>
  );
}

/** The cells of a 2-wide grid: pairs, the last one padded with `null`. */
export function pairs<T>(items: readonly T[]): (T | null)[][] {
  const out: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push([items[i]!, items[i + 1] ?? null]);
  return out;
}

export function DiscoverMosaic(props: {
  pick: PickWithFaces | undefined;
  date?: string;
  stats?: { listeners: number; comments: number } | undefined;
  hot: Moment | undefined;
  tiles: readonly ShortcutTile[];
  /** No Discover data at all (offline, nothing cached). */
  offline: boolean;
  actions: MosaicActions;
}): React.ReactElement {
  const { width } = useWindowDimensions();
  // The first two shortcuts sit beside Hot now (when it is drawn); the rest run two to a row.
  const beside = props.hot ? props.tiles.slice(0, 2) : [];
  const rest = pairs(props.hot ? props.tiles.slice(2) : props.tiles);
  return (
    <Box style={{ marginLeft: MOSAIC.lane, marginRight: gutter(width) - spacing.hair, gap: MOSAIC.gap }}>
      {props.offline ? (
        <Box className="items-start justify-center border border-dashed border-line" style={[TILE, { minHeight: MOSAIC.row * 2 + MOSAIC.gap, gap: spacing.gap }]} accessibilityLiveRegion="polite">
          <Icon name="alert-circle-outline" size={24} color={colour.warn} />
          <Type step="row" className="text-text">Couldn't reach the server, and nothing is cached yet.</Type>
          <Type step="caption" className="text-text2">Pull down to try again.</Type>
        </Box>
      ) : (
        <>
          {props.pick ? <PickTile pick={props.pick} {...(props.date ? { date: props.date } : {})} stats={props.stats} actions={props.actions} /> : null}
          {props.hot ? (
            <Box className="flex-row" style={{ gap: MOSAIC.gap }}>
              <HotNowTile moment={props.hot} onPress={props.actions.onHot} />
              <Box style={[{ gap: MOSAIC.gap }, HALF]}>
                {beside.map((t) => <ShortcutMosaicTile key={t.label} tile={t} />)}
              </Box>
            </Box>
          ) : null}
        </>
      )}
      {(props.offline ? pairs(props.tiles) : rest).map((row, r) => (
        <Box key={r} className="flex-row" style={{ gap: MOSAIC.gap }}>
          {row.map((t, i) => (t === null ? <Box key={`empty-${i}`} className="flex-1" /> : <ShortcutMosaicTile key={t.label} tile={t} />))}
        </Box>
      ))}
    </Box>
  );
}
