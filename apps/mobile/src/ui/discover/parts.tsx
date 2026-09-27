/**
 * The small pieces the redesigned Discover (M10) is built from: a section title, the
 * round play button, one episode line, a swipeable row of pages, and the search bar.
 * Colours are tokens only: section titles take `accent`, the play button the brand
 * `primary` fill, cards `surface`.
 */
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { hit } from '../../design';
import type { EpisodeCard } from '../../social/api';
import { Artwork } from '../Artwork';

const TAP = { minHeight: hit.min, minWidth: hit.min };

export function SectionTitle(props: { title: string; action?: { label: string; onPress: () => void }; badge?: number }): React.ReactElement {
  return (
    <View className="flex-row items-center justify-between px-screen-x mt-section mb-row">
      <View className="flex-row items-center gap-row flex-1">
        <Text className="text-accent text-base font-bold" accessibilityRole="header" numberOfLines={1}>{props.title}</Text>
        {props.badge !== undefined ? (
          <View className="bg-primary rounded-pill px-2 py-0.5"><Text className="text-onPrimary text-xs font-bold">{props.badge}</Text></View>
        ) : null}
      </View>
      {props.action ? (
        <Pressable onPress={props.action.onPress} accessibilityRole="link" accessibilityLabel={props.action.label} className="justify-center pl-row" style={TAP}>
          <Text className="text-muted text-xs">{props.action.label} →</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The round play button every row ends with. */
export function PlayButton(props: { title: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Play ${props.title}`} className="items-center justify-center" style={TAP}>
      <View className="w-10 h-10 rounded-pill bg-primary items-center justify-center">
        <Text className="text-onPrimary text-sm pl-0.5">▶</Text>
      </View>
    </Pressable>
  );
}

/** Artwork · show · title (2 lines) · a muted line · play. The row opens the episode. */
export function EpisodeLine(props: { card: EpisodeCard; line?: string; rank?: number; size?: number; onOpen: () => void; onPlay: () => void; label?: string }): React.ReactElement {
  const { card } = props;
  const size = props.size ?? 72;
  return (
    <View className="flex-row items-center gap-row py-row">
      <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel={props.label ?? `${card.title}, ${card.showTitle}`} className="flex-row items-center gap-row flex-1">
        <Artwork url={card.imageUrl} size={size} rounded="row" />
        {props.rank !== undefined ? <Text className="text-muted text-sm w-5 text-center">{props.rank}</Text> : null}
        <View className="flex-1">
          {props.rank === undefined ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>{card.title}</Text>
          {props.rank !== undefined ? <Text className="text-muted text-xs" numberOfLines={1}>{card.showTitle}</Text> : null}
          {props.line ? <Text className="text-muted text-xs" numberOfLines={1}>{props.line}</Text> : null}
        </View>
      </Pressable>
      <PlayButton title={card.title} onPress={props.onPlay} />
    </View>
  );
}

/**
 * Pages side by side, swiped one at a time; each page is a bit narrower than the screen
 * so the next one peeks in — the cue that there is more. `onPage` reports the page shown.
 */
export function Pager(props: { count: number; children: (index: number, width: number) => React.ReactNode; onPage?: (index: number) => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const page = Math.round(width * 0.86);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={page}
      decelerationRate="fast"
      contentContainerClassName="px-screen-x"
      onMomentumScrollEnd={(e) => props.onPage?.(Math.round(e.nativeEvent.contentOffset.x / page))}
    >
      {Array.from({ length: props.count }, (_, i) => (
        <View key={i} style={{ width: page }} className="pr-row">{props.children(i, page)}</View>
      ))}
    </ScrollView>
  );
}

/** A search box that is a button: tapping it opens Search, where typing happens. */
export function SearchBar(props: { onPress: () => void }): React.ReactElement {
  return (
    <Pressable onPress={props.onPress} accessibilityRole="search" accessibilityLabel="Search shows and episodes" className="mx-screen-x flex-row items-center gap-row bg-surface rounded-row px-row" style={TAP}>
      <View className="w-4 h-4 rounded-pill border-2 border-separator" />
      <Text className="text-muted text-sm">Search shows and episodes</Text>
    </Pressable>
  );
}
