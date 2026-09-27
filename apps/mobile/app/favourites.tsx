/** Favourites (我的收藏, M10): the episodes you starred, newest first. Starring is on the episode page. */
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { listFavourites, type Favourite } from '../src/me/favourites';
import { matchesAll } from '../src/me/history';
import { FilterBar } from '../src/ui/me/FilterBar';
import { Artwork } from '../src/ui/Artwork';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

export default function FavouritesScreen(): React.ReactElement {
  const stores = useStores();
  const [rows, setRows] = useState<Favourite[]>(() => listFavourites(stores.settings));
  const [term, setTerm] = useState('');
  useFocusEffect(useCallback(() => { setRows(listFavourites(stores.settings)); }, [stores]));
  const known = rows.map((f) => ({ f, e: stores.feeds.getEpisode(f.episodeId) }))
    .filter((r) => r.e !== undefined && matchesAll(term, [r.e.title, stores.feeds.getShow(r.e.feedUrl)?.title]));
  return (
    <FlatList
      className="flex-1 bg-background"
      data={known}
      keyExtractor={(r) => r.f.episodeId}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={rows.length > 0 ? <FilterBar term={term} onTerm={setTerm} placeholder="Search your favourites" /> : undefined}
      ListEmptyComponent={<EmptyPicture icon="star-outline" line={term ? 'Nothing matches' : 'No favourites yet — star an episode on its page'} />}
      renderItem={({ item }) => {
        const e = item.e!;
        const show = stores.feeds.getShow(e.feedUrl);
        return (
          <Link href={{ pathname: '/episode/[id]', params: { id: e.id } }} asChild>
            <Pressable className="flex-row gap-row py-row items-center" accessibilityRole="button" accessibilityLabel={e.title}>
              <Artwork url={e.imageUrl ?? show?.imageUrl} size={56} rounded="row" />
              <View className="flex-1">
                <Text className="text-text text-sm font-semibold" numberOfLines={2}>{e.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{show?.title ?? ''}</Text>
              </View>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
