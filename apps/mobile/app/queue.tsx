/**
 * The queue page (US2), reached from the mini player's Queue button. M12 FR-044: the same rows
 * as the sheet over the player (src/ui/QueueList.tsx) — artwork, time left, drag handle, ⋮.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView } from '../src/ui/lib/scroll-view';
import { usePlayer } from '../src/playback/store';
import { toPlayable } from '../src/storage/playable';
import { remove } from '@socialmorning/player-core';
import { useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { EmptyState } from '../src/ui/EmptyState';
import { QueueList } from '../src/ui/QueueList';
import { PageHeader } from '../src/ui/PageHeader';

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
      {ids.length === 0 ? <EmptyState surface="queue" page /> : <QueueList ids={ids} stores={stores} colours={{ text: c.text, muted: c.muted, accent: c.accent }} onChange={write} onPlay={play} />}
    </ScrollView>
    </>
  );
}
