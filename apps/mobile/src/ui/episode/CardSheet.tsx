// The episode-row sheet for a Discover / search / chart card: finds the episode, then opens the sheet.
/**
 * M21 T060 (FR-035): rows built from server cards (search results, chart rows) carry no local
 * episode yet. `openCardSheet(card)` asks the page's one `<CardSheetHost />` to resolve it (the
 * same `resolveCard` the episode page uses for related cards) and open the shared EpisodeRowSheet.
 * The rows can sit deep in other components, so the request travels through a module-level
 * listener instead of props.
 */
import { useEffect, useState } from 'react';
import { EpisodeRowSheet, type RowSheetEpisode } from '@/ui/kit/EpisodeRowSheet';
import { resolveCard } from '@/discover/open';
import { refreshShow } from '@/feeds/fetch';
import type { EpisodeCard } from '@/social/api';
import { useStores, useToast } from '@/ui/shell/providers';

type Listener = (card: EpisodeCard) => void;
const listeners = new Set<Listener>();

/** Open the row sheet for a card on the page that mounted a CardSheetHost. */
export function openCardSheet(card: EpisodeCard): void {
  for (const l of listeners) l(card);
}

/** Mount once per page that shows cards with a ⋯. */
export function CardSheetHost(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const [episode, setEpisode] = useState<RowSheetEpisode | undefined>();
  useEffect(() => {
    const l: Listener = (card) => {
      void (async () => {
        const r = await resolveCard({ stores, refreshShow: (u) => refreshShow(u, stores.feeds, Date.now()) }, card);
        if (r.episodeId === undefined) { toast(r.reason === 'offline' ? "Couldn't fetch that show right now." : 'That episode is no longer in its feed.'); return; }
        setEpisode({ id: r.episodeId, title: card.title, feedUrl: card.feedUrl, showTitle: card.showTitle, imageUrl: card.imageUrl });
      })();
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [stores, toast]);
  return <EpisodeRowSheet episode={episode} onClose={() => setEpisode(undefined)} />;
}
