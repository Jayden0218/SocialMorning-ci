// The player's lower block: the controls, or — at the end of an episode with something to offer — the "Next up" card.
/**
 * M31 T024 (design-pulse2 `player--episode-end-offer`): "the end offer card replaces the controls". The
 * offer is fetched while the episode plays (`useNextUp`, M5 FR-010) and shown at `ended` when the queue
 * is empty — never autoplayed (`endOffer`). With nothing to offer the controls stay, so the listener can
 * play it again. Play it loads the offered episode from the library, or opens its page and fetches
 * its show first (`useDiscover().open`).
 */
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { endOffer } from '@/discover/end-offer';
import { useDiscover } from '@/discover/useDiscover';
import { toPlayable } from '@/storage/playable';
import { sameHead, selectHead, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import type { NextUpItem } from '@/social/api';
import { EndOffer } from './EndOffer';
import { useNextUp } from './NextUp';
import { PLAYER, type PlayerLayout } from './measures';
import { TransportRow } from './TransportRow';

function OfferHost(props: { offer: NextUpItem }): React.ReactElement {
  const player = usePlayer();
  const stores = useStores();
  const { open: discoverOpen } = useDiscover();
  const { offer } = props;
  return (
    <EndOffer
      item={offer}
      onPlay={() => {
        const local = toPlayable(stores, offer.episode.id);
        if (local) { player.load(local, 'play'); return; }
        void discoverOpen(offer.episode);
      }}
    />
  );
}

/**
 * Round 2: the block places itself — the controls 124 from the bottom and 20 in from each side; the end offer
 * 116 from the bottom and 16 in (the drawing's `player--episode-end-offer`). `swipe` is the page's swipe-up
 * handlers (M21 FR-020), spread on it.
 */
export function PlayerBottom(props: { onOpenPlayback: () => void; layout: Pick<PlayerLayout, 'controlsBottom' | 'offerBottom'>; swipe?: object }): React.ReactElement {
  const stores = useStores();
  const head = usePlayerSelector(selectHead, sameHead);
  const nextUp = useNextUp(head.episodeId);
  const offer = endOffer(head, stores.queue.list(), nextUp.items, head.episodeId);
  const side = offer ? spacing.section : PLAYER.side;
  return (
    <Box {...props.swipe} testID={offer ? 'player-offer' : 'player-bottom'} className="absolute" style={{ left: side, right: side, bottom: offer ? props.layout.offerBottom : props.layout.controlsBottom }}>
      {offer ? <OfferHost offer={offer} /> : <TransportRow onOpenPlayback={props.onOpenPlayback} />}
    </Box>
  );
}
