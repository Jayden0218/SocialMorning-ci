/** "Add to queue" / "Play next" (US2, FR-008/011), through player-core's enqueue. */
import { Box } from './lib/box';
import { SheetRow } from './SheetRow';
import { useColours } from './useColours';
import { queueEpisode } from '../settings/queue';
import { useDownloads, useStores, useToast } from './providers';

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
  // M12 FR-032: full-width rows in the ⋯ sheet (were 32 pt pills).
  return (
    <Box>
      <SheetRow icon="play-skip-forward-outline" label="Play next" iconColour={c.text} onPress={() => add('front')} />
      <SheetRow icon="list-outline" label="Add to queue" iconColour={c.text} onPress={() => add('end')} />
    </Box>
  );
}
