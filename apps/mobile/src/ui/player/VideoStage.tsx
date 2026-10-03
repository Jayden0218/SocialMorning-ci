/**
 * M10b US5 — the picture for a video episode, where the artwork would be. Muted: the sound
 * comes from the audio engine as for every episode, so the lock screen, position saving,
 * comments and the heat curve are exactly as before. See `src/playback/video/sync.ts`.
 *
 * Cost, stated plainly: the publisher's file is fetched by both engines while it plays.
 *
 * M17 T043 (`Player-B`): it sits beside the title now, so no top margin, and the large-artwork
 * corners (22 pt) like the picture it replaces.
 */
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { Box } from '@/ui/lib/box';
import { followAudio } from '@/playback/video/sync';

export function VideoStage(props: { url: string; positionMs: number; playing: boolean; size: number }): React.ReactElement {
  const player = useVideoPlayer(props.url, (p) => { p.muted = true; });
  useEffect(() => {
    const cmd = followAudio({ positionMs: props.positionMs, playing: props.playing }, { currentTimeS: player.currentTime, playing: player.playing });
    if (cmd.seekToS !== undefined) player.currentTime = cmd.seekToS;
    if (cmd.play === true) player.play();
    if (cmd.play === false) player.pause();
  }, [player, props.positionMs, props.playing]);
  const box = { width: props.size, height: props.size };
  return (
    <Box className="rounded-artwork-lg overflow-hidden bg-surface" style={box} accessible accessibilityLabel="Video">
      <VideoView player={player} style={box} contentFit="contain" nativeControls={false} />
    </Box>
  );
}
