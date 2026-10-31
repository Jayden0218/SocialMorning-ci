// The transcript sheet: the lines hang from a time spine and follow the audio; tap a time to seek.
/**
 * M31 T024 (design-pulse2 `player--transcript-pane`, "Layout: Thread"): More → Transcript opens this
 * sheet — the kit `Sheet` (an overlay, so the iOS share sheet opens over it) at half height, dragging
 * to nearly full. That drag is the new way to "show two lines / the whole transcript here" (the old
 * page's two-line peek is gone: design action map). Title "Transcript" (Unbounded 20) with a close
 * circle; the pane (`TranscriptPane`): each line a timestamp chip on a spine, the live one solid hot
 * and larger; "Back to now" appears once you scroll away; a long-press on a line offers Share lines /
 * Report a mistake. Under it: the hint, and the square icon that opens the transcript FULL SCREEN
 * (`/transcript/[episodeId]`, where Translation lives).
 *
 * Sharing a picked line closes the sheet first; the iOS share sheet opens a moment later.
 */
import { router } from 'expo-router';
import type { TranscriptLine } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { motion } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Sheet } from '@/ui/kit/Sheet';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { toPlayable } from '@/storage/playable';
import type { Extras } from '@/feeds/fetch-extras';
import type { CachedEpisode } from '@/storage/types';
import { sameClock, selectClock, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { useQuoteShare, useQuoteVideo } from './QuoteShare';
import { TranscriptPane } from './TranscriptPane';

/**
 * iPhone walk 2026-10-06 (B1 failed): iOS would not open the share sheet over an open modal. The sheet is
 * our own view, not a modal, and is gone at once — the share still waits a moment for it to close.
 */
export const SHEET_CLOSE_MS = motion.tap;
const SNAPS: readonly number[] = [0.5, 0.92];

function Body(props: { episodeId: string; episode: CachedEpisode | undefined; transcript: NonNullable<Extras['transcript']>; onClose: () => void; onReport: (line: TranscriptLine) => void }): React.ReactElement {
  const player = usePlayer();
  const stores = useStores();
  const c = useColours();
  const clock = usePlayerSelector(selectClock, sameClock);
  const shareQuote = useQuoteShare();
  const shareQuoteVideo = useQuoteVideo();
  const { episode } = props;
  return (
    <Box className="flex-1 px-screen-x gap-gap">
      <Box className="flex-1">
        <TranscriptPane
          fill
          transcript={props.transcript}
          positionMs={clock.positionMs}
          durationMs={clock.durationMs}
          onSeek={(ms) => player.seek(ms)}
          onReport={(l) => { props.onClose(); props.onReport(l); }}
          onShareImage={(q) => { props.onClose(); setTimeout(() => { void shareQuote(episode, q); }, SHEET_CLOSE_MS); }}
          onShareVideo={shareQuoteVideo ? (q) => { props.onClose(); setTimeout(() => shareQuoteVideo(episode ? toPlayable(stores, episode.id) : undefined, q), SHEET_CLOSE_MS); } : undefined}
        />
      </Box>
      <Box className="flex-row items-center gap-row" style={{ paddingBottom: 12 }}>
        <Type step="caption" className="text-text3 flex-1">Long-press to share or report this line</Type>
        <Pressable onPress={() => router.push({ pathname: '/transcript/[episodeId]', params: { episodeId: props.episodeId } })} accessibilityRole="button" accessibilityLabel="Open the transcript full screen" className="items-center justify-center rounded-pill bg-raise" style={{ width: 44, height: 44 }}>
          <Icon name="expand-outline" size={18} color={c.text} />
        </Pressable>
      </Box>
    </Box>
  );
}

export function TranscriptSheet(props: {
  open: boolean;
  onClose: () => void;
  episodeId: string;
  episode: CachedEpisode | undefined;
  extras: Extras | undefined;
  onReport: (line: TranscriptLine) => void;
}): React.ReactElement | null {
  const c = useColours();
  const transcript = props.extras?.transcript;
  return (
    <Sheet
      open={props.open && transcript !== undefined}
      onClose={props.onClose}
      label="Transcript"
      snapPoints={SNAPS}
      header={
        <Box className="flex-row items-center justify-between px-screen-x" style={{ paddingBottom: 12 }}>
          <Type step="heading" className="text-text flex-1" accessibilityRole="header">Transcript</Type>
          <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close the transcript" hitSlop={4} className="items-center justify-center rounded-pill bg-raise" style={{ width: 36, height: 36 }}>
            <Icon name="close" size={18} color={c.text} />
          </Pressable>
        </Box>
      }
    >
      {transcript ? <Body episodeId={props.episodeId} episode={props.episode} transcript={transcript} onClose={props.onClose} onReport={props.onReport} /> : null}
    </Sheet>
  );
}
