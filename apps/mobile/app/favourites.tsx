// Starred episodes and starred comments, in two tabs, with search.
/**
 * Favourites (我的收藏, M10; tabs M10b US2): Episodes you starred on their page, and
 * Comments you starred with ☆ — each newest first, both searchable, both following the
 * account (src/sync/library.ts).
 *
 * M17 (`Favourites-B`): the page's name is the 32 pt serif title again (M16a had the two tabs
 * in the bar); under it the pill search box, then Episodes / Comments as a pill track with
 * each tab's count, the chosen one yellow. Episodes are a two-column grid of white cards —
 * artwork with the accent star in its corner, the title, the show. Comments are white cards —
 * author and moment, the words, the episode. Same rows, same links, same spoken names.
 */
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, spacing } from '@/design';
import { listFavComments, type FavComment } from '@/me/fav-comments';
import { listFavourites, type Favourite } from '@/me/favourites';
import { matchesAll } from '@/me/history';
import { FilterBar } from '@/ui/me/FilterBar';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { mmss } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min };
/** The grid's two columns sit `spacing.row` apart. */
const COLUMNS = { gap: spacing.row };
/** A grid card's inner padding (p-2) and border, either side. */
const CARD_INSET = 2 * 8 + 2;

export default function FavouritesScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'episodes' | 'comments'>('episodes');
  const [rows, setRows] = useState<Favourite[]>(() => listFavourites(stores.settings));
  const [comments, setComments] = useState<FavComment[]>(() => listFavComments(stores.settings));
  const [term, setTerm] = useState('');
  useFocusEffect(useCallback(() => { setRows(listFavourites(stores.settings)); setComments(listFavComments(stores.settings)); }, [stores]));
  const known = rows.map((f) => ({ f, e: stores.feeds.getEpisode(f.episodeId) }))
    .filter((r) => r.e !== undefined && matchesAll(term, [r.e.title, stores.feeds.getShow(r.e.feedUrl)?.title]));
  const starred = comments.filter((c) => matchesAll(term, [c.body, c.author, stores.feeds.getEpisode(c.episodeId)?.title]));
  const any = tab === 'episodes' ? rows.length > 0 : comments.length > 0;
  const art = Math.max(0, Math.floor((width - 2 * spacing.screenX - spacing.row) / 2 - CARD_INSET));

  // M12 FR-097 kept the two tabs; M17 draws them as a pill track under the search box (inline,
  // not the shared Segmented, so the inventory keeps them on this page).
  const tabs = (
    <Box className="flex-row gap-1 p-1 bg-surface border border-border rounded-pill" accessibilityRole="tablist">
      {(['episodes', 'comments'] as const).map((t) => (
        <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'episodes' ? 'Episodes' : 'Comments'} className={`flex-1 rounded-pill items-center justify-center ${tab === t ? 'bg-primary' : ''}`} style={TAP}>
          <Text className={tab === t ? 'text-onPrimary text-meta font-bold' : 'text-muted text-meta font-medium'}>{t === 'episodes' ? `Episodes · ${rows.length}` : `Comments · ${comments.length}`}</Text>
        </Pressable>
      ))}
    </Box>
  );
  const header = (
    <Box className="pb-row">
      {any ? <FilterBar term={term} onTerm={setTerm} placeholder="Search your favourites" /> : null}
      {tabs}
    </Box>
  );

  if (tab === 'comments') {
    return (
      <>
      <PageHeader title="Favourites" />
      <FlatList
        key="comments"
        className="flex-1 bg-background"
        data={starred}
        ListFooterComponent={starred.length > 0 ? <EndOfList /> : undefined}
        keyExtractor={(c) => c.commentId}
        contentContainerClassName="px-screen-x pb-24 flex-grow"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyPicture icon="chatbubble-outline" line={term ? 'Nothing matches' : 'No favourite comments yet — tap ☆ on a comment'} />}
        renderItem={({ item }) => {
          const e = stores.feeds.getEpisode(item.episodeId);
          return (
            <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episodeId, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
              accessibilityRole="button" accessibilityLabel={`${item.author}: ${item.body}`} className="bg-surface border border-border rounded-row p-row mb-row gap-1" style={TAP}>
              <Text className="text-muted text-xs font-semibold">{item.author}{item.offsetMs !== null ? ` · at ${mmss(item.offsetMs)}` : ''}</Text>
              <Text className="text-text text-sm font-display-semibold" numberOfLines={4}>{item.body || 'This comment was deleted'}</Text>
              <Text className="text-muted text-xs" numberOfLines={1}>{e?.title ?? ''}</Text>
            </Pressable>
          );
        }}
      />
      </>
    );
  }

  return (
    <>
    <PageHeader title="Favourites" />
    <FlatList
      key="episodes"
      className="flex-1 bg-background"
      data={known}
      ListFooterComponent={known.length > 0 ? <EndOfList /> : undefined}
      numColumns={2}
      columnWrapperStyle={COLUMNS}
      keyExtractor={(r) => r.f.episodeId}
      contentContainerClassName="px-screen-x pb-24 flex-grow gap-row"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyPicture icon="star-outline" line={term ? 'Nothing matches' : 'No favourites yet — star an episode on its page'} />}
      renderItem={({ item, index }) => {
        const e = item.e!;
        const show = stores.feeds.getShow(e.feedUrl);
        // The last card of an odd count keeps its half width: a spacer takes the other half.
        const alone = index === known.length - 1 && known.length % 2 === 1;
        const card = (
          <Link href={{ pathname: '/episode/[id]', params: { id: e.id } }} asChild>
            <Pressable className="flex-1 bg-surface border border-border rounded-row p-2 pb-row gap-2" accessibilityRole="button" accessibilityLabel={e.title}>
              <Box>
                <Artwork url={e.imageUrl ?? show?.imageUrl} size={art} rounded="row" name={show?.title} />
                <Box className="absolute right-2 bottom-2"><Icon name="star" size={16} color={c.accent} /></Box>
              </Box>
              <Box className="px-1">
                <Text className="text-text text-meta font-bold" numberOfLines={2}>{e.title}</Text>
                <Text className="text-muted text-micro mt-0.5" numberOfLines={1}>{show?.title ?? ''}</Text>
              </Box>
            </Pressable>
          </Link>
        );
        return alone ? <Box className="flex-1 flex-row gap-row">{card}<Box className="flex-1" /></Box> : card;
      }}
    />
    </>
  );
}
