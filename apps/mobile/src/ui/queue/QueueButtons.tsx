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
 *
 * M31 W3-B (T041; design-pulse2 `stile`, the More sheet's tiles, and `toast--queue-buttons`): a tile is 84 tall, radius 20,
 * raise fill, 12 / 14 of padding, the icon (hot-text 22) top left and the name (Geist 600 14) with its mono 11 detail
 * at the foot; two to a row, 10 apart. A statement of fact ("Downloaded") is the same tile with no press. The toasts are
 * the shared toast (light, void words): "Playing next · downloading", "Added to the queue", "Added to the front",
 * "The queue is full (300). Remove something first.", "The queue was full — the last item was dropped."
 */
import type { AccessibilityActionEvent } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { player } from '@/design/tokens';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { queueEpisode } from '@/settings/queue';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';

/** The drawn tile: 84 tall, radius 20, padding 12 / 14 (the `player` block's tile numbers). */
const TILE = { height: player.tileHeight, borderRadius: player.panelRadius, paddingVertical: player.tilePadY, paddingHorizontal: player.tilePadX };

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
  const c = useColours();
  const words = props.tone === 'accent' ? 'text-hotText' : props.tone === 'muted' ? 'text-text2' : 'text-text';
  const body = (
    <>
      <Icon name={props.icon} size={player.tileIcon} color={props.iconColour} />
      <Box>
        <Type step="compact" className={words} numberOfLines={2}>{props.label}</Type>
        {props.detail ? <Type step="mono" className="text-text3" numberOfLines={1} style={{ fontSize: player.tileDetail, lineHeight: player.tileDetailLine }}>{props.detail}</Type> : null}
      </Box>
    </>
  );
  const cls = 'flex-1 justify-between bg-raise';
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
      style={{ ...TILE, ...(props.selected === true ? { borderWidth: player.tileOutline, borderColor: c.hot } : null) }}
    >
      {body}
    </Pressable>
  );
}

/** One row of the grid: two tiles side by side, 10 apart. */
export function TileRow(props: { children: React.ReactNode }): React.ReactElement {
  return <Box className="flex-row" style={{ gap: player.tileGap, marginBottom: player.tileGap }}>{props.children}</Box>;
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
