// The queue page's Deck: 290 x 330 episode cards, a dots row, and the rest of the queue as a strip of small tiles.
/**
 * M31 W3-B (T041; design-pulse2 `queue--screen`, `queue--empty`, `queue--item-sheet`; "Layout: Deck"). The queue page
 * is a row of full-size cards, 290 x 330 and 10 apart, snapping one at a time with the next one peeking, the first
 * starting at the 28 lane under the "Up next" edge label (the same cards as Updates):
 *   - the cover (46 % of the card) with a mono tag `n` or `n · DOWNLOADED` over its top left corner;
 *   - the show (12, text2), the title (Unbounded 700 18, two lines);
 *   - the first card's foot: a light "Play now" pill (40 tall) and a ··· circle; the other cards' foot: the episode's
 *     reaction curve (30 bars, 22 tall), the ··· circle and a 44 light Play circle.
 *   Tap a card = open the episode; Play = play it now (the queue sheet closes nothing here: this is a page).
 *   ··· = the item menu (Play now, Move to top, Move up, Move down, Remove from the queue: `ItemMenu` in
 *   src/ui/player/QueueDeck.tsx, the same sheet the player's deck opens).
 *   - Reorder: long-press a card and slide it sideways (one card per 300 pt); a screen reader uses the menu's Move up
 *     / Move down, and "Remove" is an accessibility action on the card. (Approved, drawing note "Drag a card sideways".)
 *   - Edit mode (`select`): a 26 tick at the card's foot, a tap ticks instead of opening.
 *   - Under the deck, four dots (the current card is the 18 wide light one) and the rest of the queue as a strip of
 *     small tiles `n. title` (cover 36), each a Play button (the drawing's action map: "Play {title} (x3) — Play circle
 *     on each card / tap a strip tile").
 * Writes go through `onChange` (`stores.queue.replace` in app/queue.tsx), as every queue change.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, hit, radius, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { Curve } from '@/ui/kit/Curve';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { IconButton } from '@/ui/kit/PulseButton';
import { Artwork } from '@/ui/kit/Artwork';
import { swipeA11y, type SwipeAction } from '@/ui/kit/SwipeRow';
import { CoverBand, DiscPlay, PX, UNBOUNDED } from '@/ui/discover/Deck';
import { useEpisodeHeat } from '@/ui/discover/useEpisodeHeat';
import { ItemMenu, useCardData } from '@/ui/player/QueueDeck';
import type { Stores } from '@/storage/types';
import { QUEUE_CARD, QUEUE_DOTS, QUEUE_PAGE, QUEUE_PITCH, QUEUE_TILE, queueType } from './measures';

export { QUEUE_CARD, QUEUE_PITCH };

const NO_HEAT: readonly number[] = [];

/** How many places a sideways drag of `dx` points moves a card, kept inside the queue. */
export function dragTarget(index: number, dx: number, length: number, pitch: number = QUEUE_PITCH): number {
  return Math.max(0, Math.min(length - 1, index + Math.round(dx / pitch)));
}

/** The dots under the deck: one per card, or a window of ten round the current one in a long queue. */
export function dotsFor(count: number, current: number, max = 10): { at: number; on: boolean }[] {
  const shown = Math.min(count, max);
  const start = Math.max(0, Math.min(count - shown, current - Math.floor(shown / 2)));
  return Array.from({ length: shown }, (_, k) => ({ at: start + k, on: start + k === current }));
}

type QueueStores = Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
/** Edit mode: which cards are ticked. */
type Select = { chosen: ReadonlySet<string>; onToggle: (id: string) => void };

/** "2 h 41 min" / "38 min": the time left in the queue (each episode less where this phone stopped it). */
export function queueTotal(ids: readonly string[], stores: Pick<Stores, 'feeds' | 'positions'>): string {
  let ms = 0;
  let known = false;
  for (const id of ids) {
    const d = stores.feeds.getEpisode(id)?.durationMs;
    if (d === undefined) continue;
    known = true;
    ms += Math.max(0, d - (stores.positions.get(id)?.offsetMs ?? 0));
  }
  if (!known) return '';
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60)} min` : `${minutes} min`;
}

/** The page's subtitle: "4 episodes · 2 h 41 min". */
export function queueSubtitle(ids: readonly string[], stores: Pick<Stores, 'feeds' | 'positions'>): string {
  const total = queueTotal(ids, stores);
  return total ? `${plural(ids.length, 'episode')} · ${total}` : plural(ids.length, 'episode');
}

function Card(props: {
  id: string; index: number; ids: readonly string[]; stores: QueueStores; select: Select | undefined;
  dx: number; dragging: boolean;
  onPlay: (id: string) => void; onOpen: (id: string) => void; onMore: (id: string) => void; onLift: (id: string) => void; onRemove: (id: string) => void;
}): React.ReactElement {
  const { id, index } = props;
  const d = useCardData(id, props.stores);
  const heat = useEpisodeHeat(id, index < QUEUE_PAGE.heatCards);
  const checked = props.select?.chosen.has(id) === true;
  const first = index === 0;
  const swipe: SwipeAction[] = [{ key: 'remove', label: 'Remove', onPress: () => props.onRemove(id) }];
  const lifted = props.dragging ? { transform: [{ translateX: props.dx }, { scale: 1.03 }], zIndex: 2 } : undefined;
  const tag = `${String(index + 1)}${d.downloaded ? ' · DOWNLOADED' : ''}`;
  const body = (
    <>
      <CoverBand url={d.art} name={d.artName} height={Math.round(QUEUE_CARD.height * QUEUE_CARD.coverShare)}>
        <Box className="absolute bg-glassDark" style={{ left: spacing.row, top: spacing.row, paddingHorizontal: PX.six + 1, paddingVertical: PX.four + 1, borderRadius: radius.chip - 1 }}>
          <Type step="tag" className="text-text" style={queueType.tag}>{tag}</Type>
        </Box>
      </CoverBand>
      <Box className="flex-1" style={{ padding: QUEUE_CARD.pad, gap: PX.six + 1 }}>
        <Type step="caption" className="text-text2" style={queueType.show} numberOfLines={1}>{d.show?.title ?? ''}</Type>
        <Type step="lede" className="text-text font-bold" style={UNBOUNDED[17]} numberOfLines={2}>{d.title}</Type>
      </Box>
    </>
  );
  return (
    <Box testID="queue-card" className="bg-raise border border-line overflow-hidden" style={{ width: QUEUE_CARD.width, height: QUEUE_CARD.height, borderRadius: radius.card, ...lifted }}>
      {props.select ? (
        <Pressable onPress={() => props.select!.onToggle(id)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Select ${d.title}`} className="flex-1">
          {body}
          <Box className="absolute items-center justify-center rounded-pill" style={{ right: QUEUE_CARD.pad, bottom: QUEUE_CARD.pad, width: QUEUE_CARD.tick, height: QUEUE_CARD.tick, backgroundColor: checked ? colour.hot : undefined, borderWidth: checked ? 0 : 2, borderColor: colour.text }}>
            {checked ? <Icon name="checkmark" size={14} color={colour.void} /> : null}
          </Box>
        </Pressable>
      ) : (
        <>
          {/* Tap opens the episode; a long press lifts the card to be slid sideways. */}
          <Pressable {...swipeA11y(swipe)} onPress={() => props.onOpen(id)} onLongPress={() => props.onLift(id)} delayLongPress={350} accessibilityRole="button" accessibilityLabel={`Open ${d.title}`} accessibilityHint="Long-press, then slide to reorder" className="flex-1">
            {body}
          </Pressable>
          <Box className="absolute flex-row items-center" style={{ left: QUEUE_CARD.pad, right: QUEUE_CARD.pad, bottom: QUEUE_CARD.pad, gap: spacing.gap }} pointerEvents="box-none">
            {first ? (
              <>
                {/* M16a bug 6 (FR-002): the next episode plays at once; the pill is the page's strongest button. */}
                <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${d.title}`} hitSlop={4} className="flex-row items-center justify-center bg-text rounded-pill" style={{ height: QUEUE_CARD.pill, paddingHorizontal: PX.fourteen, gap: PX.six }}>
                  <Icon name="play" size={14} color={colour.void} />
                  <Type step="row" className="text-void">Play now</Type>
                </Pressable>
                <Box className="flex-1" />
                <IconButton icon="ellipsis-horizontal" label={`More for ${d.title}`} onPress={() => props.onMore(id)} fill size={18} diameter={QUEUE_CARD.more} />
              </>
            ) : (
              <>
                <Box className="flex-1">
                  <Curve data={heat.buckets ?? NO_HEAT} count={QUEUE_CARD.bars} height={QUEUE_CARD.curve} min={2} flat={heat.buckets === undefined} played={0} />
                </Box>
                <IconButton icon="ellipsis-horizontal" label={`More for ${d.title}`} onPress={() => props.onMore(id)} fill size={18} diameter={QUEUE_CARD.more} />
                <DiscPlay size={QUEUE_CARD.play} title={d.title} onPress={() => props.onPlay(id)} />
              </>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

/** One small tile of the strip: `3. Title`, a Play button. */
function StripTile(props: { id: string; number: number; width: number; stores: QueueStores; onPlay: (id: string) => void }): React.ReactElement {
  const d = useCardData(props.id, props.stores);
  return (
    <Pressable onPress={() => props.onPlay(props.id)} accessibilityRole="button" accessibilityLabel={`Play ${d.title}`} className="flex-row items-center bg-raise" style={{ width: props.width, minHeight: hit.min, padding: QUEUE_TILE.pad, gap: QUEUE_TILE.gap, borderRadius: QUEUE_TILE.radius }}>
      <Artwork url={d.art} size={QUEUE_TILE.cover} name={d.artName} />
      <Type step="compact" className="text-text flex-1" style={queueType.strip} numberOfLines={2}>{`${String(props.number)}. ${d.title}`}</Type>
    </Pressable>
  );
}

export function QueueList(props: {
  ids: readonly string[];
  stores: QueueStores;
  onChange: (next: readonly string[]) => void;
  onPlay: (id: string) => void;
  /** A tap on a card: the episode's page. */
  onOpen: (id: string) => void;
  /** Where the deck starts, from the top of the page (under the status bar). */
  top?: number;
  /** Edit mode: every card is a checkbox. */
  select?: Select;
}): React.ReactElement {
  const { ids } = props;
  const { width: window } = useWindowDimensions();
  const [menu, setMenu] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ id: string; dx: number } | undefined>();
  const [current, setCurrent] = useState(0);
  const live = useRef({ ids, onChange: props.onChange, drag: undefined as { id: string; dx: number } | undefined });
  useEffect(() => { live.current.ids = ids; live.current.onChange = props.onChange; live.current.drag = drag; });
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
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setCurrent(Math.max(0, Math.min(ids.length - 1, Math.round(e.nativeEvent.contentOffset.x / QUEUE_PITCH))));
  const rest = ids.slice(2);
  const tileWidth = Math.floor((window - QUEUE_CARD.lane - spacing.section - QUEUE_TILE.gap) / 2);
  return (
    <Box style={{ paddingTop: props.top ?? 0 }}>
      <Box>
        <EdgeLabel label="Up next" top={QUEUE_PAGE.edgeTop} />
        <Box {...pan.panHandlers}>
          <ScrollView
            horizontal
            testID="queue-deck"
            scrollEnabled={drag === undefined}
            showsHorizontalScrollIndicator={false}
            snapToInterval={QUEUE_PITCH}
            decelerationRate="fast"
            onScroll={onScroll}
            scrollEventThrottle={64}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: QUEUE_CARD.gap, paddingLeft: QUEUE_CARD.lane, paddingRight: spacing.section, paddingVertical: spacing.hair }}
          >
            {ids.map((id, index) => (
              <Card
                key={id}
                id={id}
                index={index}
                ids={ids}
                stores={props.stores}
                select={props.select}
                dx={drag?.id === id ? drag.dx : 0}
                dragging={drag?.id === id}
                onPlay={props.onPlay}
                onOpen={props.onOpen}
                onMore={setMenu}
                onLift={(lifted) => setDrag({ id: lifted, dx: 0 })}
                onRemove={(removed) => props.onChange(remove(ids, removed))}
              />
            ))}
          </ScrollView>
        </Box>
      </Box>
      <Box testID="queue-dots" accessible={false} importantForAccessibility="no-hide-descendants" className="flex-row" style={{ marginLeft: QUEUE_CARD.lane, marginTop: QUEUE_DOTS.top, gap: QUEUE_DOTS.gap }}>
        {dotsFor(ids.length, current).map(({ at, on }) => <Box key={at} className={on ? 'bg-text' : 'bg-switchOff'} style={{ width: on ? QUEUE_DOTS.on : QUEUE_DOTS.off, height: QUEUE_DOTS.height, borderRadius: radius.tick }} />)}
      </Box>
      {rest.length > 0 ? (
        <ScrollView testID="queue-strip" horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: QUEUE_TILE.top }} contentContainerStyle={{ gap: QUEUE_TILE.gap, paddingLeft: QUEUE_CARD.lane, paddingRight: spacing.section }}>
          {rest.map((id, k) => <StripTile key={id} id={id} number={k + 3} width={tileWidth} stores={props.stores} onPlay={props.onPlay} />)}
        </ScrollView>
      ) : null}
      <ItemMenu id={menu} ids={ids} stores={props.stores} onClose={() => setMenu(undefined)} onChange={props.onChange} onPlay={props.onPlay} />
    </Box>
  );
}
