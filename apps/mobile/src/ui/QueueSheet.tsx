/**
 * The queue as a sheet over the player (M12 FR-044): the listener stays on the player; the
 * queue was a separate page.
 */
import { useEffect, useState } from 'react';
import { remove } from '@socialmorning/player-core';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from './lib/actionsheet';
import { ScrollView } from './lib/scroll-view';
import { Text } from './lib/text';
import { usePlayer } from '../playback/store';
import { toPlayable } from '../storage/playable';
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
  const play = (id: string) => {
    const playable = toPlayable(stores, id);
    if (!playable) return;
    write(remove(ids, id));
    player.load(playable, 'play');
    props.onClose();
  };
  return (
    <Actionsheet isOpen={props.open} onClose={props.onClose}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pb-10 items-stretch" style={TALL}>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Text className="text-text text-base font-bold py-row" accessibilityRole="header">Up next</Text>
        <ScrollView className="w-full">
          {ids.length === 0 ? <EmptyState surface="queue" page /> : <QueueList ids={ids} stores={stores} colours={{ text: c.text, muted: c.muted, accent: c.accent }} onChange={write} onPlay={play} />}
        </ScrollView>
      </ActionsheetContent>
    </Actionsheet>
  );
}
