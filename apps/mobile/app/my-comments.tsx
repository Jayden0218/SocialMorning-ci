/**
 * My comments (我的评论, M10): your recent comments, from your own profile's public
 * activity. Tapping one opens the episode at that moment's page.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Loader } from '../src/ui/Loader';
import type { FeedItem } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { mmss, shortDate } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';

export default function MyCommentsScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const [rows, setRows] = useState<FeedItem[] | undefined>();
  useEffect(() => {
    if (!listener) { setRows([]); return; }
    let live = true;
    void api.profile(listener.listenerId).then((p) => { if (live) setRows(p.recent.filter((r) => r.kind === 'commented')); }, () => { if (live) setRows([]); });
    return () => { live = false; };
  }, [api, listener]);
  if (rows === undefined) return <View className="flex-1 bg-background p-section items-center"><Loader /></View>;
  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => String(r.id)}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={<EmptyPicture icon="chatbubbles-outline" line={listener ? 'No comments yet' : 'Sign in to comment'} />}
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episode.id } })} accessibilityRole="button" accessibilityLabel={`Comment on ${item.episode.title}`} className="py-row border-b-hairline border-separator">
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>{item.episode.title}</Text>
          <Text className="text-muted text-xs">{[item.episode.showTitle, item.momentMs !== null ? `at ${mmss(item.momentMs)}` : undefined, shortDate(Date.parse(item.createdAt))].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      )}
    />
  );
}
