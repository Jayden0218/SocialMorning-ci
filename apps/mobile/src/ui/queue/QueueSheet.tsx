// The playlist as a sheet over any page: playing now first, then the queue as a deck, with an Edit mode.
/**
 * The queue as a sheet over the player (M12 FR-044): the listener stays on the player; the
 * queue was a separate page.
 *
 * M21 T045 (US3, FR-020/021): rebuilt on the shared `Sheet` (half height, drag to nearly full).
 *  - The episode playing now is first, marked "Now playing" (it is not in the queue, so it
 *    cannot be selected or removed here).
 *  - Every other card plays at once (M16a bug 6: the sheet closes; an episode not in the library
 *    opens its page instead — never nothing).
 *  - Edit: ticks, "Remove (n)" and "Clear all". Clear all asks once, with our own dialog, and
 *    keeps the playing episode (player-core `clearQueue`). Writes go through `stores.queue.replace`,
 *    as every other queue change.
 *
 * M31 T024 (design-pulse2 `player--queue-sheet`, `-edit`, `-clear-dialog`, `-empty`; "Layout: Deck"):
 * titled "Playlist" (Unbounded 20, with a close circle). Now playing is a raise strip — a 48 cover,
 * the title and a live mini curve; "Up next" with "n episodes · plays in order after this one"; the cards
 * (`QueueDeck`, src/ui/player/QueueDeck.tsx); then "Edit" (a quiet pill under the deck). In Edit mode:
 * "Clear all" (quiet, hot-text) → the kit `Dialog` "Clear the playlist?" with Cancel / Clear all (hot),
 * "Remove (n)" (hot, void words) when any is ticked, and "Done" (light). Empty: the flat line and
 * "Up next is empty — Nothing queued. Use Add to queue on an episode."; Edit is hidden. Drawn once, at
 * the root, by src/ui/queue/QueueSheetHost.tsx.
 * The player's state comes from selectors (C4): the sheet knows which episode plays, never the position
 * except in the strip's mini curve, which has its own part.
 */
import { useEffect, useState } from 'react';
import { router, usePathname } from 'expo-router';
import { clearQueue, remove, removeMany } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { selectEpisodeId, usePlayer, usePlayerSelector, sameClock, selectClock } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { EmptyState } from '@/ui/kit/EmptyState';
import { Artwork } from '@/ui/kit/Artwork';
import { Curve } from '@/ui/kit/Curve';
import { Dialog } from '@/ui/kit/Dialog';
import { Icon } from '@/ui/kit/Icon';
import { Sheet } from '@/ui/kit/Sheet';
import { Type } from '@/ui/kit/Type';
import { QueueDeck } from '@/ui/player/QueueDeck';

const NONE: ReadonlySet<string> = new Set();
/** The drawing's sheet is about two thirds of the screen; it drags to nearly full. */
const QUEUE_SNAPS: readonly number[] = [0.7, 0.92];
const STRIP = [0.5, 0.8, 0.4, 1, 0.6, 0.9, 0.5, 0.7];

export function QueueSheet(props: { open: boolean; onClose: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours();
  const player = usePlayer();
  const current = usePlayerSelector(selectEpisodeId);
  const [ids, setIds] = useState<readonly string[]>(() => stores.queue.list());
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(NONE);
  const [clearing, setClearing] = useState(false);
  useEffect(() => {
    if (props.open) { setIds(stores.queue.list()); return; }
    setEditing(false);
    setChosen(NONE);
    setClearing(false);
  }, [props.open, stores]);
  const write = (next: readonly string[]) => { stores.queue.replace(next, Date.now()); setIds(stores.queue.list()); };
  // M16a bug 6 (FR-002): a card tap plays that episode and closes the sheet; one that cannot be
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
  const clearAll = () => setClearing(true);

  const header = (
    <Box className="flex-row items-center justify-between px-screen-x" style={{ paddingBottom: 12 }}>
      <Type step="heading" className="text-text flex-1" accessibilityRole="header">Playlist</Type>
      <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={4} className="items-center justify-center rounded-pill bg-raise" style={{ width: 36, height: 36 }}>
        <Icon name="close" size={18} color={c.text} />
      </Pressable>
    </Box>
  );

  const footer = (
    <Box className="px-screen-x gap-row" style={{ paddingTop: 12, paddingBottom: 12 }}>
      {editing ? (
        <Box className="flex-row gap-row">
          <Pressable onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all" className="flex-1 items-center justify-center rounded-pill bg-raise" style={{ height: hit.min }}>
            <Type step="row" className="text-hotText">Clear all</Type>
          </Pressable>
          {/* design-pulse2 player--queue-sheet-edit: "Remove (n)" appears when any card is ticked. */}
          {chosen.size > 0 ? (
            <Pressable onPress={chosen.size > 0 ? removeChosen : undefined} accessibilityRole="button" accessibilityLabel={`Remove (${chosen.size})`} className="flex-1 items-center justify-center rounded-pill bg-hot" style={{ height: hit.min }}>
              <Type step="row" className="text-void">{`Remove (${chosen.size})`}</Type>
            </Pressable>
          ) : null}
        </Box>
      ) : null}
      {rows.length > 0 ? (
        <Pressable
          onPress={() => { setEditing((e) => !e); setChosen(NONE); }}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Done' : 'Edit'}
          className={`items-center justify-center rounded-pill ${editing ? 'bg-text' : 'bg-raise'}`}
          style={{ height: hit.min }}
        >
          <Type step="row" className={editing ? 'text-void' : 'text-text'}>{editing ? 'Done' : 'Edit'}</Type>
        </Pressable>
      ) : null}
    </Box>
  );

  return (
    <>
      {/* Our own overlay (never a native modal), so the iOS share sheet can still open over the page. */}
      <Sheet open={props.open} onClose={props.onClose} label="Playlist" header={header} footer={footer} snapPoints={QUEUE_SNAPS}>
        <ScrollView className="w-full" contentContainerClassName="px-screen-x gap-row pb-section" showsVerticalScrollIndicator={false}>
          {current !== undefined ? <NowPlaying id={current} onOpen={props.onClose} /> : null}
          <Box className="flex-row items-baseline justify-between gap-row">
            <Type step="section" className="text-text" accessibilityRole="header">Up next</Type>
            {rows.length > 0 ? <Type step="mono" className="text-text3 flex-shrink" numberOfLines={1}>{`${plural(rows.length, 'episode')} · plays in order after this one`}</Type> : null}
          </Box>
          {rows.length === 0 ? <EmptyState surface="queue" /> : (
            <Box style={{ marginHorizontal: -20 }}>
              <Box style={{ paddingLeft: 20 }}>
                <QueueDeck ids={rows} stores={stores} onChange={write} onPlay={play} {...(editing ? { select: { chosen, onToggle: toggle } } : {})} />
              </Box>
            </Box>
          )}
        </ScrollView>
      </Sheet>
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

/** The mini curve in the strip: it follows the clock, so it is a part of its own. */
function StripCurve(): React.ReactElement {
  const clock = usePlayerSelector(selectClock, sameClock);
  const played = clock.durationMs ? Math.min(1, clock.positionMs / clock.durationMs) : 0;
  return <Curve data={STRIP} count={STRIP.length} height={20} min={3} gap={2} played={played} />;
}

/**
 * The first row: the episode playing now, marked — not a queue item. A tap opens the player (the action
 * map's "Now playing (open player)"); over the player itself it only closes the sheet.
 */
function NowPlaying(props: { id: string; onOpen: () => void }): React.ReactElement {
  const stores = useStores();
  const path = usePathname();
  const episode = stores.feeds.getEpisode(props.id);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const title = episode?.title ?? 'Now playing';
  return (
    <Pressable onPress={() => { props.onOpen(); if (path !== '/player') router.push('/player'); }} accessibilityRole="button" accessibilityLabel={`Now playing: ${title}`} className="flex-row items-center gap-row bg-raise rounded-artwork-lg" style={{ padding: 10 }}>
      <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={48} name={show?.title ?? title} />
      <Box className="flex-1">
        <Type step="edge" className="text-hotText">NOW PLAYING</Type>
        <Type step="compact" className="text-text" style={{ marginTop: 4 }} numberOfLines={2}>{title}</Type>
      </Box>
      <Box style={{ width: 70 }}><StripCurve /></Box>
    </Pressable>
  );
}
