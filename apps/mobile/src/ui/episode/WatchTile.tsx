// "Download to Watch" in the episode ⋯ sheet: sends the episode to the paired Apple Watch.
/**
 * M21 US12 (FR-105). Shown only when a paired Watch has the SocialNet app and the episode has an
 * http(s) audio address (`showDownloadToWatch`, spec US12 scenario 1); otherwise an empty half-row,
 * so the sheet's grid keeps its shape. A tap queues {id, title, show, url, artwork, position} for
 * the Watch (`modules/watch-link`, WatchConnectivity transferUserInfo); the Watch downloads from
 * the publisher's address itself and refuses when it has no room (targets/watch/Downloader.swift).
 * Everything on the Watch is NOT VERIFIED until quickstart B19.
 */
import { useState } from 'react';
import { Box } from '@/ui/lib/box';
import { useColours } from '@/ui/kit/useColours';
import { SheetTile } from '@/ui/queue/QueueButtons';
import { useStores, useToast } from '@/ui/shell/providers';
import { showDownloadToWatch, toWatchEpisode } from '@/sync/watch';
import { sendEpisode, watchState } from '../../../modules/watch-link';

export function WatchTile(props: { episodeId: string; onSent: () => void }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const c = useColours(stores.settings);
  // Asked once per opening of the sheet: pairing does not change while it is open.
  const [state] = useState(() => watchState());
  const episode = stores.feeds.getEpisode(props.episodeId);
  if (episode === undefined || !showDownloadToWatch(state, episode.enclosureUrl)) return <Box className="flex-1" />;
  const send = () => {
    const sent = sendEpisode(toWatchEpisode(episode, stores.feeds.getShow(episode.feedUrl)?.title, stores.positions.get(episode.id)));
    toast(sent ? 'Sent to your Watch. It downloads there.' : "Couldn't reach your Watch. Open SocialNet on it and try again.");
    props.onSent();
  };
  return <SheetTile icon="watch-outline" label="Download to Watch" iconColour={c.accent} onPress={send} />;
}
