// What an episode sheet holds: the episode's head, the tiles (or a second page), and the Cancel pill.
/**
 * M31 W3-A (T040; design-pulse2 `episode--more-sheet` and `episode--card-sheet`, layout Mosaic): the body both episode sheets share —
 * the Episode page's ··· sheet (`EpisodeMoreSheet`) and the sheet every episode row opens (`EpisodeRowSheet`).
 *
 * The head is the episode: cover 64 (48 on a second page), the show in hot-text 12 (a link when `onShow` is given), the title in
 * Unbounded 16. Then 2-column tiles (84 tall, radius 20, 10 apart; the kit `PulseTile`): Play next · Add to queue / Download · Add to
 * favourites / Save this moment (shows the time) · Add to playlist, then `trailing` tiles (the page adds Report episode and Download to
 * Watch), then `rows` (the row sheet's Panel group). Add to queue adds to the FRONT on a long-press ("Added to the front"). Download shows
 * its state in mono (see `DownloadButton`); while it would wait for Wi-Fi a wide "Use mobile data instead" tile sits under its row.
 * Add to favourites is light with "Remove from favourites" when on. Save this moment and Add to playlist swap everything for their
 * second page (`MorePanels`). Cancel is a quiet pill in hot-text, hidden on the note page (which has its own).
 *
 * The same actions, names and toasts as the old sheets (`QueueButtons`, `DownloadButton`, `EpisodeExtras`, which other pages still draw).
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PulseTile, PulseTileGrid } from '@/ui/kit/PulseTile';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { isFavourite, toggleFavourite } from '@/me/favourites';
import { queueEpisode } from '@/settings/queue';
import { useSocial } from '@/social/context';
import { useDownloads, useStores, useToast } from '@/ui/shell/providers';
import { DownloadTiles } from './DownloadButton';
import { MomentPanel, PlaylistPanel } from './MorePanels';
import { EPISODE } from './measures';

export function EpisodeSheetBody(props: {
  episodeId: string;
  title: string;
  imageUrl: string | undefined;
  showTitle: string | undefined;
  /** Makes the show line a link (the row sheet's "Show: …"). */
  onShow?: () => void;
  /** Where the listener is in this episode (the loaded one, else the saved one). */
  atMs: number;
  /** The heat curve on the audio's axis (100 buckets), for the note page's mini curve; empty when not loaded. */
  heat: readonly number[];
  durationMs: number | undefined;
  onQueued: () => void;
  /** Closes the sheet (Cancel). */
  onClose: () => void;
  /** Tiles after the shared six (a page's own). */
  trailing?: React.ReactNode;
  /** Rows under the tiles (the row sheet's Panel group). */
  rows?: React.ReactNode;
}): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const downloads = useDownloads();
  const { listener } = useSocial();
  const [panel, setPanel] = useState<'moment' | 'playlist' | undefined>();
  const [, bump] = useState(0);
  const fav = isFavourite(stores.settings, props.episodeId);
  const add = (where: 'end' | 'front', longPress = false) => {
    // M10: "Download queued episodes" applies here (src/settings/queue.ts).
    const r = queueEpisode(stores, downloads, props.episodeId, Date.now(), where);
    if (r.kind === 'full') { toast('The queue is full (300). Remove something first.'); return; }
    if (r.evicted) toast('The queue was full — the last item was dropped.');
    const said = longPress ? 'Added to the front' : where === 'end' ? 'Added to the queue' : 'Playing next';
    toast(`${said}${r.downloading ? ' · downloading' : ''}`);
    props.onQueued();
  };
  const openPlaylists = () => {
    if (!listener) { toast('Sign in to make playlists.'); return; }
    setPanel('playlist');
  };
  const show = props.showTitle === undefined ? null : props.onShow ? (
    <Pressable onPress={props.onShow} accessibilityRole="link" accessibilityLabel={`Show: ${props.showTitle}`} hitSlop={{ top: 15, bottom: 15, left: 4, right: 12 }} className="self-start max-w-full">
      <Type step="caption" className="text-hotText font-semibold" style={{ fontSize: EPISODE.headShow }} numberOfLines={1}>{`${props.showTitle} ›`}</Type>
    </Pressable>
  ) : <Type step="caption" className="text-hotText font-semibold" style={{ fontSize: EPISODE.headShow }} numberOfLines={1}>{props.showTitle}</Type>;
  return (
    <>
      <Box testID="more-head" className="flex-row items-center gap-row">
        <Artwork url={props.imageUrl} size={panel === undefined ? EPISODE.headCover : EPISODE.headCoverSmall} name={props.showTitle} />
        <Box className="flex-1">
          {show}
          <Type step="lede" className="text-text" style={{ fontSize: EPISODE.headTitle, lineHeight: EPISODE.headTitleLine }} numberOfLines={2} accessibilityRole="header">{props.title}</Type>
        </Box>
      </Box>
      {panel === 'moment' ? (
        <MomentPanel episodeId={props.episodeId} atMs={props.atMs} heat={props.heat} durationMs={props.durationMs} onCancel={() => setPanel(undefined)} onSaved={() => setPanel(undefined)} />
      ) : panel === 'playlist' ? (
        <PlaylistPanel episodeId={props.episodeId} onClose={() => setPanel(undefined)} />
      ) : (
        <>
          <PulseTileGrid>
            <PulseTile icon="list-outline" label="Play next" onPress={() => add('front')} />
            <PulseTile icon="add" label="Add to queue" onPress={() => add('end')} onLongPress={() => add('front', true)} longPressLabel="Add to the front" />
            <DownloadTiles
              episodeId={props.episodeId}
              beside={
                <PulseTile
                  icon={fav ? 'star' : 'star-outline'}
                  label={fav ? 'Remove from favourites' : 'Add to favourites'}
                  on={fav}
                  selected={fav}
                  onPress={() => { toggleFavourite(stores.settings, props.episodeId, Date.now()); bump((n) => n + 1); }}
                />
              }
            />
            <PulseTile icon="pin" label="Save this moment" detail={mmss(props.atMs)} accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} onPress={() => setPanel('moment')} />
            <PulseTile icon="list" label="Add to playlist" onPress={openPlaylists} />
            {props.trailing}
          </PulseTileGrid>
          {props.rows}
        </>
      )}
      {panel === 'moment' ? null : <PulseButton label="Cancel" kind="quiet" hotWords onPress={props.onClose} full />}
    </>
  );
}

/** Spacing the sheet's scroll view uses between the head, the tiles and the pill. */
export const SHEET_GAP = bars.sheetGap;
