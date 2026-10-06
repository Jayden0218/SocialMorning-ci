// The queue's rows: play, move up/down, remove, drag to reorder.
/**
 * The queue's rows (M12 FR-044), shared by the queue page and the sheet over the player: 48 pt
 * artwork, the title, the time left, a drag handle, and a ⋮ that opens the actions under the
 * row (Play now, Top, Up, Down, Remove). The M2 page had no artwork, a 12 pt gutter and five
 * text links under every row. Drag is a convenience; every move is also in the ⋮ list, so the
 * queue works with a screen reader and without a drag at all.
 *
 * M17 T052 (`Queue-B`): `layout="page"` draws the queue page's Editorial look — the first
 * episode as an "Up next" card (96 pt artwork, accent eyebrow, serif title, a yellow Play now
 * pill, ⋮ and the drag handle), the rest as numbered rows (serif number, 52 pt artwork, ⋮, the
 * handle on the right), and the ⋮ opens the actions in a sheet headed by the episode.
 *
 * M17 T098 (`QueueSheet-B`): the default `layout="sheet"` (the player's queue sheet) draws every
 * episode as a numbered white card — accent serif number, 64 pt artwork, serif title, the meta
 * line, and ⋮ over the drag handle on the right. ⋮ opens the actions inside the card as pills
 * (Play now yellow; Move to top, Move up, Move down, Remove from the queue) — same names and
 * handlers as the old rows under the item. A card is taller than the old 72 pt row, so the
 * sheet's drag turns distance into places with `SHEET_ROW` instead of `QUEUE_ROW`.
 *
 * M21 T045 (US3, FR-021): the sheet's cards show a ▶ inside the row button (the row plays at
 * once), and `select` turns every row into a checkbox for the sheet's Edit mode — no ⋮, no drag,
 * a tap ticks it.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { Icon } from '@/ui/kit/Icon';
import { SheetRow } from '@/ui/kit/SheetRow';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';
import { minutesLabel } from '@/ui/kit/format';
import type { Stores } from '@/storage/types';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW_TAP = { minHeight: hit.min };
/** A row's height, for turning a drag distance into places moved. */
export const QUEUE_ROW = 72;
/**
 * M17 T098: a closed card's pitch in the sheet — ⋮ over the handle (2 × 48) + 12 pt padding top
 * and bottom + the 1 pt border twice + the 10 pt gap under it. The card's content never exceeds
 * the 96 pt control column (64 pt artwork; title and meta at most 2 lines each).
 */
export const SHEET_ROW = 132;
/** M17 T098: B's pill under an open card is 44 pt; ours keeps the 48 pt floor. */
const PILL = { minHeight: hit.min };
/** M17 T098: ⋮ over the drag handle, a fixed column so the card's height is known. */
const CONTROLS = { width: hit.min, height: hit.min * 2 };
/** M21 US3: the ▶ disc inside a sheet card (drawn, not a second target — the row is the button). */
const PLAY_DISC = { width: 32, height: 32 };

/** How many places a drag of `dy` points moves a row, kept inside the queue. */
export function dragTarget(index: number, dy: number, length: number, row: number = QUEUE_ROW): number {
  return Math.max(0, Math.min(length - 1, index + Math.round(dy / row)));
}

type QueueStores = Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
type Colours = { text: string; muted: string; accent: string };
/** M21: the sheet's Edit mode — which rows are ticked, and the tick. */
type Select = { chosen: ReadonlySet<string>; onToggle: (id: string) => void };

export function QueueList(props: {
  ids: readonly string[];
  stores: QueueStores;
  colours: Colours;
  onChange: (next: readonly string[]) => void;
  onPlay: (id: string) => void;
  /** M17: "page" = the queue page's Editorial layout (`Queue-B`); default "sheet" = the player's sheet. */
  layout?: 'page' | 'sheet';
  /** M21: Edit mode — every row is a checkbox. */
  select?: Select;
}): React.ReactElement {
  const [open, setOpen] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ id: string; dy: number } | undefined>();
  const { ids } = props;
  const page = props.layout === 'page';
  const openIndex = open === undefined ? -1 : ids.indexOf(open);
  const toggle = (id: string) => setOpen((o) => (o === id ? undefined : id));
  return (
    <Box>
      <Text className={page ? 'text-muted text-meta mb-2.5' : 'text-muted text-meta pt-1 pb-2.5'}>{`${plural(ids.length, 'episode')} · plays in order after this one`}</Text>
      {ids.map((id, index) => (
        <QueueRow
          key={id}
          id={id}
          index={index}
          ids={ids}
          stores={props.stores}
          colours={props.colours}
          onChange={props.onChange}
          onPlay={props.onPlay}
          page={page}
          select={props.select}
          open={open === id}
          dy={drag?.id === id ? drag.dy : 0}
          onToggle={() => toggle(id)}
          onDrag={(dy) => setDrag({ id, dy })}
          onDrop={(dy) => { setDrag(undefined); const to = dragTarget(index, dy, ids.length, page ? QUEUE_ROW : SHEET_ROW); if (to !== index) props.onChange(move(ids, id, to)); }}
        />
      ))}
      {page ? (
        <Actionsheet isOpen={open !== undefined && openIndex >= 0} onClose={() => setOpen(undefined)}>
          <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
          <ActionsheetContent className="bg-surface rounded-t-row px-screen-x items-stretch">
            <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
            {open !== undefined && openIndex >= 0 ? (
              <>
                <SheetHead id={open} stores={props.stores} />
                <QueueActions id={open} index={openIndex} ids={ids} colours={props.colours} onChange={props.onChange} onPlay={props.onPlay} onToggle={() => toggle(open)} />
              </>
            ) : null}
          </ActionsheetContent>
        </Actionsheet>
      ) : null}
    </Box>
  );
}

/** What a row shows: the episode, its show, the meta line. */
function useRowData(id: string, stores: QueueStores) {
  const episode = stores.feeds.getEpisode(id);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const at = stores.positions.get(id)?.offsetMs ?? 0;
  const left = episode?.durationMs !== undefined ? `${minutesLabel(Math.max(0, episode.durationMs - at))} left` : undefined;
  const downloaded = stores.downloads.get(id)?.state === 'complete';
  const title = episode?.title ?? id;
  const meta = [show?.title, left, downloaded ? 'Downloaded' : undefined].filter(Boolean).join(' · ');
  return { episode, show, title, meta, art: episode?.imageUrl ?? show?.imageUrl, artName: show?.title ?? title };
}

/** The page sheet's head: the episode it acts on (`Queue-B`). */
function SheetHead(props: { id: string; stores: QueueStores }): React.ReactElement {
  const d = useRowData(props.id, props.stores);
  return (
    <Box className="flex-row items-center gap-row py-row border-b-hairline border-separator">
      <Artwork url={d.art} size={44} name={d.artName} />
      <Text className="text-text text-title font-display flex-1" numberOfLines={2}>{d.title}</Text>
    </Box>
  );
}

/** The ⋮ actions in a sheet on the queue page (the player's queue sheet shows them as pills in the card, M17 T098). */
function QueueActions(props: {
  id: string; index: number; ids: readonly string[]; colours: Colours;
  onChange: (next: readonly string[]) => void; onPlay: (id: string) => void; onToggle: () => void;
}): React.ReactElement {
  const { id, index, ids } = props;
  return (
    <>
      <SheetRow icon="play-outline" label="Play now" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onPlay(id); }} />
      {index > 0 ? <SheetRow icon="chevron-up-outline" label="Move to top" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onChange(move(ids, id, 0)); }} /> : null}
      {index > 0 ? <SheetRow icon="chevron-up-outline" label="Move up" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index - 1))} /> : null}
      {index < ids.length - 1 ? <SheetRow icon="chevron-down-outline" label="Move down" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index + 1))} /> : null}
      <SheetRow icon="trash-outline" label="Remove from the queue" iconColour={props.colours.accent} tone="accent" onPress={() => { props.onToggle(); props.onChange(remove(ids, id)); }} />
    </>
  );
}

function QueueRow(props: {
  id: string; index: number; ids: readonly string[]; open: boolean; dy: number; page: boolean;
  select?: Select | undefined;
  stores: QueueStores;
  colours: Colours;
  onChange: (next: readonly string[]) => void; onPlay: (id: string) => void;
  onToggle: () => void; onDrag: (dy: number) => void; onDrop: (dy: number) => void;
}): React.ReactElement {
  const { id, index, ids, stores, page } = props;
  const d = useRowData(id, stores);
  const playGlyph = useColours().playGlyph;
  const drop = useRef(props.onDrop); drop.current = props.onDrop;
  const dragTo = useRef(props.onDrag); dragTo.current = props.onDrag;
  const handlers: GestureResponderHandlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => dragTo.current(g.dy),
    onPanResponderRelease: (_e, g) => drop.current(g.dy),
    onPanResponderTerminate: (_e, g) => drop.current(g.dy),
  }).panHandlers, []);
  const { title } = d;
  const lifted = props.dy !== 0 ? { transform: [{ translateY: props.dy }], zIndex: 1 } : undefined;
  const handle = (
    <Box {...handlers} className="items-center justify-center" style={TAP} accessible accessibilityRole="adjustable" accessibilityLabel={`Drag to reorder ${title}`}>
      <Icon name="reorder-three-outline" size={22} color={props.colours.muted} />
    </Box>
  );
  const more = (
    <Pressable onPress={props.onToggle} accessibilityRole="button" accessibilityLabel={`More for ${title}`} accessibilityState={{ expanded: props.open }} className="items-center justify-center" style={TAP}>
      <Icon name="ellipsis-vertical" size={20} color={page && index === 0 ? props.colours.muted : props.colours.text} />
    </Pressable>
  );

  // M21 US3: Edit mode — a tap ticks the row; Remove (n) and Clear all live in the sheet's foot.
  if (props.select) {
    const checked = props.select.chosen.has(id);
    const tick = props.select.onToggle;
    return (
      <Pressable onPress={() => tick(id)} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`Select ${title}`} className={`flex-row items-center gap-row mb-2.5 p-3 rounded-row border ${checked ? 'bg-accentTint border-accent' : 'bg-surface border-border'}`} style={ROW_TAP}>
        <Icon name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? props.colours.accent : props.colours.muted} />
        <Artwork url={d.art} size={48} name={d.artName} />
        <Box className="flex-1 gap-0.5">
          <Text className="text-text text-sm font-display-semibold" numberOfLines={2}>{title}</Text>
          {d.meta ? <Text className="text-muted text-xs" numberOfLines={1}>{d.meta}</Text> : null}
        </Box>
      </Pressable>
    );
  }

  // M17 `Queue-B`: the next episode is a card with its own Play now pill.
  if (page && index === 0) {
    return (
      <Box className={`mb-1 ${props.dy !== 0 ? 'rounded-row' : ''}`} style={lifted}>
        <Card className="py-3.5 gap-row">
          <Box className="flex-row items-center gap-section">
            <Artwork url={d.art} size={96} rounded="row" name={d.artName} />
            <Box className="flex-1">
              <Eyebrow accent>Up next</Eyebrow>
              <Text className="text-text text-base font-display mt-1" numberOfLines={3}>{title}</Text>
              {d.meta ? <Text className="text-muted text-xs mt-1" numberOfLines={2}>{d.meta}</Text> : null}
            </Box>
          </Box>
          <Box className="flex-row items-center gap-gap">
            {/* M16a bug 6 (FR-002): tapping the next episode plays it — here as B's pill. */}
            <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center justify-center gap-gap bg-playDisc rounded-pill" style={ROW_TAP}>
              <Icon name="play" size={16} color={playGlyph} />
              <Text className="text-text text-body font-bold">Play now</Text>
            </Pressable>
            {more}
            {handle}
          </Box>
        </Card>
      </Box>
    );
  }

  if (page) {
    return (
      <Box className={props.dy !== 0 ? 'bg-surface rounded-row' : ''} style={lifted}>
        <Box className="flex-row items-center gap-2.5 border-b-hairline border-separator" style={{ minHeight: QUEUE_ROW }}>
          <Text className="text-muted text-lg font-display w-6" accessible={false}>{String(index + 1)}</Text>
          {/* M16a bug 6 (FR-002): the row itself plays the episode. */}
          <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center gap-row" style={ROW_TAP}>
            <Artwork url={d.art} size={52} name={d.artName} />
            <Box className="flex-1">
              <Text className="text-text text-body font-semibold" numberOfLines={2}>{title}</Text>
              {d.meta ? <Text className="text-muted text-xs" numberOfLines={1}>{d.meta}</Text> : null}
            </Box>
          </Pressable>
          {more}
          {handle}
        </Box>
      </Box>
    );
  }

  // M17 `QueueSheet-B`: a numbered card per episode; the actions open inside it as pills.
  return (
    <Box className="mb-2.5" style={lifted}>
      <Box className="bg-surface border border-border rounded-row p-3">
        <Box className="flex-row items-center gap-row">
          <Text className="text-accent text-lg font-display w-6" accessible={false}>{String(index + 1)}</Text>
          {/* M16a bug 6 (FR-002). Phone walk 2026-10-02: tapping a row in "Up next" did nothing —
              the artwork and title were plain views; only the drag handle and ⋮ took a tap. The row
              itself now plays the episode (the sheet closes, the page opens the player). */}
          <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center gap-row" style={ROW_TAP}>
            <Artwork url={d.art} size={64} name={d.artName} />
            <Box className="flex-1 gap-0.5">
              <Text className="text-text text-sm font-display-semibold" numberOfLines={2}>{title}</Text>
              {d.meta ? <Text className="text-muted text-xs" numberOfLines={2}>{d.meta}</Text> : null}
            </Box>
            {/* M21 US3 (FR-021): ▶ on every row; the row itself is the "Play …" button. */}
            <Box className="rounded-pill bg-playDisc items-center justify-center" style={PLAY_DISC}>
              <Icon name="play" size={14} color={playGlyph} />
            </Box>
          </Pressable>
          <Box style={CONTROLS}>
            <Box className={props.open ? 'bg-accentTint rounded-pill' : ''}>{more}</Box>
            {handle}
          </Box>
        </Box>
        {props.open ? (
          <Box className="flex-row flex-wrap gap-gap pt-3 mt-3 border-t-hairline border-separator">
            <Pressable onPress={() => { props.onToggle(); props.onPlay(id); }} accessibilityRole="button" accessibilityLabel="Play now" className="flex-row items-center gap-1.5 px-3 rounded-pill bg-playDisc" style={PILL}>
              <Icon name="play" size={16} color={playGlyph} />
              <Text className="text-text text-meta font-bold">Play now</Text>
            </Pressable>
            {index > 0 ? (
              <Pressable onPress={() => { props.onToggle(); props.onChange(move(ids, id, 0)); }} accessibilityRole="button" accessibilityLabel="Move to top" className="flex-row items-center gap-1.5 px-3 rounded-pill bg-background border border-border" style={PILL}>
                <Icon name="chevron-up-outline" size={16} color={props.colours.text} />
                <Text className="text-text text-meta font-bold">Move to top</Text>
              </Pressable>
            ) : null}
            {index > 0 ? (
              <Pressable onPress={() => props.onChange(move(ids, id, index - 1))} accessibilityRole="button" accessibilityLabel="Move up" className="flex-row items-center gap-1.5 px-3 rounded-pill bg-background border border-border" style={PILL}>
                <Icon name="chevron-up-outline" size={16} color={props.colours.text} />
                <Text className="text-text text-meta font-bold">Move up</Text>
              </Pressable>
            ) : null}
            {index < ids.length - 1 ? (
              <Pressable onPress={() => props.onChange(move(ids, id, index + 1))} accessibilityRole="button" accessibilityLabel="Move down" className="flex-row items-center gap-1.5 px-3 rounded-pill bg-background border border-border" style={PILL}>
                <Icon name="chevron-down-outline" size={16} color={props.colours.text} />
                <Text className="text-text text-meta font-bold">Move down</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => { props.onToggle(); props.onChange(remove(ids, id)); }} accessibilityRole="button" accessibilityLabel="Remove from the queue" className="flex-row items-center gap-1.5 px-3 rounded-pill bg-background border border-border" style={PILL}>
              <Icon name="trash-outline" size={16} color={props.colours.accent} />
              <Text className="text-accent text-meta font-bold">Remove from the queue</Text>
            </Pressable>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
