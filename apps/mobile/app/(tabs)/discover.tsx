/**
 * Discover (M5 US1): picks, listened-and-talked-about, chart trending; works signed out;
 * stale offline; pull to refresh.
 *
 * M8 US2 (FR-007): when signed in, **For You is the first section**, above all three of
 * those. They keep their order and behaviour underneath it, and a signed-out visitor sees
 * exactly what they saw before — which is why M5's H1 row is not retired.
 */
import { RefreshControl, ScrollView, Text } from 'react-native';
import { useDiscover } from '../../src/discover/useDiscover';
import { useForYou } from '../../src/recs/useForYou';
import { useRecOutbox } from '../../src/recs/useRecOutbox';
import { useSocial } from '../../src/social/context';
import { DiscoverSections } from '../../src/ui/DiscoverSections';
import { ForYou } from '../../src/ui/ForYou';
import { BOTTOM_INSET } from '../../src/ui/Screen';

export default function DiscoverScreen(): React.ReactElement {
  const { view, refreshing, refresh, open } = useDiscover();
  const { listener } = useSocial();
  const forYou = useForYou(listener !== undefined);
  const outbox = useRecOutbox(listener !== undefined, forYou.view?.body.items);
  const refreshBoth = async (): Promise<void> => { await Promise.all([refresh(), forYou.refresh()]); };
  return (
    <ScrollView contentContainerClassName="p-4" contentContainerStyle={{ paddingBottom: BOTTOM_INSET }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshBoth()} />}>
      <ForYou
        body={forYou.view?.body}
        stale={forYou.view?.stale ?? false}
        fetchedAt={forYou.view?.fetchedAt}
        onOpen={(c, index) => { outbox.opened(index); void open(c); }}
      />
      {view ? <DiscoverSections body={view.body} stale={view.stale} fetchedAt={view.fetchedAt} onOpen={(c) => void open(c)} /> : <Text className="text-muted">{refreshing ? 'Loading…' : "Couldn't reach the server, and nothing is cached yet."}</Text>}
    </ScrollView>
  );
}
