/** Listening history (收听历史, M10): what this phone played, most recent first, with where you stopped; search and "Only finished" as in the reference. */
import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { listeningHistory, matchesAll } from '../src/me/history';
import { FilterBar } from '../src/ui/me/FilterBar';
import { Artwork } from '../src/ui/Artwork';
import { mmss, shortDate } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

export default function HistoryScreen(): React.ReactElement {
  const stores = useStores();
  const [term, setTerm] = useState('');
  const [finished, setFinished] = useState(false);
  const rows = listeningHistory(stores).filter((r) => (!finished || r.finished) && matchesAll(term, [r.episode.title, stores.feeds.getShow(r.episode.feedUrl)?.title]));
  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.episode.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<FilterBar term={term} onTerm={setTerm} placeholder="Search your history" toggle={{ label: 'Only finished', value: finished, onChange: setFinished }} />}
      ListEmptyComponent={<EmptyPicture icon="time-outline" line={term || finished ? 'Nothing matches' : 'Nothing played yet'} />}
      renderItem={({ item }) => {
        const show = stores.feeds.getShow(item.episode.feedUrl);
        const where = item.finished ? 'Finished' : `Stopped at ${mmss(item.offsetMs)}`;
        return (
          <Link href={{ pathname: '/episode/[id]', params: { id: item.episode.id } }} asChild>
            <Pressable className="flex-row gap-row py-row items-center" accessibilityRole="button" accessibilityLabel={`${item.episode.title}. ${where}`}>
              <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={56} rounded="row" />
              <Box className="flex-1">
                <Text className="text-text text-sm font-semibold" numberOfLines={2}>{item.episode.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{[show?.title, where, shortDate(item.updatedAt)].filter(Boolean).join(' · ')}</Text>
              </Box>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
