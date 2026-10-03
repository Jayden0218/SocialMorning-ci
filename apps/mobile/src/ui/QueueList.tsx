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
 * handle on the right), and the ⋮ opens the actions in a sheet headed by the episode. The
 * default (`"sheet"`) is unchanged for the player's queue sheet (restyled later by T098). The
 * actions, their names and handlers are one component used by both, so nothing is lost.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from './lib/actionsheet';
import { Artwork } from './Artwork';
import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { Icon } from './Icon';
import { SheetRow } from './SheetRow';
import { useColours } from './useColours';
import { hit } from '../design';
import { minutesLabel } from './format';
import type { Stores } from '../storage/types';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROW_TAP = { minHeight: hit.min };
/** A row's height, for turning a drag distance into places moved. */
export const QUEUE_ROW = 72;

/** How many places a drag of `dy` points moves a row, kept inside the queue. */
export function dragTarget(index: number, dy: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index + Math.round(dy / QUEUE_ROW)));
}

type QueueStores = Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
type Colours = { text: string; muted: string; accent: string };

export function QueueList(props: {
  ids: readonly string[];
  stores: QueueStores;
  colours: Colours;
  onChange: (next: readonly string[]) => void;
  onPlay: (id: string) => void;
  /** M17: "page" = the queue page's Editorial layout (`Queue-B`); default "sheet" = the player's sheet. */
  layout?: 'page' | 'sheet';
}): React.ReactElement {
  const [open, setOpen] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ id: string; dy: number } | undefined>();
  const { ids } = props;
  const page = props.layout === 'page';
  const openIndex = open === undefined ? -1 : ids.indexOf(open);
  const toggle = (id: string) => setOpen((o) => (o === id ? undefined : id));
  return (
    <Box>
      <Text className={page ? 'text-muted text-meta mb-2.5' : 'text-muted text-xs py-2'}>{`${plural(ids.length, 'episode')} · plays in order after this one`}</Text>
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
          open={open === id}
          dy={drag?.id === id ? drag.dy : 0}
          onToggle={() => toggle(id)}
          onDrag={(dy) => setDrag({ id, dy })}
          onDrop={(dy) => { setDrag(undefined); const to = dragTarget(index, dy, ids.length); if (to !== index) props.onChange(move(ids, id, to)); }}
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

/** The ⋮ actions — inline under a row in the player's sheet, in a sheet on the queue page. */
function QueueActions(props: {
  id: string; index: number; ids: readonly string[]; colours: Colours;
  onChange: (next: readonly string[]) => void; onPlay: (id: string) => void; onToggle: () => void;
}): React.ReactElement {
  const { id, index, ids } = props;
  return (
    <>
      <SheetRow icon="play-outline" label="Play now" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onPlay(id); }} />
      {index > 0 ? <SheetRow icon="arrow-up-outline" label="Move to top" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onChange(move(ids, id, 0)); }} /> : null}
      {index > 0 ? <SheetRow icon="chevron-up-outline" label="Move up" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index - 1))} /> : null}
      {index < ids.length - 1 ? <SheetRow icon="chevron-down-outline" label="Move down" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index + 1))} /> : null}
      <SheetRow icon="trash-outline" label="Remove from the queue" iconColour={props.colours.accent} tone="accent" onPress={() => { props.onToggle(); props.onChange(remove(ids, id)); }} />
    </>
  );
}

function QueueRow(props: {
  id: string; index: number; ids: readonly string[]; open: boolean; dy: number; page: boolean;
  stores: QueueStores;
  colours: Colours;
  onChange: (next: readonly string[]) => void; onPlay: (id: string) => void;
  onToggle: () => void; onDrag: (dy: number) => void; onDrop: (dy: number) => void;
}): React.ReactElement {
  const { id, index, ids, stores, page } = props;
  const d = useRowData(id, stores);
  const onPrimary = useColours().onPrimary;
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
            <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center justify-center gap-gap bg-primary rounded-pill" style={ROW_TAP}>
              <Icon name="play" size={16} color={onPrimary} />
              <Text className="text-onPrimary text-body font-bold">Play now</Text>
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

  return (
    <Box className={props.dy !== 0 ? 'bg-surface rounded-row' : ''} style={lifted}>
      <Box className="flex-row items-center gap-row border-b-hairline border-separator" style={{ minHeight: QUEUE_ROW }}>
        {handle}
        {/* M16a bug 6 (FR-002). Phone walk 2026-10-02: tapping a row in "Up next" did nothing —
            the artwork and title were plain views; only the drag handle and ⋮ took a tap. The row
            itself now plays the episode (the sheet closes, the page opens the player). */}
        <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center gap-row" style={ROW_TAP}>
          <Artwork url={d.art} size={48} name={d.artName} />
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={2}>{title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{d.meta}</Text>
          </Box>
        </Pressable>
        {more}
      </Box>
      {props.open ? (
        <Box className="pl-12">
          <QueueActions id={id} index={index} ids={ids} colours={props.colours} onChange={props.onChange} onPlay={props.onPlay} onToggle={props.onToggle} />
        </Box>
      ) : null}
    </Box>
  );
}
