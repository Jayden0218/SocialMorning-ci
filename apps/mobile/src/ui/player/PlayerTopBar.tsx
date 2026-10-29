// The player's top row: close, the next-hot-moment pill, and More.
/**
 * M31 T024 (design-pulse2 `player--screen`): a 44 raise circle to close (a chevron down), a glass pill
 * in the middle counting down to the next hot moment (tap to jump there), and a 44 raise circle for
 * More (the sheet with Favourite, About, Transcript, Chapters, Clip, Share). The old bar's star,
 * scissors, share and audio-output buttons moved: the star, About, Clip and Share into the More
 * sheet and the tray, the audio output into the Playback sheet's More settings (action map).
 *
 * Round 2: the row sits where the drawing puts it (58 from the top, 20 each side — the page places it), the pill is
 * 32 tall with 12 of padding, raise2 at 70 % over a blur and no outline (`player` tokens), the flame and the words 6 apart.
 *
 * The pill re-renders once a second (the clock rounded down), never per TICK. It is absent when the
 * episode has no hot moment left, or no heat yet. A drag down anywhere on this row closes the page
 * (`useSwipeDownToClose`, M21 US2) — the handlers are spread by the caller on the wrapper.
 */
import { Box } from '@/ui/lib/box';
import { useWindowDimensions } from 'react-native';
import { bars, spacing } from '@/design';
import { Pressable } from '@/ui/lib/pressable';
import { BlurView } from 'expo-blur';
import { IconButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { sameClock, selectClock, usePlayer, usePlayerSelector } from '@/playback/store';
import { useSocial } from '@/social/context';
import { hotMoments, hotPillText, nextHot } from './hot';
import { PLAYER } from './measures';

const LOOK = { height: PLAYER.pill, borderRadius: PLAYER.pill / 2, backgroundColor: PLAYER.pillFill, paddingHorizontal: PLAYER.pillPad, justifyContent: 'center' as const, overflow: 'hidden' as const };
const FILL = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };
/** The drawing's pill text is 12 on a 16.8 line; the face needs 16 at least. */
const LINE = { lineHeight: PLAYER.pillLine };

function HotPill(props: { episodeId: string }): React.ReactElement | null {
  const { width } = useWindowDimensions();
  // F10 (fontscale2 F1): never wider than the room between the two 44 circles (the page's side, the circle and an 8 gap each side).
  const look = { ...LOOK, maxWidth: width - 2 * (PLAYER.side + bars.circle + spacing.gap) };
  const player = usePlayer();
  const { useEpisodeSocial } = useSocial();
  const { cached } = useEpisodeSocial(props.episodeId);
  const clock = usePlayerSelector(selectClock, sameClock);
  const heat = cached?.social.heat;
  const axis = cached?.social.episode.durationMs ?? clock.durationMs;
  const moments = hotMoments(heat?.available ? heat.buckets : undefined, axis);
  const text = hotPillText(moments, clock.positionMs, mmss);
  if (text === undefined) return null;
  const next = nextHot(moments, clock.positionMs);
  const body = (
    <>
      <BlurView intensity={30} tint="dark" style={FILL} pointerEvents="none" />
      <Type step="mono" className="text-hotText" style={LINE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`🔥 ${text}`}</Type>
    </>
  );
  if (!next) return <Box testID="hot-pill" style={look} accessible accessibilityLabel={text}>{body}</Box>;
  return (
    <Pressable testID="hot-pill" onPress={() => player.seek(next.fromMs)} accessibilityRole="button" accessibilityLabel={`${text}. Jump to it.`} hitSlop={8} style={look}>
      {body}
    </Pressable>
  );
}

export function PlayerTopBar(props: { episodeId: string | undefined; onClose: () => void; onMore: (() => void) | undefined }): React.ReactElement {
  return (
    <Box testID="player-top" className="flex-row items-center justify-between" style={{ minHeight: bars.circle }}>
      <IconButton icon="chevron-down" label="Close the player" onPress={props.onClose} fill />
      <Box className="flex-1 items-center px-gap">{props.episodeId ? <HotPill episodeId={props.episodeId} /> : null}</Box>
      {props.onMore ? <IconButton icon="ellipsis-horizontal" label="More" onPress={props.onMore} fill /> : <Box style={{ width: bars.circle, height: bars.circle }} />}
    </Box>
  );
}
