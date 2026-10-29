// Loads an episode's chapters and transcript once, from the phone's copy first, then the feed.
/**
 * M2 (US5, research R5), moved out of the player page by M31 T024 (review D7): chapters + transcript,
 * fetched once per episode and cached (`episode_extras`). The cached copy is read at once; the feed's
 * is fetched only when the episode declares chapters or a transcript. Never blocks playback.
 */
import { useEffect, useState } from 'react';
import { useStores } from '@/ui/shell/providers';
import { fetchExtras, readExtras, type Extras } from '@/feeds/fetch-extras';

export function useEpisodeExtras(episodeId: string | undefined): Extras | undefined {
  const stores = useStores();
  const [extras, setExtras] = useState<Extras | undefined>();
  useEffect(() => {
    setExtras(episodeId ? readExtras(stores.extras, episodeId) : undefined);
    const ep = episodeId ? stores.feeds.getEpisode(episodeId) : undefined;
    if (!ep || (!ep.chaptersUrl && ep.transcripts.length === 0)) return;
    let live = true;
    void fetchExtras({ fetch, store: stores.extras, now: () => Date.now() }, ep).then((x) => { if (live) setExtras(x); });
    return () => { live = false; };
  }, [episodeId, stores]);
  return extras;
}
