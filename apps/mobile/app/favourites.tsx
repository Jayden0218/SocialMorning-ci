/**
 * Favourites (我的收藏, M10; tabs M10b US2): Episodes you starred on their page, and
 * Comments you starred with ☆ — each newest first, both searchable, both following the
 * account (src/sync/library.ts).
 */
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { hit } from '../src/design';
import { listFavComments, type FavComment } from '../src/me/fav-comments';
import { listFavourites, type Favourite } from '../src/me/favourites';
import { matchesAll } from '../src/me/history';
import { FilterBar } from '../src/ui/me/FilterBar';
import { Artwork } from '../src/ui/Artwork';
import { mmss } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';

const TAP = { minHeight: hit.min };

export default function FavouritesScreen(): React.ReactElement {
  const stores = useStores();
  const [tab, setTab] = useState<'episodes' | 'comments'>('episodes');
  const [rows, setRows] = useState<Favourite[]>(() => listFavourites(stores.settings));
  const [comments, setComments] = useState<FavComment[]>(() => listFavComments(stores.settings));
  const [term, setTerm] = useState('');
  useFocusEffect(useCallback(() => { setRows(listFavourites(stores.settings)); setComments(listFavComments(stores.settings)); }, [stores]));
  const known = rows.map((f) => ({ f, e: stores.feeds.getEpisode(f.episodeId) }))
    .filter((r) => r.e !== undefined && matchesAll(term, [r.e.title, stores.feeds.getShow(r.e.feedUrl)?.title]));
  const starred = comments.filter((c) => matchesAll(term, [c.body, c.author, stores.feeds.getEpisode(c.episodeId)?.title]));
  const any = tab === 'episodes' ? rows.length > 0 : comments.length > 0;

  const header = (
    <Box>
      <Box className="flex-row border-b-hairline border-separator mb-row">
        {(['episodes', 'comments'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'episodes' ? 'Episodes' : 'Comments'} className="flex-1 items-center justify-center" style={TAP}>
            <Text className={tab === t ? 'text-accent text-sm font-bold' : 'text-muted text-sm'}>{t === 'episodes' ? 'Episodes' : 'Comments'}</Text>
          </Pressable>
        ))}
      </Box>
      {any ? <FilterBar term={term} onTerm={setTerm} placeholder="Search your favourites" /> : null}
    </Box>
  );

  if (tab === 'comments') {
    return (
      <FlatList
        className="flex-1 bg-background"
        data={starred}
        keyExtractor={(c) => c.commentId}
        contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyPicture icon="chatbubble-outline" line={term ? 'Nothing matches' : 'No favourite comments yet — tap ☆ on a comment'} />}
        renderItem={({ item }) => {
          const e = stores.feeds.getEpisode(item.episodeId);
          return (
            <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episodeId, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
              accessibilityRole="button" accessibilityLabel={`${item.author}: ${item.body}`} className="py-row border-b-hairline border-separator">
              <Text className="text-muted text-xs">{item.author}{item.offsetMs !== null ? ` · at ${mmss(item.offsetMs)}` : ''}</Text>
              <Text className="text-text text-sm" numberOfLines={4}>{item.body || 'This comment was deleted'}</Text>
              <Text className="text-muted text-xs mt-1" numberOfLines={1}>{e?.title ?? ''}</Text>
            </Pressable>
          );
        }}
      />
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={known}
      keyExtractor={(r) => r.f.episodeId}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyPicture icon="star-outline" line={term ? 'Nothing matches' : 'No favourites yet — star an episode on its page'} />}
      renderItem={({ item }) => {
        const e = item.e!;
        const show = stores.feeds.getShow(e.feedUrl);
        return (
          <Link href={{ pathname: '/episode/[id]', params: { id: e.id } }} asChild>
            <Pressable className="flex-row gap-row py-row items-center" accessibilityRole="button" accessibilityLabel={e.title}>
              <Artwork url={e.imageUrl ?? show?.imageUrl} size={56} rounded="row" />
              <Box className="flex-1">
                <Text className="text-text text-sm font-semibold" numberOfLines={2}>{e.title}</Text>
                <Text className="text-muted text-xs" numberOfLines={1}>{show?.title ?? ''}</Text>
              </Box>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}
