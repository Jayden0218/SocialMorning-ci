// The Charts page's ranked Mosaic: the first tile 2 x 3 with a glowing 64, the next two 1 x 2, the rest 2 x 1.
/**
 * M31 W5-D (T064; design-pulse2 `discover.html` `chartBody`, `chart--screen`). Number 1 is a 2 x 3 tile: its cover at 85 % under a
 * fade that is clear at 20 % and void at the foot, the rank in Unbounded 800 64 with a hot glow, then at the foot the title (Unbounded 800
 * 22, two lines), the show, the reason in hot-text (Geist 600 12), the heat curve (40 bars, 22 tall) and the Play disc (42). Numbers 2 and
 * 3 are 1 x 2 tiles: the rank in Unbounded 800 30 hot-text, the title (Unbounded 700 14), the show, Play (32) at the foot right. From
 * 4 on a tile is 2 x 1: the rank (Unbounded 800 20, text2, 24 wide), a cover of 52, the title and the show, Play (34). A tile opens the
 * episode (a long press opens the episode sheet, as the old row's ⋯ did); Play plays it.
 *
 * Not as drawn: the show's cover fills the lead tile where the drawing has a sample gradient; a row's reason joins the show line.
 */
import { StyleSheet } from 'react-native';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Pressable } from '@/ui/lib/pressable';
import { LinearGradient } from '@/design/tailwind';
import { colour } from '@/design';
import { coverTone } from '@socialmorning/social-core';
import { Artwork, thumbUrl } from '@/ui/kit/Artwork';
import { Curve } from '@/ui/kit/Curve';
import { Type } from '@/ui/kit/Type';
import type { EpisodeCard } from '@/social/api';
import type { ExploreChartItem } from '@/discover/explore-api';
import { DiscPlay } from './Deck';
import { PAGE, PAGE_TYPE } from './measures';
import type { TileSpec } from './Mosaic';
import { useEpisodeHeat } from './useEpisodeHeat';

const FOOT = [colour.clear, colour.pickFoot] as const;
const FOOT_AT = [0.2, 1] as const;
const NO_HEAT: readonly number[] = Array.from<number>({ length: 100 }).fill(0);
const GLOW = { textShadowColor: colour.hot, textShadowRadius: 24, textShadowOffset: { width: 0, height: 0 } } as const;

export type ChartActions = { open: (card: EpisodeCard) => void; play: (card: EpisodeCard) => void; more: (card: EpisodeCard) => void };

/** A long press opens the episode sheet; a screen reader gets it as a custom action ("More for …"). */
function longPress(card: EpisodeCard, more: (card: EpisodeCard) => void): React.ComponentProps<typeof Pressable> {
  return {
    onLongPress: () => more(card),
    accessibilityHint: 'Long-press for more actions',
    accessibilityActions: [{ name: 'longpress', label: `More for ${card.title}` }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => { if (e.nativeEvent.actionName === 'longpress') more(card); },
  };
}

function LeadTile(props: { item: ExploreChartItem; a: ChartActions }): React.ReactElement {
  const { item } = props;
  const { open, play, more } = props.a;
  const heat = useEpisodeHeat(item.episode.id, true);
  const tone = coverTone(item.episode.showTitle);
  return (
    <Box className="flex-1" testID="chart-lead">
      <Box className="absolute inset-0" style={{ backgroundColor: tone.fill, opacity: 0.85 }} accessible={false} importantForAccessibility="no-hide-descendants" />
      {item.episode.imageUrl ? <Image source={{ uri: thumbUrl(item.episode.imageUrl, 400) }} style={[StyleSheet.absoluteFill, { opacity: 0.85 }]} accessibilityIgnoresInvertColors /> : null}
      <LinearGradient colors={FOOT} locations={FOOT_AT} style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" />
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} {...longPress(item.episode, more)} className="flex-1" style={{ padding: PAGE.pad, paddingBottom: PAGE.pad + 42 + 8 }}>
        <Type step="hero" className="text-text" style={[PAGE_TYPE.rank64, GLOW]} testID="chart-rank">1</Type>
        <Box className="mt-auto" style={{ gap: 6 }}>
          <Type step="hero" className="text-text" style={PAGE_TYPE.title22} numberOfLines={2}>{item.episode.title}</Type>
          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{item.episode.showTitle}</Type>
          {item.reason ? <Type step="caption" className="text-hotText font-semibold" style={PAGE_TYPE.small12} numberOfLines={1}>{item.reason}</Type> : null}
        </Box>
      </Pressable>
      <Box className="absolute flex-row items-center" style={{ left: PAGE.pad, right: PAGE.pad, bottom: PAGE.pad, gap: 8 }}>
        <Box className="flex-1"><Curve data={heat.buckets ?? NO_HEAT} count={40} height={22} min={2} played={heat.buckets ? 1 : 0} flat={heat.buckets === undefined} /></Box>
        <DiscPlay size={42} title={item.episode.title} onPress={() => void play(item.episode)} />
      </Box>
    </Box>
  );
}

function SmallTile(props: { item: ExploreChartItem; rank: number; a: ChartActions }): React.ReactElement {
  const { item } = props;
  const { open, play, more } = props.a;
  return (
    <Box className="flex-1">
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} {...longPress(item.episode, more)} className="flex-1" style={{ padding: PAGE.pad, paddingBottom: PAGE.pad + 32 }}>
        <Type step="hero" className="text-hotText" style={PAGE_TYPE.rank30}>{String(props.rank)}</Type>
        <Box style={{ marginTop: 8, gap: 2 }}>
          <Type step="lede" className="text-text" style={PAGE_TYPE.tile14} numberOfLines={3}>{item.episode.title}</Type>
          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{item.episode.showTitle}</Type>
          {item.reason ? <Type step="caption" className="text-hotText font-semibold" style={PAGE_TYPE.small12} numberOfLines={2}>{item.reason}</Type> : null}
        </Box>
      </Pressable>
      <Box className="absolute" style={{ right: 12, bottom: 12 }}><DiscPlay size={32} title={item.episode.title} onPress={() => void play(item.episode)} /></Box>
    </Box>
  );
}

function RowTile(props: { item: ExploreChartItem; rank: number; a: ChartActions }): React.ReactElement {
  const { item } = props;
  const { open, play, more } = props.a;
  const line = item.reason ? `${item.episode.showTitle} · ${item.reason}` : item.episode.showTitle;
  return (
    <Box className="flex-1">
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} {...longPress(item.episode, more)} className="flex-1 flex-row items-center" style={{ paddingLeft: PAGE.pad, paddingRight: PAGE.pad + 34 + 12, gap: 12 }}>
        <Type step="hero" className="text-text2" style={[PAGE_TYPE.rank20, { width: 24 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{String(props.rank)}</Type>
        <Artwork url={item.episode.imageUrl} size={52} name={item.episode.showTitle} />
        <Box className="flex-1 min-w-0">
          <Type step="compact" className="text-text font-bold" numberOfLines={1}>{item.episode.title}</Type>
          <Type step="caption" className="text-text2" style={PAGE_TYPE.small12} numberOfLines={1}>{line}</Type>
        </Box>
      </Pressable>
      <Box className="absolute" style={{ right: PAGE.pad, top: (PAGE.row - 34) / 2 }}><DiscPlay size={34} title={item.episode.title} onPress={() => void play(item.episode)} /></Box>
    </Box>
  );
}

/** The tiles of a chart, best first. */
export function chartTiles(items: readonly ExploreChartItem[], a: ChartActions): TileSpec[] {
  return items.map((item, i) => {
    if (i === 0) return { key: item.key, w: 2, h: 3, node: <LeadTile item={item} a={a} /> };
    if (i < 3) return { key: item.key, w: 1, h: 2, node: <SmallTile item={item} rank={i + 1} a={a} /> };
    return { key: item.key, w: 2, h: 1, node: <RowTile item={item} rank={i + 1} a={a} /> };
  });
}
