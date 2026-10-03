/**
 * The full chart (M12 FR-071): Discover's "Talked about" ranking — the same 7 days, the same
 * order — without the three-page cut Discover shows. From `GET /v1/discover/chart`; shows
 * this listener hid are left out here too.
 *
 * M17 T056 (`Chart-B`): the podium. Number 1 is a white card with a large artwork, a serif
 * accent rank over its corner, a serif title and the reason in the accent; numbers 2 and 3
 * sit side by side as two smaller cards with their rank top right; from 4 on, the numbered
 * rows (divided by hairlines). Same data, same order, same open and play.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Loader } from '@/ui/kit/Loader';
import { Card } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyPicture } from '@/ui/me/parts';
import { EpisodeLine, PlayButton } from '@/ui/discover/parts';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { useM12Api, type ChartItem } from '@/social/m12-api';
import { PageHeader } from '@/ui/kit/PageHeader';

const TAP = { minHeight: hit.min };
/** How many ranks are drawn as cards above the rows (`Chart-B`: 1 wide, 2 and 3 side by side). */
const PODIUM = 3;
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: ChartItem[] };

export default function ChartScreen(): React.ReactElement {
  const m12 = useM12Api();
  const { open, play } = useCardActions();
  const { hiddenFeeds } = useSafety();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    m12.chart().then((items) => setState({ kind: 'ok', items }), () => setState({ kind: 'error' }));
  }, [m12]);
  useEffect(() => { load(); }, [load]);

  const items = state.kind === 'ok' ? state.items.filter((i) => !hiddenFeeds.has(i.episode.feedUrl)) : [];
  const [top, second, third] = items;
  const pair = [second, third].filter((i): i is ChartItem => i !== undefined);

  /** Number 1: the wide card. */
  const first = (item: ChartItem): React.ReactElement => (
    <Card padded={false} className="flex-row items-center gap-row p-row mb-row">
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="flex-1 flex-row items-center gap-section" style={TAP}>
        <Box>
          <Artwork url={item.episode.imageUrl} size={110} rounded="row" name={item.episode.showTitle} />
          <Text className="absolute -left-1.5 -top-2 text-accent text-display font-display" maxFontSizeMultiplier={1.3}>1</Text>
        </Box>
        <Box className="flex-1">
          <Text className="text-text text-title font-display" numberOfLines={3}>{item.episode.title}</Text>
          <Text className="text-muted text-xs mt-1.5" numberOfLines={1}>{item.episode.showTitle}</Text>
          {item.reason ? <Text className="text-accent text-xs font-bold mt-1" numberOfLines={2}>{item.reason}</Text> : null}
        </Box>
      </Pressable>
      <PlayButton title={item.episode.title} onPress={() => void play(item.episode)} />
    </Card>
  );

  /** Numbers 2 and 3: half-width cards, the rank top right, Play bottom right. */
  const small = (item: ChartItem, rank: number): React.ReactElement => (
    <Card key={item.key} padded={false} className="flex-1 p-2.5">
      <Pressable onPress={() => void open(item.episode)} accessibilityRole="button" accessibilityLabel={`${item.episode.title}, ${item.episode.showTitle}`} className="gap-2" style={TAP}>
        <Box className="flex-row items-start justify-between">
          <Artwork url={item.episode.imageUrl} size={64} rounded="row" name={item.episode.showTitle} />
          <Text className="text-accent text-hero font-display" maxFontSizeMultiplier={1.3}>{rank}</Text>
        </Box>
        <Text className="text-text text-meta font-bold" numberOfLines={2}>{item.episode.title}</Text>
        <Text className="text-muted text-micro" numberOfLines={2}>{item.reason ? `${item.episode.showTitle} · ${item.reason}` : item.episode.showTitle}</Text>
      </Pressable>
      <Box className="flex-row justify-end">
        <PlayButton title={item.episode.title} onPress={() => void play(item.episode)} />
      </Box>
    </Card>
  );

  return (
    <>
    <PageHeader title="Talked about" />
    <FlatList
      className="flex-1 bg-background"
      data={items.slice(PODIUM)}
      keyExtractor={(i) => i.key}
      contentContainerClassName="px-screen-x pb-24 flex-grow"
      ListHeaderComponent={
        <Box>
          <Text className="text-muted text-body mb-section">The episodes listeners talked about most in the last 7 days.</Text>
          {top ? first(top) : null}
          {pair.length > 0 ? <Box className="flex-row gap-row mb-row">{pair.map((it, n) => small(it, n + 2))}{pair.length === 1 ? <Box className="flex-1" /> : null}</Box> : null}
        </Box>
      }
      ListEmptyComponent={
        items.length > 0 ? undefined
        : state.kind === 'loading' ? <Loader className="my-section" />
        : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">Couldn't load the chart right now.</Text>
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}>
              <Text className="text-accent text-sm font-semibold">Retry</Text>
            </Pressable>
          </Box>
        ) : <EmptyPicture icon="chatbubbles-outline" line="Nothing talked about this week yet" />
      }
      renderItem={({ item, index }) => (
        <EpisodeLine card={item.episode} rank={index + PODIUM + 1} size={48} divided {...(item.reason ? { line: item.reason } : {})} onOpen={() => void open(item.episode)} onPlay={() => void play(item.episode)} />
      )}
    />
    </>
  );
}
