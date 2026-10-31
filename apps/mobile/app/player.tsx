// The full player: the reaction ring, the title, the controls and a tray; sheets for More, Playback, sleep and share.
/**
 * Now Playing: position and duration updating live (FR-008), play/pause (FR-005), −15 / +30 (FR-006),
 * a seek control (FR-007), and honest buffering and error states (FR-015).
 *
 * M31 T024 (constitution v4.0.0; design-pulse2 `index.html#player--screen` and `listen.html`): the page is the
 * Pulse "Ring" player. From the top: close · the next-hot-moment pill · More; the ring (the reaction curve
 * wrapped round the cover; drag to seek, avatar pins mark comments); the title block; the controls (speed,
 * back 15, play, forward 30, the sleep moon); the 60 tall tray (Comments, React, Clip, Playlist, Share).
 * Sheets: More (Clip, Share, Favourite, About, Transcript, Chapters — chapters and transcript MOVED here from
 * the Playback sheet, recorded in m31/moves.json), Transcript, Playback (speed dial, sleep rings, More
 * settings), and Share. Nothing playing, a failure and the end of an episode are states of this same page.
 *
 * The page itself is thin: `usePlayerScreen` (src/ui/player/usePlayerScreen.ts) decides the layout and the open
 * sheet from the HEAD of the player state, and every part that draws the position or the social data is its own
 * component under src/ui/player/ with its own selector — so a position TICK never re-renders this page
 * (review C4 and D7; the render-count test). The history of the old page (M7 → M24) is in the git log.
 *
 * Owner, 2026-10-06 (kept): the page paints to the bottom edge, so this page (alone) keeps the tray above the
 * home indicator itself — the root leaves its bottom strip to it (app/_layout.tsx, `edges: []` on /player).
 */
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box } from '@/ui/lib/box';
import { useLayout } from '@/ui/shell/useLayout';
import { usePlayer } from '@/playback/store';
import { useSwipeUpToOpen } from '@/ui/queue/QueueSheetHost';
import { RouteRow, VoiceBoostRow } from '@/ui/settings/AudioRows';
import { PlayerMoreSheet } from '@/ui/player/PlayerMoreSheet';
import { NothingPlaying } from '@/ui/player/NothingPlaying';
import { PlayerBackdrop } from '@/ui/player/PlayerBackdrop';
import { PlayerBottom } from '@/ui/player/PlayerBottom';
import { ClapHost, MomentHost, PollHost, ShareHost } from '@/ui/player/PlayerHosts';
import { PlayerRing } from '@/ui/player/PlayerRing';
import { PlayerTitleBlock } from '@/ui/player/PlayerTitleBlock';
import { PlayerTopBar } from '@/ui/player/PlayerTopBar';
import { PlayerTray } from '@/ui/player/PlayerTray';
import { SettingsPanel } from '@/ui/player/SettingsPanel';
import { TranscriptSheet } from '@/ui/player/TranscriptSheet';
import { TranscriptReportSheet } from '@/ui/player/TranscriptExtras';
import { PLAYER, playerLayout } from '@/ui/player/measures';
import { useClip } from '@/ui/player/useClipAndComments';
import { usePlayerScreen } from '@/ui/player/usePlayerScreen';

/** M22 T071: the player's column on a wide window. */
const WIDE_PANEL = { width: '100%', maxWidth: 640, alignSelf: 'center' } as const;
const FULL = { left: 0, right: 0 } as const;

export default function PlayerScreen(): React.ReactElement {
  const s = usePlayerScreen();
  const player = usePlayer();
  const swipeUp = useSwipeUpToOpen();
  const { wide } = useLayout();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const clip = useClip(s.episodeId);
  const { head, episodeId, episode, show } = s;
  const layout = playerLayout(window, insets);
  const column = wide ? WIDE_PANEL : FULL;

  // Nothing playing, or a failure with no episode: the empty ring and two shortcuts.
  if (episodeId === undefined) {
    return (
      <Box className="flex-1 bg-void">
        <PlayerBackdrop feedUrl={undefined} />
        <Box className="absolute top-0 bottom-0" style={column}>
          <Box testID="player-top-pos" {...s.swipeDown} className="absolute" style={{ top: layout.topBarTop, left: PLAYER.side, right: PLAYER.side }}><PlayerTopBar episodeId={undefined} onClose={s.close} onMore={undefined} /></Box>
          <NothingPlaying layout={layout} {...(head.message !== undefined ? { message: head.message, onTryAgain: () => player.play() } : {})} />
        </Box>
      </Box>
    );
  }

  return (
    <Box className="flex-1 bg-void">
      <PlayerBackdrop feedUrl={episode?.feedUrl} />
      <PollHost episodeId={episodeId} />
      {/* The page is the drawing's: every part sits where `playerLayout` puts it (src/ui/player/measures.ts). */}
      <Box testID="player-page" className="absolute top-0 bottom-0" style={column}>
        {/* M21: a drag down on the top area closes the player (src/ui/player/swipe-close.ts). */}
        <Box testID="player-top-pos" {...s.swipeDown} className="absolute" style={{ top: layout.topBarTop, left: PLAYER.side, right: PLAYER.side }}>
          <PlayerTopBar episodeId={episodeId} onClose={s.close} onMore={() => s.open('more')} />
        </Box>
        <Box testID="player-ring-pos" className="absolute items-center" style={{ top: layout.ringTop, left: 0, right: 0 }}>
          <PlayerRing episodeId={episodeId} episode={episode} show={show} size={layout.ring} onOpenMarker={s.setMarker} />
        </Box>
        <Box testID="player-title-pos" className="absolute" style={{ left: PLAYER.side, right: PLAYER.side, bottom: layout.titleBottom }}>
          <PlayerTitleBlock episodeId={episodeId} episode={episode} show={show} />
        </Box>
        {/* M21 FR-020: a swipe up on the controls and the tray opens the playlist sheet. */}
        <PlayerBottom onOpenPlayback={() => s.open('playback')} layout={layout} swipe={swipeUp} />
        <Box testID="player-tray-pos" {...swipeUp} className="absolute" style={{ left: PLAYER.traySide, right: PLAYER.traySide, bottom: layout.trayBottom }}>
          <PlayerTray episodeId={episodeId} onShare={() => s.open('share')} />
        </Box>
      </Box>

      <PlayerMoreSheet
        open={s.sheet === 'more'}
        onClose={s.closeSheet}
        episodeId={episodeId}
        episode={episode}
        show={show}
        extras={s.extras}
        onClip={() => { s.closeSheet(); clip(); }}
        onShare={() => s.open('share')}
        onTranscript={() => s.open('transcript')}
      />
      <TranscriptSheet open={s.sheet === 'transcript'} onClose={s.closeSheet} episodeId={episodeId} episode={episode} extras={s.extras} onReport={s.setReporting} />
      <SettingsPanel
        open={s.sheet === 'playback'}
        onClose={s.closeSheet}
        looping={s.looping}
        onLoop={s.setLoop}
        skipSilence={s.skipSilence}
        onSkipSilence={s.setSkipSilence}
        skipSilenceDisabled={s.effectsBlocked}
        routeSlot={<RouteRow />}
        voiceBoostSlot={<VoiceBoostRow />}
      />
      <TranscriptReportSheet episodeId={episodeId} line={s.reporting} onClose={() => s.setReporting(undefined)} />
      <MomentHost episodeId={episodeId} marker={s.marker} onClose={() => s.setMarker(undefined)} />
      <ShareHost open={s.sheet === 'share'} onClose={s.closeSheet} episodeId={episodeId} episode={episode} show={show} />
      <ClapHost />
    </Box>
  );
}
