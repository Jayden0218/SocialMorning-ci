// "Download to Watch" in the episode ⋯ sheet: sends the episode to the paired Apple Watch.
/**
 * M21 US12 (FR-105). Shown only when a paired Watch has the SocialNet app and the episode has an
 * http(s) audio address (`showDownloadToWatch`, spec US12 scenario 1); otherwise nothing, so the sheet's last row is
 * one tile. A tap queues {id, title, show, url, artwork, position} for
 * the Watch (`modules/watch-link`, WatchConnectivity transferUserInfo); the Watch downloads from
 * the publisher's address itself and refuses when it has no room (targets/watch/Downloader.swift).
 * Everything on the Watch is NOT VERIFIED until quickstart B19.
 *
 * M31 W3-A (T040): the kit `PulseTile` (clock glyph, as the drawing's "Download to Watch").
 */
import { useState } from 'react';
import { PulseTile } from '@/ui/kit/PulseTile';
import { useStores, useToast } from '@/ui/shell/providers';
import { showDownloadToWatch, toWatchEpisode } from '@/sync/watch';
import { sendEpisode, watchState } from '../../../modules/watch-link';

export function WatchTile(props: { episodeId: string; onSent: () => void }): React.ReactElement | null {
  const stores = useStores();
  const toast = useToast();
  // Asked once per opening of the sheet: pairing does not change while it is open.
  const [state] = useState(() => watchState());
  const episode = stores.feeds.getEpisode(props.episodeId);
  if (episode === undefined || !showDownloadToWatch(state, episode.enclosureUrl)) return null;
  const send = () => {
    const sent = sendEpisode(toWatchEpisode(episode, stores.feeds.getShow(episode.feedUrl)?.title, stores.positions.get(episode.id)));
    toast(sent ? 'Sent to your Watch. It downloads there.' : "Couldn't reach your Watch. Open SocialNet on it and try again.");
    props.onSent();
  };
  return <PulseTile icon="time-outline" label="Download to Watch" accessibilityLabel="Download to Watch" onPress={send} />;
}
