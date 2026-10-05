// Shares lines picked from the transcript as a picture made by the server, or as a short video.
/**
 * M20 US1 (spec FR-001): the picked lines become the server's quote card (the clip card's
 * layout with the words large), downloaded here and handed to the share sheet as a file, with
 * a link that opens the episode at the first line. No audio is shared or stored.
 */
import { useCallback } from 'react';
import { Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { useM12Api } from '@/social/m12-api';
import { useToast } from '@/ui/shell/providers';
import type { Quote } from '@/graph/quote';
import type { PlayableEpisode } from '@/playback/store';
import { useClipVideoMaker } from '@/ui/clips/ShareChooser';
import * as ClipVideo from '../../../modules/clip-video';

/** Called before any early return; the episode is passed at share time. */
export function useQuoteShare(): (episode: { id: string; title: string } | undefined, q: Quote) => Promise<void> {
  const m12 = useM12Api();
  const toast = useToast();
  return useCallback(async (episode: { id: string; title: string } | undefined, q: Quote) => {
    if (!episode || q.tooLong || q.text.length === 0) return;
    // The card takes a few seconds to draw (phone walk 2026-09-30); say it is coming.
    toast('Making the picture…');
    try {
      const target = new File(Paths.cache, `quote-${episode.id}-${Date.now()}.png`);
      const file = await File.downloadFileAsync(m12.shareQuoteUrl(episode.id, q.text, q.startMs), target);
      const link = m12.episodePageUrl(episode.id, q.startMs);
      await Share.share({ url: file.uri, message: `${episode.title}\n${link}` });
    } catch {
      toast("Couldn't make the picture — try again when you're online.");
    }
  }, [m12, toast]);
}

/**
 * M20 US1 (FR-002): the picked range as a video, the lines as captions — the M19 clip video with
 * `captions`. `undefined` in a build without the video module, so the pane shows no button.
 */
export function useQuoteVideo(): ((episode: PlayableEpisode | undefined, q: Quote) => void) | undefined {
  const make = useClipVideoMaker();
  if (!ClipVideo.isAvailable()) return undefined;
  return (episode, q) => {
    if (!episode || !q.video || q.startMs === undefined || q.endMs === undefined) return;
    void make({ startMs: q.startMs, endMs: q.endMs }, episode, q.captions);
  };
}
