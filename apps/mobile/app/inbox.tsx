/**
 * Inbox (US4, FR-018..020): what is new since each subscription, minus what was played,
 * queued, downloaded or dismissed. Paged 50. Every action records why the item left.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { enqueue } from '@socialmorning/player-core';
import { usePlayer } from '../src/playback/store';
import { toPlayable } from '../src/storage/playable';
import { inboxIds, INBOX_PAGE } from '../src/inbox';
import { mmss, shortDate } from '../src/ui/format';
import { useDownloads, useStores, useToast } from '../src/ui/providers';
import { EmptyState } from '../src/ui/EmptyState';

export default function InboxScreen(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const player = usePlayer();
  const router = useRouter();
  const toast = useToast();
  const [ids, setIds] = useState<string[]>([]);
  const [shown, setShown] = useState(INBOX_PAGE);
  const reload = useCallback(() => setIds(inboxIds(stores)), [stores]);
  useFocusEffect(reload);

  const leave = (id: string, why: 'played' | 'queued' | 'downloaded' | 'dismissed') => {
    stores.inboxState.mark(id, why, Date.now());
    reload();
  };

  return (
    <FlatList
      data={ids.slice(0, shown)}
      keyExtractor={(id) => id}
      contentContainerClassName="p-3 gap-1"
      ListHeaderComponent={<Text className="text-muted text-[13px]">{ids.length} new since you subscribed</Text>}
      ListEmptyComponent={<EmptyState surface="inbox" />}
      ListFooterComponent={ids.length > shown ? (
        <Pressable onPress={() => setShown((n) => n + INBOX_PAGE)} accessibilityRole="button"><Text className="text-accent text-[15px]">Load more</Text></Pressable>
      ) : undefined}
      renderItem={({ item }) => {
        const episode = stores.feeds.getEpisode(item);
        const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
        return (
          <View className="py-2 gap-1 border-b-hairline border-separator">
            <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item } })} accessibilityRole="button">
              <Text className="text-xs text-muted uppercase">{show?.title ?? ''}</Text>
              <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>{episode?.title ?? item}</Text>
              <Text className="text-muted text-[13px]">{[shortDate(episode?.publishedAt), episode?.durationMs !== undefined ? mmss(episode.durationMs) : ''].filter(Boolean).join(' · ')}</Text>
            </Pressable>
            <View className="flex-row gap-[18px]">
              <Pressable onPress={() => { const p = toPlayable(stores, item); if (!p) return; leave(item, 'played'); player.load(p, 'play'); router.push('/player'); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Play</Text></Pressable>
              <Pressable onPress={() => { const r = enqueue(stores.queue.list(), item, 'end'); if (r.refused) { toast('The queue is full (300).'); return; } stores.queue.replace(r.queue, Date.now()); leave(item, 'queued'); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Queue</Text></Pressable>
              <Pressable onPress={() => { void downloads.request(item).then((r) => { if (r.kind === 'budget') toast('Not enough space for this download.'); else leave(item, 'downloaded'); }); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Download</Text></Pressable>
              <Pressable onPress={() => leave(item, 'dismissed')} accessibilityRole="button"><Text className="text-accent text-[15px]">Dismiss</Text></Pressable>
            </View>
          </View>
        );
      }}
    />
  );
}
