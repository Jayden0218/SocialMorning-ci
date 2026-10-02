/**
 * The full chart (M12 FR-071): Discover's "Talked about" ranking — the same 7 days, the same
 * order — without the three-page cut Discover shows. From `GET /v1/discover/chart`; shows
 * this listener hid are left out here too.
 */
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { hit } from '../src/design';
import { Loader } from '../src/ui/Loader';
import { EmptyPicture } from '../src/ui/me/parts';
import { EpisodeLine } from '../src/ui/discover/parts';
import { useCardActions } from '../src/discover/useDiscover';
import { useSafety } from '../src/safety/context';
import { useM12Api, type ChartItem } from '../src/social/m12-api';
import { PageHeader } from '../src/ui/PageHeader';

const TAP = { minHeight: hit.min };
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
  return (
    <>
    <PageHeader title="Talked about" />
    <FlatList
      className="flex-1 bg-background"
      data={items}
      keyExtractor={(i) => i.key}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListHeaderComponent={<Text className="text-muted text-xs mb-row">The episodes listeners talked about most in the last 7 days.</Text>}
      ListEmptyComponent={
        state.kind === 'loading' ? <Loader className="my-section" />
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
        <EpisodeLine card={item.episode} rank={index + 1} size={56} {...(item.reason ? { line: item.reason } : {})} onOpen={() => void open(item.episode)} onPlay={() => void play(item.episode)} />
      )}
    />
    </>
  );
}
