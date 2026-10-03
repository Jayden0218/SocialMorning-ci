/**
 * The queue page (US2), reached from the mini player's Queue button. M12 FR-044: the same rows
 * as the sheet over the player (src/ui/QueueList.tsx) — artwork, time left, drag handle, ⋮.
 *
 * M17 T052 (`Queue-B`): the list draws its page layout — the next episode as an "Up next" card
 * with a Play now pill, the rest numbered, the ⋮ actions in a sheet. Load, play, reorder and
 * remove are unchanged.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { remove } from '@socialmorning/player-core';
import { useStores } from '@/ui/providers';
import { useColours } from '@/ui/useColours';
import { EmptyState } from '@/ui/EmptyState';
import { QueueList } from '@/ui/QueueList';
import { PageHeader } from '@/ui/PageHeader';

export default function QueueScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const router = useRouter();
  const [ids, setIds] = useState<readonly string[]>([]);
  const reload = useCallback(() => setIds(stores.queue.list()), [stores]);
  useFocusEffect(reload);
  const write = (next: readonly string[]) => { stores.queue.replace(next, Date.now()); reload(); };
  const play = (id: string) => {
    const playable = toPlayable(stores, id);
    if (!playable) return;
    write(remove(ids, id));
    player.load(playable, 'play');
    router.push('/player');
  };
  return (
    <>
    <PageHeader title="Queue" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section flex-grow">
      {ids.length === 0 ? <EmptyState surface="queue" page /> : <QueueList ids={ids} stores={stores} colours={{ text: c.text, muted: c.muted, accent: c.accent }} onChange={write} onPlay={play} layout="page" />}
    </ScrollView>
    </>
  );
}
