// One topic list in full: every episode the editors put in it, with its note.
/**
 * M21 US7 (T082): the page a topic-list card on Discover opens. The list comes from the
 * Discover copy already on the phone (no extra call), so it opens at once and offline.
 */
import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { EmptyPicture } from '@/ui/me/parts';
import { EpisodeLine } from '@/ui/discover/parts';
import { createDiscover } from '@/discover/cache';
import { useCardActions } from '@/discover/useDiscover';
import { useSafety } from '@/safety/context';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';

export default function TopicListScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const stores = useStores();
  const { hiddenFeeds } = useSafety();
  const { open, play } = useCardActions();
  const list = useMemo(() => {
    const view = createDiscover({ api, cache: stores.feedCache, now: () => Date.now() }).cached();
    return view?.body.collections?.find((c) => c.id === id);
  }, [api, stores, id]);
  const items = (list?.items ?? []).filter((i) => !hiddenFeeds.has(i.episode.feedUrl));
  return (
    <>
      <PageHeader title={list?.title ?? 'Topic list'} {...(list?.subtitle ? { subtitle: list.subtitle } : {})} />
      <FlatList
        className="flex-1 bg-background"
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerClassName="px-screen-x pb-24 flex-grow"
        ListFooterComponent={items.length > 0 ? <EndOfList /> : undefined}
        ListEmptyComponent={<EmptyPicture icon="albums-outline" line="This list is not on the phone yet — open Discover first" />}
        renderItem={({ item, index }) => (
          <Box>
            <EpisodeLine card={item.episode} size={56} divided={index > 0} onOpen={() => void open(item.episode)} onPlay={() => void play(item.episode)} />
            {item.why ? <Text className="text-text text-meta font-display-semibold pb-row">{`“${item.why}”`}</Text> : null}
          </Box>
        )}
      />
    </>
  );
}
