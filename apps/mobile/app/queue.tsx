// Your queue: a Deck of full-size episode cards, a strip of the rest, Edit to select and remove.
/**
 * The queue page (US2), reached from the mini player's Queue button. M12 FR-044: the same actions as
 * the sheet over the player — play, move, remove, drag to reorder.
 *
 * M31 W3-B (T041; design-pulse2 `queue--screen`, `queue--empty`, `queue--item-sheet`, "Layout: Deck"): a pushed page
 * with the title bar low — "Queue", "4 episodes · 2 h 41 min" and an Edit circle. The cards are in
 * src/ui/queue/QueueList.tsx (Play now on the first, Play and ··· on the others, long-press and slide to reorder).
 * Edit (the circle) turns the cards into checkboxes, as the sheet's Edit does: above the title "Clear all" (asks once,
 * "Clear the playlist?"), "Remove (n)" and "Done". Empty: the shared empty block with its Discover button, Edit hidden.
 * Load, play, reorder and remove are unchanged: every write goes through `stores.queue.replace`.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { clearQueue, remove, removeMany } from '@socialmorning/player-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { usePlayer, usePlayerSelector, selectEpisodeId } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { useStores } from '@/ui/shell/providers';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Dialog } from '@/ui/kit/Dialog';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { QueueList, queueSubtitle } from '@/ui/queue/QueueList';
import { QUEUE_PAGE } from '@/ui/queue/measures';

const NONE: ReadonlySet<string> = new Set();

export default function QueueScreen(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();
  const current = usePlayerSelector(selectEpisodeId);
  const [ids, setIds] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [clearing, setClearing] = useState(false);
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
  const open = (id: string) => router.push({ pathname: '/episode/[id]', params: { id } });
  const leaveEdit = () => { setEditing(false); setChosen(NONE); };
  const toggle = (id: string) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const removeChosen = () => { write(removeMany(ids, [...chosen])); setChosen(NONE); };
  const empty = ids.length === 0;
  const pills = editing && !empty ? (
    <Box className="flex-row gap-row">
      <Box className="flex-1"><PulseButton label="Clear all" kind="quiet" onPress={() => setClearing(true)} full /></Box>
      {chosen.size > 0 ? <Box className="flex-1"><PulseButton label={`Remove (${chosen.size})`} kind="hot" onPress={removeChosen} full /></Box> : null}
      <Box className="flex-1"><PulseButton label="Done" kind="light" onPress={leaveEdit} full /></Box>
    </Box>
  ) : undefined;
  return (
    <>
      <PushedPage
        title="Queue"
        subtitle={queueSubtitle(ids, stores)}
        {...(empty || editing ? {} : { actions: [{ icon: 'create-outline' as const, label: 'Edit', onPress: () => { setEditing(true); setChosen(NONE); } }] })}
        {...(pills ? { extra: pills, extraAbove: 60 } : {})}
      >
        {(layout) => (
          <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, paddingBottom: layout.reserve }} showsVerticalScrollIndicator={false}>
            {empty ? (
              <Box style={{ paddingTop: layout.top + QUEUE_PAGE.emptyTop }}><EmptyState surface="queue" page /></Box>
            ) : (
              <QueueList ids={ids} stores={stores} top={layout.top + QUEUE_PAGE.deckTop} onChange={write} onPlay={play} onOpen={open} {...(editing ? { select: { chosen, onToggle: toggle } } : {})} />
            )}
          </ScrollView>
        )}
      </PushedPage>
      <Dialog
        open={clearing}
        title="Clear the playlist?"
        body="Every episode leaves the playlist. The one playing now keeps playing."
        onClose={() => setClearing(false)}
        buttons={[
          { label: 'Cancel', kind: 'quiet', onPress: () => setClearing(false) },
          { label: 'Clear all', kind: 'hot', onPress: () => { write(clearQueue(ids, current)); setChosen(NONE); setEditing(false); setClearing(false); } },
        ]}
      />
    </>
  );
}
