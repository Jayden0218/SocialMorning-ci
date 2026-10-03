/**
 * The queue as a sheet over the player (M12 FR-044): the listener stays on the player; the
 * queue was a separate page.
 *
 * M17 T098 (`QueueSheet-B`): the head is B's — "Up next" as a 32 pt serif title over the list's
 * own "N episodes · plays in order after this one" line. The rows (play, ⋮ actions, drag to
 * reorder) are `QueueList`'s sheet layout, unchanged here: B's numbered cards with the actions as
 * pills belong in src/ui/QueueList.tsx, which this task does not own.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { remove } from '@socialmorning/player-core';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { useStores } from './providers';
import { useColours } from './useColours';
import { EmptyState } from './EmptyState';
import { QueueList } from './QueueList';

/** At most 90 % of the screen, so the player stays visible above it. */
const TALL = { maxHeight: '90%' } as const;

export function QueueSheet(props: { open: boolean; onClose: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const [ids, setIds] = useState<readonly string[]>(() => stores.queue.list());
  useEffect(() => { if (props.open) setIds(stores.queue.list()); }, [props.open, stores]);
  const write = (next: readonly string[]) => { stores.queue.replace(next, Date.now()); setIds(stores.queue.list()); };
  // M16a bug 6 (FR-002): a row tap plays that episode and closes the sheet; one that cannot be
  // played from here (not in the library) closes and opens its page instead — never nothing.
  const play = (id: string) => {
    const playable = toPlayable(stores, id);
    props.onClose();
    if (!playable) { router.push({ pathname: '/episode/[id]', params: { id } }); return; }
    write(remove(ids, id));
    player.load(playable, 'play');
  };
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-surface rounded-t-row px-screen-x items-stretch" style={TALL}>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-text text-display font-display pt-2" accessibilityRole="header">Up next</Text>
        <ScrollView className="w-full">
          {ids.length === 0 ? <EmptyState surface="queue" page /> : <QueueList ids={ids} stores={stores} colours={{ text: c.text, muted: c.muted, accent: c.accent }} onChange={write} onPlay={play} />}
        </ScrollView>
      </ActionsheetContent>
    </Actionsheet>
  );
}
