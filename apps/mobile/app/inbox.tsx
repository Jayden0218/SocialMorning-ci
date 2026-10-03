/**
 * Inbox (US4, FR-018..020): what is new since each subscription, minus what was played,
 * queued, downloaded or dismissed. Paged 50. Every action records why the item left.
 *
 * M17 T065 (`Inbox-B`): the Editorial page — the serif title, then the count as a large serif
 * number beside "new since you subscribed"; the episodes grouped under small-capitals labels
 * (Today, Yesterday, This week, Earlier — the list is already newest first), each one a white
 * card: 60 pt artwork, the show in capitals, the episode title in the serif, date · length; then
 * a yellow Play pill and Queue / Download / Dismiss as accent words with icons. Same actions,
 * names and handlers as before; loading, error, empty and Load more unchanged.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { enqueue } from '@socialmorning/player-core';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { inboxBody, loadInbox, INBOX_PAGE, type InboxLoad } from '@/me/inbox';
import { mmss, shortDate } from '@/ui/kit/format';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Loader } from '@/ui/kit/Loader';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Icon, PlayIcon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };
/** The count beside "new since you subscribed": 52 pt serif (`Inbox-B`). */
const COUNT = { lineHeight: 60 };

/** The group an episode falls in, by its publish day on this phone's calendar. */
function groupOf(publishedAt: number | undefined, now: Date): string {
  if (publishedAt === undefined) return 'Earlier';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const day = 24 * 60 * 60 * 1000;
  if (publishedAt >= today) return 'Today';
  if (publishedAt >= today - day) return 'Yesterday';
  if (publishedAt >= today - 6 * day) return 'This week';
  return 'Earlier';
}

export default function InboxScreen(): React.ReactElement {
  const stores = useStores();
  const downloads = useDownloads();
  const player = usePlayer();
  const router = useRouter();
  const toast = useToast();
  const c = useColours(stores.settings);
  // M16a bug 4: `loading` until the first read finishes — never "Nothing new" before it (src/me/inbox).
  const [load, setLoad] = useState<InboxLoad>({ kind: 'loading' });
  const [shown, setShown] = useState(INBOX_PAGE);
  const reload = useCallback(() => setLoad(loadInbox(stores)), [stores]);
  useFocusEffect(reload);
  const ids = load.kind === 'ok' ? load.ids : [];
  const body = inboxBody(load);
  const visible = useMemo(() => ids.slice(0, shown), [ids, shown]);
  // One label per row; a row starts a group when its label differs from the row above.
  const groups = useMemo(() => {
    const now = new Date();
    return visible.map((id) => groupOf(stores.feeds.getEpisode(id)?.publishedAt, now));
  }, [visible, stores]);

  const leave = (id: string, why: 'played' | 'queued' | 'downloaded' | 'dismissed') => {
    stores.inboxState.mark(id, why, Date.now());
    reload();
  };

  return (
    <>
    <PageHeader title="Inbox" />
    <FlatList
      className="flex-1 bg-background"
      data={visible}
      keyExtractor={(id) => id}
      contentContainerClassName="px-screen-x pb-section gap-row"
      ListHeaderComponent={load.kind === 'ok' ? (
        <Box className="flex-row items-baseline gap-gap">
          <Text className="text-text text-[52px] font-display" style={COUNT}>{ids.length}</Text>
          <Text className="text-muted text-body">new since you subscribed</Text>
        </Box>
      ) : undefined}
      ListEmptyComponent={body === 'loading' ? <Loader className="my-section" /> : body === 'error' ? <EmptyState surface="inbox" failed onRetry={reload} page /> : <EmptyState surface="inbox" page />}
      ListFooterComponent={ids.length > shown ? (
        <Pressable onPress={() => setShown((n) => n + INBOX_PAGE)} accessibilityRole="button" className="self-center justify-center px-section rounded-pill border border-border bg-surface" style={TAP}><Text className="text-text text-body font-bold">Load more</Text></Pressable>
      ) : undefined}
      renderItem={({ item, index }) => {
        const episode = stores.feeds.getEpisode(item);
        const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
        const group = groups[index];
        const starts = group !== undefined && group !== groups[index - 1];
        return (
          <Box className="gap-row">
            {starts ? <Eyebrow className="mt-gap">{group}</Eyebrow> : null}
            <Card className="py-row gap-row">
              <Pressable onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item } })} accessibilityRole="button" className="flex-row gap-row" style={TAP}>
                <Artwork url={episode?.imageUrl ?? show?.imageUrl ?? null} size={60} rounded="row" name={show?.title ?? ''} />
                <Box className="flex-1 gap-1">
                  <Text className="text-micro text-muted uppercase" numberOfLines={1}>{show?.title ?? ''}</Text>
                  <Text className="text-title font-display text-text" numberOfLines={2}>{episode?.title ?? item}</Text>
                  <Text className="text-muted text-xs">{[shortDate(episode?.publishedAt), episode?.durationMs !== undefined ? mmss(episode.durationMs) : ''].filter(Boolean).join(' · ')}</Text>
                </Box>
              </Pressable>
              <Box className="flex-row items-center">
                <Pressable onPress={() => { const p = toPlayable(stores, item); if (!p) return; leave(item, 'played'); player.load(p, 'play'); router.push('/player'); }} accessibilityRole="button" className="flex-row items-center gap-2 px-section rounded-pill bg-primary" style={TAP}>
                  <PlayIcon size={12} tint="onPrimary" />
                  <Text className="text-onPrimary text-body font-bold">Play</Text>
                </Pressable>
                <Box className="flex-1" />
                <Pressable onPress={() => { const r = enqueue(stores.queue.list(), item, 'end'); if (r.refused) { toast('The queue is full (300).'); return; } stores.queue.replace(r.queue, Date.now()); leave(item, 'queued'); }} accessibilityRole="button" className="flex-row items-center gap-1 px-1.5" style={TAP}>
                  <Icon name="list-outline" size={16} color={c.accent} />
                  <Text className="text-accent text-meta font-semibold">Queue</Text>
                </Pressable>
                <Pressable onPress={() => { void downloads.request(item).then((r) => { if (r.kind === 'budget') toast('Not enough space for this download.'); else leave(item, 'downloaded'); }); }} accessibilityRole="button" className="flex-row items-center gap-1 px-1.5" style={TAP}>
                  <Icon name="download-outline" size={16} color={c.accent} />
                  <Text className="text-accent text-meta font-semibold">Download</Text>
                </Pressable>
                <Pressable onPress={() => leave(item, 'dismissed')} accessibilityRole="button" className="flex-row items-center gap-1 px-1.5" style={TAP}>
                  <Icon name="close" size={16} color={c.accent} />
                  <Text className="text-accent text-meta font-semibold">Dismiss</Text>
                </Pressable>
              </Box>
            </Card>
          </Box>
        );
      }}
    />
    </>
  );
}
