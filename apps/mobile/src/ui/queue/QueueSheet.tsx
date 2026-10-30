// The playlist as a sheet over any page: playing now first, then the queue, with an Edit mode.
/**
 * The queue as a sheet over the player (M12 FR-044): the listener stays on the player; the
 * queue was a separate page.
 *
 * M17 T098 (`QueueSheet-B`): the head is B's — a 32 pt serif title over the list's own
 * "N episodes · plays in order after this one" line; the rows are `QueueList`'s sheet layout.
 *
 * M21 T045 (US3, FR-020/021): rebuilt on the shared `Sheet` (half height, drag to nearly full).
 *  - The episode playing now is first, marked "Now playing" (it is not in the queue, so it
 *    cannot be selected or removed here).
 *  - Every other row has ▶ and plays at once (M16a bug 6: the sheet closes; an episode not in
 *    the library opens its page instead — never nothing).
 *  - Edit: checkboxes, "Remove (n)" and "Clear all". Clear all asks once, with our own confirm,
 *    and keeps the playing episode (player-core `clearQueue`). Writes go through
 *    `stores.queue.replace`, as every other queue change.
 * Drawn once, at the root, by src/ui/queue/QueueSheetHost.tsx.
 *
 * M24 US19 (`QueueSheet-B`): titled "Up next" with the count on the right, opening tall, the white
 * cards on the paper colour. "Playlist" stays the name of the buttons that open it.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { clearQueue, remove, removeMany } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { usePlayer, usePlayerState } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Artwork } from '@/ui/kit/Artwork';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Sheet } from '@/ui/kit/Sheet';
import { useConfirm } from '@/ui/kit/confirm';
import { hit } from '@/design';
import { QueueList } from './QueueList';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const PILL = { minHeight: hit.min };
const NONE: ReadonlySet<string> = new Set();
/** B's sheet is ~91 % tall; it opens at 80 % and drags to 92 %. */
const QUEUE_SNAPS: readonly number[] = [0.8, 0.92];

export function QueueSheet(props: { open: boolean; onClose: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const state = usePlayerState();
  const current = 'episodeId' in state ? state.episodeId : undefined;
  const [ids, setIds] = useState<readonly string[]>(() => stores.queue.list());
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [confirm, dialog] = useConfirm();
  useEffect(() => {
    if (props.open) { setIds(stores.queue.list()); return; }
    setEditing(false);
    setChosen(NONE);
  }, [props.open, stores]);
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
  // The playing episode is drawn on its own, first; never twice.
  const rows = current === undefined ? ids : ids.filter((id) => id !== current);
  const toggle = (id: string) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const removeChosen = () => {
    write(removeMany(ids, [...chosen]));
    setChosen(NONE);
  };
  const clearAll = () => confirm({
    title: 'Clear the playlist?',
    message: 'Every episode leaves the playlist. The one playing now keeps playing.',
    action: 'Clear all',
    onConfirm: () => { write(clearQueue(ids, current)); setChosen(NONE); setEditing(false); },
  });

  // M24 US19 (`QueueSheet-B`): "Up next" in the serif, the count on the right (with Edit beside it).
  const header = (
    <Box className="flex-row items-center justify-between px-screen-x pb-1 bg-background">
      <Text className="text-text text-[30px] leading-[39px] font-display" accessibilityRole="header">Up next</Text>
      <Box className="flex-row items-center gap-1">
      {rows.length > 0 ? <Text className="text-muted text-meta font-bold">{plural(rows.length, 'episode')}</Text> : null}
      {rows.length > 0 ? (
        <Pressable
          onPress={() => { setEditing((e) => !e); setChosen(NONE); }}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Done' : 'Edit'}
          className="items-center justify-center px-2"
          style={TAP}
        >
          <Text className="text-accent text-body font-bold">{editing ? 'Done' : 'Edit'}</Text>
        </Pressable>
      ) : null}
      </Box>
    </Box>
  );

  const footer = editing ? (
    <Box className="flex-row gap-gap px-screen-x py-row border-t-hairline border-separator">
      <Pressable onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all" className="flex-1 items-center justify-center rounded-pill bg-surface border border-border" style={PILL}>
        <Text className="text-accent text-body font-bold">Clear all</Text>
      </Pressable>
      <Pressable
        onPress={chosen.size > 0 ? removeChosen : undefined}
        disabled={chosen.size === 0}
        accessibilityRole="button"
        accessibilityLabel={`Remove (${chosen.size})`}
        accessibilityState={{ disabled: chosen.size === 0 }}
        className={`flex-1 items-center justify-center rounded-pill bg-primary ${chosen.size === 0 ? 'opacity-40' : ''}`}
        style={PILL}
      >
        <Text className="text-onPrimary text-body font-bold">{`Remove (${chosen.size})`}</Text>
      </Pressable>
    </Box>
  ) : undefined;

  return (
    <>
      {/* M24 US19 (`QueueSheet-B`): opens tall (80 %, ~4 cards; drag to 92 %), and the list sits on the
          paper colour so the white cards stand out (on the white sheet only their borders showed). */}
      <Sheet open={props.open} onClose={props.onClose} label="Up next" header={header} footer={footer} snapPoints={QUEUE_SNAPS}>
        <ScrollView className="w-full bg-background" contentContainerClassName="px-screen-x pt-1 pb-section">
          {current !== undefined ? <NowPlaying id={current} /> : null}
          {rows.length === 0 ? <EmptyState surface="queue" page /> : (
            <QueueList
              ids={rows}
              stores={stores}
              colours={{ text: c.text, muted: c.muted, accent: c.accent }}
              onChange={write}
              onPlay={play}
              {...(editing ? { select: { chosen, onToggle: toggle } } : {})}
            />
          )}
        </ScrollView>
      </Sheet>
      {dialog}
    </>
  );
}

/** The first row: the episode playing now, marked — not a queue item. */
function NowPlaying(props: { id: string }): React.ReactElement {
  const stores = useStores();
  const episode = stores.feeds.getEpisode(props.id);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const title = episode?.title ?? 'Now playing';
  return (
    <Box className="flex-row items-center gap-row p-3 mb-2.5 rounded-row bg-accentTint" accessible accessibilityLabel={`Now playing: ${title}`}>
      <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={64} name={show?.title ?? title} />
      <Box className="flex-1 gap-0.5">
        <Eyebrow accent>Now playing</Eyebrow>
        <Text className="text-text text-sm font-display-semibold" numberOfLines={2}>{title}</Text>
        {show?.title ? <Text className="text-muted text-xs" numberOfLines={1}>{show.title}</Text> : null}
      </Box>
    </Box>
  );
}
