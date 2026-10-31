// The Episode page's ··· sheet: the episode, then a mosaic of tiles — queue, download, favourite, moment, playlist, report.
/**
 * M31 W3-A (T040; design-pulse2 `episode--more-sheet`, layout Mosaic): the sheet is the kit `ActionSheet` around `EpisodeSheetBody` (the
 * head, the tiles in the drawn order — Play next · Add to queue / Download · Add to favourites / Save this moment · Add to playlist /
 * Report episode · Download to Watch (only with a paired Watch; else the half is empty) — their second pages and Cancel). The sheet scrolls,
 * so Cancel is never cut off when a page opens below. Report episode closes the sheet and opens the report sheet.
 */
import { useWindowDimensions } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { PulseTile } from '@/ui/kit/PulseTile';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { EpisodeSheetBody, SHEET_GAP } from './EpisodeSheetBody';
import { WatchTile } from './WatchTile';

/** The sheet's tallest: the scroll view keeps Cancel reachable. */
const MAX = 0.8;

export function EpisodeMoreSheet(props: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  episode: CachedEpisode;
  show: CachedShow | undefined;
  /** Where the listener is in this episode (the loaded one, else the saved one). */
  atMs: number;
  heat: readonly number[];
  durationMs: number | undefined;
  onQueued: () => void;
  onReport: () => void;
}): React.ReactElement {
  const screen = useWindowDimensions();
  return (
    <ActionSheet open={props.open} onClose={props.onClose} label="More: play next, download, save a moment">
      <ScrollView style={{ maxHeight: screen.height * MAX }} contentContainerStyle={{ gap: SHEET_GAP }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" testID="episode-more-scroll">
        <EpisodeSheetBody
          episodeId={props.episodeId}
          title={props.episode.title}
          imageUrl={props.episode.imageUrl ?? props.show?.imageUrl}
          showTitle={props.show?.title}
          atMs={props.atMs}
          heat={props.heat}
          durationMs={props.durationMs}
          onQueued={props.onQueued}
          onClose={props.onClose}
          trailing={
            <>
              <PulseTile icon="flag-outline" label="Report episode" onPress={() => { props.onClose(); props.onReport(); }} />
              <WatchTile episodeId={props.episodeId} onSent={props.onClose} />
            </>
          }
        />
      </ScrollView>
    </ActionSheet>
  );
}
