/**
 * Inbox (US4, FR-018..020): what is new since each subscription, minus what was played,
 * queued, downloaded or dismissed. Paged 50. Every action records why the item left.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { enqueue } from '@socialmorning/player-core';
import { usePlayer } from '../src/playback/store';
import { toPlayable } from '../src/storage/playable';
import { inboxBody, loadInbox, INBOX_PAGE, type InboxLoad } from '../src/inbox';
import { mmss, shortDate } from '../src/ui/format';
import { useDownloads, useStores, useToast } from '../src/ui/providers';
import { EmptyState } from '../src/ui/EmptyState';
import { Loader } from '../src/ui/Loader';
import { PageHeader } from '../src/ui/PageHeader';

export default function InboxScreen(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const player = usePlayer();
  const router = useRouter();
  const toast = useToast();
  // M16a bug 4: `loading` until the first read finishes — never "Nothing new" before it (src/inbox).
  const [load, setLoad] = useState<InboxLoad>({ kind: 'loading' });
  const [shown, setShown] = useState(INBOX_PAGE);
  const reload = useCallback(() => setLoad(loadInbox(stores)), [stores]);
  useFocusEffect(reload);
  const ids = load.kind === 'ok' ? load.ids : [];
  const body = inboxBody(load);

  const leave = (id: string, why: 'played' | 'queued' | 'downloaded' | 'dismissed') => {
    stores.inboxState.mark(id, why, Date.now());
    reload();
  };

  return (
    <>
    <PageHeader title="Inbox" />
    <FlatList
      data={ids.slice(0, shown)}
      keyExtractor={(id) => id}
      contentContainerClassName="px-screen-x py-row gap-1"
      ListHeaderComponent={load.kind === 'ok' ? <Text className="text-muted text-[13px]">{ids.length} new since you subscribed</Text> : null}
      ListEmptyComponent={body === 'loading' ? <Loader className="my-section" /> : body === 'error' ? <EmptyState surface="inbox" failed onRetry={reload} page /> : <EmptyState surface="inbox" page />}
      ListFooterComponent={ids.length > shown ? (
        <Pressable onPress={() => setShown((n) => n + INBOX_PAGE)} accessibilityRole="button"><Text className="text-accent text-[15px]">Load more</Text></Pressable>
      ) : undefined}
      renderItem={({ item }) => {
        const episode = stores.feeds.getEpisode(item);
        const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
        return (
          <Box className="py-2 gap-1 border-b-hairline border-separator">
            <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item } })} accessibilityRole="button">
              <Text className="text-xs text-muted uppercase">{show?.title ?? ''}</Text>
              <Text className="text-[15px] font-semibold text-text" numberOfLines={2}>{episode?.title ?? item}</Text>
              <Text className="text-muted text-[13px]">{[shortDate(episode?.publishedAt), episode?.durationMs !== undefined ? mmss(episode.durationMs) : ''].filter(Boolean).join(' · ')}</Text>
            </Pressable>
            <Box className="flex-row gap-[18px]">
              <Pressable onPress={() => { const p = toPlayable(stores, item); if (!p) return; leave(item, 'played'); player.load(p, 'play'); router.push('/player'); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Play</Text></Pressable>
              <Pressable onPress={() => { const r = enqueue(stores.queue.list(), item, 'end'); if (r.refused) { toast('The queue is full (300).'); return; } stores.queue.replace(r.queue, Date.now()); leave(item, 'queued'); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Queue</Text></Pressable>
              <Pressable onPress={() => { void downloads.request(item).then((r) => { if (r.kind === 'budget') toast('Not enough space for this download.'); else leave(item, 'downloaded'); }); }} accessibilityRole="button"><Text className="text-accent text-[15px]">Download</Text></Pressable>
              <Pressable onPress={() => leave(item, 'dismissed')} accessibilityRole="button"><Text className="text-accent text-[15px]">Dismiss</Text></Pressable>
            </Box>
          </Box>
        );
      }}
    />
    </>
  );
}
