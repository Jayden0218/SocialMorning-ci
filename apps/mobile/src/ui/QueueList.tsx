/**
 * The queue's rows (M12 FR-044), shared by the queue page and the sheet over the player: 48 pt
 * artwork, the title, the time left, a drag handle, and a ⋮ that opens the actions under the
 * row (Play now, Top, Up, Down, Remove). The M2 page had no artwork, a 12 pt gutter and five
 * text links under every row. Drag is a convenience; every move is also in the ⋮ list, so the
 * queue works with a screen reader and without a drag at all.
 */
import { useMemo, useRef, useState } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';
import { move, remove } from '@socialmorning/player-core';
import { plural } from '@socialmorning/social-core';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { SheetRow } from './SheetRow';
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

export function QueueList(props: {
  ids: readonly string[];
  stores: Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
  colours: { text: string; muted: string; accent: string };
  onChange: (next: readonly string[]) => void;
  onPlay: (id: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState<string | undefined>();
  const [drag, setDrag] = useState<{ id: string; dy: number } | undefined>();
  const { ids } = props;
  return (
    <Box>
      <Text className="text-muted text-xs py-2">{`${plural(ids.length, 'episode')} · plays in order after this one`}</Text>
      {ids.map((id, index) => (
        <QueueRow
          key={id}
          id={id}
          index={index}
          {...props}
          open={open === id}
          dy={drag?.id === id ? drag.dy : 0}
          onToggle={() => setOpen((o) => (o === id ? undefined : id))}
          onDrag={(dy) => setDrag({ id, dy })}
          onDrop={(dy) => { setDrag(undefined); const to = dragTarget(index, dy, ids.length); if (to !== index) props.onChange(move(ids, id, to)); }}
        />
      ))}
    </Box>
  );
}

function QueueRow(props: {
  id: string; index: number; ids: readonly string[]; open: boolean; dy: number;
  stores: Pick<Stores, 'feeds' | 'positions' | 'downloads'>;
  colours: { text: string; muted: string; accent: string };
  onChange: (next: readonly string[]) => void; onPlay: (id: string) => void;
  onToggle: () => void; onDrag: (dy: number) => void; onDrop: (dy: number) => void;
}): React.ReactElement {
  const { id, index, ids, stores } = props;
  const episode = stores.feeds.getEpisode(id);
  const show = episode ? stores.feeds.getShow(episode.feedUrl) : undefined;
  const at = stores.positions.get(id)?.offsetMs ?? 0;
  const left = episode?.durationMs !== undefined ? `${minutesLabel(Math.max(0, episode.durationMs - at))} left` : undefined;
  const downloaded = stores.downloads.get(id)?.state === 'complete';
  const drop = useRef(props.onDrop); drop.current = props.onDrop;
  const dragTo = useRef(props.onDrag); dragTo.current = props.onDrag;
  const handlers: GestureResponderHandlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_e, g) => dragTo.current(g.dy),
    onPanResponderRelease: (_e, g) => drop.current(g.dy),
    onPanResponderTerminate: (_e, g) => drop.current(g.dy),
  }).panHandlers, []);
  const title = episode?.title ?? id;
  return (
    <Box className={props.dy !== 0 ? 'bg-surface rounded-row' : ''} style={props.dy !== 0 ? { transform: [{ translateY: props.dy }], zIndex: 1 } : undefined}>
      <Box className="flex-row items-center gap-row border-b-hairline border-separator" style={{ minHeight: QUEUE_ROW }}>
        <Box {...handlers} className="items-center justify-center" style={TAP} accessible accessibilityRole="adjustable" accessibilityLabel={`Drag to reorder ${title}`}>
          <Icon name="reorder-three-outline" size={22} color={props.colours.muted} />
        </Box>
        {/* M16a bug 6 (FR-002). Phone walk 2026-10-02: tapping a row in "Up next" did nothing —
            the artwork and title were plain views; only the drag handle and ⋮ took a tap. The row
            itself now plays the episode (the sheet closes, the page opens the player). */}
        <Pressable onPress={() => props.onPlay(id)} accessibilityRole="button" accessibilityLabel={`Play ${title}`} className="flex-1 flex-row items-center gap-row" style={ROW_TAP}>
          <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={48} name={show?.title ?? title} />
          <Box className="flex-1">
            <Text className="text-text text-sm font-semibold" numberOfLines={2}>{title}</Text>
            <Text className="text-muted text-xs" numberOfLines={1}>{[show?.title, left, downloaded ? 'Downloaded' : undefined].filter(Boolean).join(' · ')}</Text>
          </Box>
        </Pressable>
        <Pressable onPress={props.onToggle} accessibilityRole="button" accessibilityLabel={`More for ${title}`} accessibilityState={{ expanded: props.open }} className="items-center justify-center" style={TAP}>
          <Icon name="ellipsis-vertical" size={20} color={props.colours.text} />
        </Pressable>
      </Box>
      {props.open ? (
        <Box className="pl-12">
          <SheetRow icon="play-outline" label="Play now" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onPlay(id); }} />
          {index > 0 ? <SheetRow icon="arrow-up-outline" label="Move to top" iconColour={props.colours.text} onPress={() => { props.onToggle(); props.onChange(move(ids, id, 0)); }} /> : null}
          {index > 0 ? <SheetRow icon="chevron-up-outline" label="Move up" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index - 1))} /> : null}
          {index < ids.length - 1 ? <SheetRow icon="chevron-down-outline" label="Move down" iconColour={props.colours.text} onPress={() => props.onChange(move(ids, id, index + 1))} /> : null}
          <SheetRow icon="trash-outline" label="Remove from the queue" iconColour={props.colours.accent} tone="accent" onPress={() => { props.onToggle(); props.onChange(remove(ids, id)); }} />
        </Box>
      ) : null}
    </Box>
  );
}
