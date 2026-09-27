/** Listening history (收听历史, M10): what this phone played, most recent first, with where you stopped. */
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { listeningHistory } from '../src/me/history';
import { Artwork } from '../src/ui/Artwork';
import { mmss, shortDate } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

export default function HistoryScreen(): React.ReactElement {
  const stores = useStores();
  const rows = listeningHistory(stores);
  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.episode.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={<EmptyPicture emoji="🕒" line="Nothing played yet" />}
      renderItem={({ item }) => {
        const show = stores.feeds.getShow(item.episode.feedUrl);
        const where = item.finished ? 'Finished' : `Stopped at ${mmss(item.offsetMs)}`;
        return (
          <Link href={{ pathname: '/episode/[id]', params: { id: item.episode.id } }} asChild>
            <Pressable className="flex-row gap-row py-row items-center" accessibilityRole="button" accessibilityLabel={`${item.episode.title}. ${where}`}>
              <Artwork url={item.episode.imageUrl ?? show?.imageUrl} size={56} rounded="row" />
              <View className="flex-1">
                <Text className="text-text text-sm font-semibold" numberOfLines={2}>{item.episode.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{[show?.title, where, shortDate(item.updatedAt)].filter(Boolean).join(' · ')}</Text>
              </View>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
