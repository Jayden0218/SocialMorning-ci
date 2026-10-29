// The queue as a deck of cards: 180 × 230, numbered, one tap plays; ··· opens the menu; long-press and slide to reorder.
/**
 * M31 T024 (design-pulse2 `player--queue-sheet`, `player--queue-sheet-edit`, `queue--item-sheet`; "Layout:
 * Deck"). Up next is a row of cards 10 apart that snap one card at a time, the next one peeking.
 * A card: the cover (110 tall) with its number in mono and, when the episode is on the phone, an "ok"
 * green "Downloaded" badge; the show (11, text2), the title (Unbounded 700 14, two lines), the time left
 * in mono 11 and ··· (a 44 target).
 *
 *   - tap: play it (the sheet closes — `onPlay`); the card's name is "Play {title}";
 *   - ···: the item menu (`ItemMenu`: Play now, Move to top, Move up, Move down, Remove from the queue —
 *     the same names and handlers as the old row's actions); the tiles grey out at the ends;
 *   - long-press then slide sideways: reorder (`dragTarget`, one card per 190 pt); to a screen reader
 *     the menu's Move up / Move down are the way, and "Remove" is an accessibility action on the card;
 *   - Edit mode (`select`): a 26 tick circle at the card's foot (hot with a void check when ticked),
 *     a tap ticks the card instead of playing it.
 * The writes go through the sheet's `onChange` (`stores.queue.replace`), as every queue change.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { minutesLabel } from '@/ui/kit/format';
import { swipeA11y, type SwipeAction } from '@/ui/kit/SwipeRow';
import type { Stores } from '@/storage/types';
import { drawnType } from '@/design/type-px';

export const CARD_W = 180;
export const CARD_H = 230;
const GAP = 10;
/** One card plus the gap: the snap distance and the distance a drag moves one place. */
export const CARD_PITCH = CARD_W + GAP;
const COVER_H = 110;

/** How many places a sideways drag of `dx` points moves a card, kept inside the queue. */
export function dragTarget(index: number, dx: number, length: number, pitch: number = CARD_PITCH): number {
  return Math.max(0, Math.min(length - 1, index + Math.round(dx / pitch)));
}

type DeckStores = Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
type Select = { chosen: ReadonlySet<string>; onToggle: (id: string) => void };

/** What a card shows. */
export function useCardData(id: string, stores: DeckStores) {
  const episode = stores.feeds.getEpisode(id);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const at = stores.positions.get(id)?.offsetMs ?? 0;
  const left = episode?.durationMs !== undefined ? `${minutesLabel(Math.max(0, episode.durationMs - at))} left` : undefined;
  const downloaded = stores.downloads.get(id)?.state === 'complete';
  const title = episode?.title ?? id;
  return { episode, show, title, left, downloaded, art: episode?.imageUrl ?? show?.imageUrl, artName: show?.title ?? title };
}

function DeckCard(props: {
  id: string; index: number; ids: readonly string[]; stores: DeckStores; select: Select | undefined;
  dx: number; dragging: boolean;
  onPlay: (id: string) => void; onMore: (id: string) => void; onLift: (id: string) => void; onRemove: (id: string) => void;
}): React.ReactElement {
  const c = useColours();
  const { id, index } = props;
  const d = useCardData(id, props.stores);
  const checked = props.select?.chosen.has(id) === true;
  const remove: SwipeAction[] = [{ key: 'remove', label: 'Remove', onPress: () => props.onRemove(id) }];
  const lifted = props.dragging ? { transform: [{ translateX: props.dx }, { scale: 1.03 }], zIndex: 2 } : undefined;
  const body = (
    <>
      <Box style={{ height: COVER_H }} className="overflow-hidden bg-raise2">
        <Box style={{ marginTop: -(CARD_W - COVER_H) / 2 }}><Artwork url={d.art} size={CARD_W} name={d.artName} rounded="row" /></Box>
        <Box className="absolute rounded-small" style={{ left: 10, top: 10, backgroundColor: c.void, paddingHorizontal: 7, paddingVertical: 5, opacity: 0.85 }}>
          <Type step="mono" className="text-text" style={drawnType.queueNumber}>{String(index + 1)}</Type>
        </Box>
        {d.downloaded ? (
          <Box className="absolute bg-ok rounded-small" style={{ right: 10, top: 10, paddingHorizontal: 6, paddingVertical: 4 }}>
            <Type step="mono" className="text-void" style={drawnType.queueBadge}>Downloaded</Type>
          </Box>
        ) : null}
      </Box>
      <Box className="flex-1 gap-hair" style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <Type step="caption" className="text-text2" style={drawnType.queueShow} numberOfLines={1}>{d.show?.title ?? ''}</Type>
        <Type step="lede" className="text-text" style={drawnType.queueTitle} numberOfLines={2}>{d.title}</Type>
      </Box>
    </>
  );
  return (
    <Box className="bg-raise border border-line rounded-card overflow-hidden" style={{ width: CARD_W, height: CARD_H, ...lifted }}>
      {props.select ? (
        <Pressable onPress={() => props.select!.onToggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Select ${d.title}`} className="flex-1">
          {body}
          <Box className="absolute items-center justify-center rounded-pill" style={{ right: 12, bottom: 12, width: 26, height: 26, backgroundColor: checked ? c.hot : undefined, borderWidth: checked ? 0 : 2, borderColor: c.text }}>
            {checked ? <Icon name="checkmark" size={14} color={c.void} /> : null}
          </Box>
        </Pressable>
      ) : (
        <>
          {/* Tap plays; a long press lifts the card to be slid sideways. The row itself is the "Play …" button. */}
          <Pressable {...swipeA11y(remove)} onPress={() => props.onPlay(id)} onLongPress={() => props.onLift(id)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Play ${d.title}`} accessibilityHint="Long-press, then slide to reorder" className="flex-1">
            {body}
          </Pressable>
          <Box className="absolute flex-row items-center justify-between" style={{ left: 12, right: 4, bottom: 0, height: 44 }} pointerEvents="box-none">
            <Type step="mono" className="text-text3" style={drawnType.queueLeft} numberOfLines={1}>{d.left ?? ''}</Type>
            <Pressable onPress={() => props.onMore(id)} accessibilityRole="button" accessibilityLabel={`More for ${d.title}`} className="items-center justify-center" style={{ width: hit.min, height: hit.min }}>
              <Icon name="ellipsis-horizontal" size={18} color={c.text2} />
            </Pressable>
          </Box>
        </>
      )}
    </Box>
  );
}

/** A tile in the item menu: icon over the name; greyed at the ends of the queue. */
function MenuTile(props: { icon: IconName; label: string; disabled?: boolean; onPress: () => void }): React.ReactElement {
  const c = useColours();
  return (
    <Pressable onPress={props.disabled ? undefined : props.onPress} disabled={props.disabled === true} accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{ disabled: props.disabled === true }} className={`bg-raise rounded-artwork-lg justify-between ${props.disabled ? 'opacity-40' : ''}`} style={{ width: '48.5%', height: 84, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Icon name={props.icon} size={22} color={c.hotText} />
      <Type step="compact" className="text-text">{props.label}</Type>
    </Pressable>
  );
}

/** The item menu: the episode, four tiles (Play now, Move to top, Move up, Move down), Remove, Close. */
export function ItemMenu(props: { id: string | undefined; ids: readonly string[]; stores: DeckStores; onClose: () => void; onChange: (next: readonly string[]) => void; onPlay: (id: string) => void }): React.ReactElement {
  const c = useColours();
  const id = props.id;
  const d = useCardData(id ?? '', props.stores);
  const index = id === undefined ? -1 : props.ids.indexOf(id);
  const last = props.ids.length - 1;
  return (
    <ActionSheet open={id !== undefined && index >= 0} onClose={props.onClose} label="Queue item menu">
      {id !== undefined && index >= 0 ? (
        <>
          <Box className="flex-row items-center gap-row">
            <Artwork url={d.art} size={56} name={d.artName} />
            <Box className="flex-1">
              <Type step="caption" className="text-hotText font-semibold" numberOfLines={1}>{d.show?.title ?? ''}</Type>
              <Type step="lede" className="text-text" style={drawnType.queueTitleLarge} numberOfLines={2}>{d.title}</Type>
            </Box>
          </Box>
          <Box className="flex-row flex-wrap justify-between" style={{ rowGap: 10 }}>
            <MenuTile icon="play-outline" label="Play now" onPress={() => { props.onClose(); props.onPlay(id); }} />
            <MenuTile icon="chevron-up-outline" label="Move to top" disabled={index === 0} onPress={() => { props.onClose(); props.onChange(move(props.ids, id, 0)); }} />
            <MenuTile icon="chevron-up-outline" label="Move up" disabled={index === 0} onPress={() => props.onChange(move(props.ids, id, index - 1))} />
            <MenuTile icon="chevron-down-outline" label="Move down" disabled={index === last} onPress={() => props.onChange(move(props.ids, id, index + 1))} />
          </Box>
          <Pressable onPress={() => { props.onClose(); props.onChange(remove(props.ids, id)); }} accessibilityRole="button" accessibilityLabel="Remove from the queue" className="flex-row items-center gap-row bg-raise rounded-artwork-lg px-row" style={{ minHeight: 56 }}>
            <Icon name="trash-outline" size={18} color={c.hotText} />
            <Type step="row" className="text-hotText">Remove from the queue</Type>
          </Pressable>
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close" className="items-center justify-center rounded-pill bg-raise" style={{ height: hit.min }}>
            <Type step="row" className="text-text">Close</Type>
          </Pressable>
        </>
      ) : null}
    </ActionSheet>
  );
}

export function QueueDeck(props: {
  ids: readonly string[];
  stores: DeckStores;
  onChange: (next: readonly string[]) => void;
  onPlay: (id: string) => void;
  /** Edit mode: every card is a checkbox. */
  select?: Select;
}): React.ReactElement {
  const { ids } = props;
  const [menu, setMenu] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ id: string; dx: number } | undefined>();
  const live = useRef({ ids, onChange: props.onChange, drag: undefined as { id: string; dx: number } | undefined });
  live.current.ids = ids; live.current.onChange = props.onChange; live.current.drag = drag;
  // After a long press the finger is still down: the list claims the touch and the card follows it.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: () => live.current.drag !== undefined,
    onPanResponderMove: (_e, g) => { const cur = live.current.drag; if (cur) setDrag({ id: cur.id, dx: g.dx }); },
    onPanResponderRelease: (_e, g) => {
      const cur = live.current.drag;
      setDrag(undefined);
      if (!cur) return;
      const from = live.current.ids.indexOf(cur.id);
      const to = dragTarget(from, g.dx, live.current.ids.length);
      if (from >= 0 && to !== from) live.current.onChange(move(live.current.ids, cur.id, to));
    },
    onPanResponderTerminate: () => setDrag(undefined),
  }), []);
  return (
    <Box {...pan.panHandlers}>
      <ScrollView horizontal scrollEnabled={drag === undefined} showsHorizontalScrollIndicator={false} snapToInterval={CARD_PITCH} decelerationRate="fast" contentContainerStyle={{ gap: GAP, paddingRight: 20, paddingVertical: 6 }}>
        {ids.map((id, index) => (
          <DeckCard
            key={id}
            id={id}
            index={index}
            ids={ids}
            stores={props.stores}
            select={props.select}
            dx={drag?.id === id ? drag.dx : 0}
            dragging={drag?.id === id}
            onPlay={props.onPlay}
            onMore={setMenu}
            onLift={(lifted) => setDrag({ id: lifted, dx: 0 })}
            onRemove={(removed) => props.onChange(remove(ids, removed))}
          />
        ))}
      </ScrollView>
      <ItemMenu id={menu} ids={ids} stores={props.stores} onClose={() => setMenu(undefined)} onChange={props.onChange} onPlay={props.onPlay} />
    </Box>
  );
}
