// The episode's transcript full screen: follows the audio, tap a line to jump, long-press to share or report it.
/**
 * M21 US2 (spec story 2, scenario 5): ⤢ on the player's transcript lines opens this page. The
 * transcript comes from the phone's cache (src/feeds/fetch-extras), the same copy the player
 * shows. When this episode is the one playing, the current line is marked and followed, and a tap
 * seeks; "Back to now" appears after the listener scrolls away. Our own header (no native chrome).
 */
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import type { TranscriptLine } from '@socialmorning/player-core';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { PageHeader } from '@/ui/kit/PageHeader';
import { usePlayer, usePlayerState } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { readExtras } from '@/feeds/fetch-extras';
import { TranscriptPane } from '@/ui/player/TranscriptPane';
import { TranscriptReportSheet } from '@/ui/player/TranscriptExtras';

export default function TranscriptScreen(): React.ReactElement {
  const { episodeId } = useLocalSearchParams<{ episodeId: string }>();
  const stores = useStores();
  const player = usePlayer();
  const state = usePlayerState();
  const [reporting, setReporting] = useState<TranscriptLine | undefined>();
  const episode = stores.feeds.getEpisode(episodeId);
  const transcript = readExtras(stores.extras, episodeId)?.transcript;
  const here = state.kind !== 'idle' && state.episodeId === episodeId;
  const positionMs = state.kind === 'idle' || !here ? 0 : state.kind === 'ended' ? (state.durationMs ?? 0) : (state.positionMs ?? 0);
  const durationMs = state.kind !== 'idle' && here && 'durationMs' in state ? (state.durationMs ?? episode?.durationMs) : episode?.durationMs;
  return (
    <Box className="flex-1 bg-background">
      <PageHeader title="Transcript" {...(episode?.title ? { subtitle: episode.title } : {})} />
      <Box className="flex-1 px-screen-x pt-2 pb-section">
        {transcript ? (
          <TranscriptPane
            transcript={transcript}
            positionMs={positionMs}
            onSeek={(ms) => { if (here) player.seek(ms); }}
            onReport={setReporting}
            fill
            {...(durationMs !== undefined ? { durationMs } : {})}
          />
        ) : (
          <Text className="text-body text-muted text-center mt-section">This episode has no transcript on this phone yet. Open it in the player first.</Text>
        )}
      </Box>
      <TranscriptReportSheet episodeId={episodeId} line={reporting} onClose={() => setReporting(undefined)} />
    </Box>
  );
}
