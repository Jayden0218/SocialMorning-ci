// "Add to queue" and "Play next" buttons, as tiles in the episode menu.
/**
 * "Add to queue" / "Play next" (US2, FR-008/011), through player-core's enqueue.
 *
 * M17 (`EpisodeMoreSheet-B`): the ⋯ sheet's actions are a two-column grid of white tiles — an
 * accent icon on the left, the label beside it, an optional muted detail under the label. `SheetTile` lives
 * here so DownloadButton and EpisodeExtras draw the same tile; each part is one row of two, so
 * the library, show and episode sheets that stack the three parts all get the grid.
 *
 * M21 T047 (US3, FR-022): a long-press on "Add to queue" adds to the FRONT instead — the same
 * enqueue (and 300 limit; full → the last item drops) as Play next — with "Added to the front".
 * A screen reader reaches it as the tile's "Add to the front" action.
 */
import type { AccessibilityActionEvent } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { queueEpisode } from '@/settings/queue';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';

/** 64 pt: one size for every tile, one or two lines (above the 48 pt floor). */
const TILE = { minHeight: 64 };

export function SheetTile(props: {
  icon: IconName;
  label: string;
  detail?: string;
  iconColour: string;
  onPress?: () => void;
  /** M21 US3: a second action on a long-press, named for screen readers by `longPressLabel`. */
  onLongPress?: () => void;
  longPressLabel?: string;
  accessibilityLabel?: string;
  selected?: boolean;
  tone?: 'normal' | 'accent' | 'muted';
}): React.ReactElement {
  const label = props.tone === 'accent' ? 'text-accent text-body font-bold' : props.tone === 'muted' ? 'text-muted text-body font-bold' : 'text-text text-body font-bold';
  const body = (
    <>
      <Icon name={props.icon} size={20} color={props.iconColour} />
      <Box className="flex-1 justify-center">
        <Text className={label} numberOfLines={2}>{props.label}</Text>
        {props.detail ? <Text className="text-muted text-xs" numberOfLines={1}>{props.detail}</Text> : null}
      </Box>
    </>
  );
  // Owner, 2026-10-05 (Honor 50): icon on the left, words on the right, both centred — with the icon
  // above, a tile with a second line ("Downloaded · 34 MB") pushed its label up over the icon.
  const cls = 'flex-1 flex-row items-center gap-row px-row py-2 rounded-row bg-surface border border-border';
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
      {...(props.onLongPress ? {
        onLongPress: props.onLongPress,
        accessibilityHint: `Long-press: ${props.longPressLabel ?? 'more'}`,
        accessibilityActions: [{ name: 'longpress', label: props.longPressLabel ?? 'More' }],
        onAccessibilityAction: (e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'longpress') props.onLongPress?.(); },
      } : {})}
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
  const add = (where: 'end' | 'front', longPress = false) => {
    // M10: "Download queued episodes" applies here (src/settings/queue.ts).
    const r = queueEpisode(stores, downloads, props.episodeId, Date.now(), where);
    if (r.kind === 'full') { toast('The queue is full (300). Remove something first.'); return; }
    if (r.evicted) toast('The queue was full — the last item was dropped.');
    const said = longPress ? 'Added to the front' : where === 'end' ? 'Added to the queue' : 'Playing next';
    toast(`${said}${r.downloading ? ' · downloading' : ''}`);
    props.onQueued?.();
  };
  // M12 FR-032 made these full-width rows; M17 makes them the first row of tiles.
  return (
    <TileRow>
      <SheetTile icon="play-skip-forward-outline" label="Play next" iconColour={c.accent} onPress={() => add('front')} />
      <SheetTile icon="list-outline" label="Add to queue" iconColour={c.accent} onPress={() => add('end')} onLongPress={() => add('front', true)} longPressLabel="Add to the front" />
    </TileRow>
  );
}
