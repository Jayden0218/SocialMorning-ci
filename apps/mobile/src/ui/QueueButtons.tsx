/**
 * "Add to queue" / "Play next" (US2, FR-008/011), through player-core's enqueue.
 *
 * M17 (`EpisodeMoreSheet-B`): the ⋯ sheet's actions are a two-column grid of white tiles — an
 * accent icon at the top left, the label under it, an optional muted detail. `SheetTile` lives
 * here so DownloadButton and EpisodeExtras draw the same tile; each part is one row of two, so
 * the library, show and episode sheets that stack the three parts all get the grid.
 */
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Icon, type IconName } from './Icon';
import { useColours } from './useColours';
import { queueEpisode } from '../settings/queue';
import { useDownloads, useStores, useToast } from './providers';

/** 76 pt, as in B — above the 48 pt floor. */
const TILE = { minHeight: 76 };

export function SheetTile(props: {
  icon: IconName;
  label: string;
  detail?: string;
  iconColour: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  selected?: boolean;
  tone?: 'normal' | 'accent' | 'muted';
}): React.ReactElement {
  const label = props.tone === 'accent' ? 'text-accent text-body font-bold' : props.tone === 'muted' ? 'text-muted text-body font-bold' : 'text-text text-body font-bold';
  const body = (
    <>
      <Icon name={props.icon} size={20} color={props.iconColour} />
      <Box className="flex-1 justify-end">
        <Text className={label} numberOfLines={2}>{props.label}</Text>
        {props.detail ? <Text className="text-muted text-xs" numberOfLines={1}>{props.detail}</Text> : null}
      </Box>
    </>
  );
  const cls = 'flex-1 gap-gap p-row rounded-row bg-surface border border-border';
  if (!props.onPress) {
    // A statement of fact ("Downloaded", "Downloading · 43 %"), not an action.
    return <Box className={cls} style={TILE} accessible accessibilityLabel={props.detail ? `${props.accessibilityLabel ?? props.label}, ${props.detail}` : props.accessibilityLabel ?? props.label}>{body}</Box>;
  }
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      {...(props.selected !== undefined ? { accessibilityState: { selected: props.selected } } : {})}
      className={cls}
      style={TILE}
    >
      {body}
    </Pressable>
  );
}

/** One row of the grid: two tiles side by side. */
export function TileRow(props: { children: React.ReactNode }): React.ReactElement {
  return <Box className="flex-row gap-gap mb-gap">{props.children}</Box>;
}

export function QueueButtons(props: { episodeId: string; onQueued?: () => void }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const downloads = useDownloads();
  const c = useColours(stores.settings);
  const add = (where: 'end' | 'front') => {
    // M10: "Download queued episodes" applies here (src/settings/queue.ts).
    const r = queueEpisode(stores, downloads, props.episodeId, Date.now(), where);
    if (r.kind === 'full') { toast('The queue is full (300). Remove something first.'); return; }
    if (r.evicted) toast('The queue was full — the last item was dropped.');
    toast(`${where === 'end' ? 'Added to the queue' : 'Playing next'}${r.downloading ? ' · downloading' : ''}`);
    props.onQueued?.();
  };
  // M12 FR-032 made these full-width rows; M17 makes them the first row of tiles.
  return (
    <TileRow>
      <SheetTile icon="play-skip-forward-outline" label="Play next" iconColour={c.accent} onPress={() => add('front')} />
      <SheetTile icon="list-outline" label="Add to queue" iconColour={c.accent} onPress={() => add('end')} />
    </TileRow>
  );
}
