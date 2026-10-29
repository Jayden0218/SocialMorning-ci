// The player with nothing loaded (or a failure with no episode): an empty ring, one sentence, and two shortcuts.
/**
 * M31 T024 (design-pulse2 `player--nothing-playing`): the same Ring, empty — a 2 px line ring, the centre a
 * raise disc with a 56 headphones icon in the line colour; no knob, no pins, no tray. The words are
 * today's "Nothing is playing yet." in Unbounded 26 with one line of help under it. Round 2: the ring is at 118, the words end
 * 150 from the bottom (12 apart), the pills 40 from the bottom (10 apart), all 20 in — the page's layout, as drawn;
 * the headphones are the drawing's #3A3A44. At the foot, in the
 * thumb zone, two pills: "Discover" and "Queue" — shortcuts to places that already exist, not new
 * features. Close stays top left (the page draws it).
 *
 * A failure that has no episode (`error` without an `episodeId`) reuses this page: the message
 * replaces the sentence and the foot is "Try again" (`player.play()`), as the old error page.
 */
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { Arc } from './arc';
import { PLAYER, type PlayerLayout } from './measures';

export function NothingPlaying(props: { message?: string; layout: PlayerLayout; onTryAgain?: () => void }): React.ReactElement {
  const c = useColours();
  const { ring } = props.layout;
  const d = ring - Math.round((PLAYER.emptyRingInset * ring) / PLAYER.ring) * 2;
  const pill = 'flex-1 items-center justify-center rounded-pill';
  return (
    <>
      <Box testID="player-ring" className="absolute self-center" style={{ top: props.layout.ringTop, width: ring, height: ring }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Arc size={ring} fraction={0} width={PLAYER.emptyStroke} track={c.line} />
        <Box className="absolute bg-raise items-center justify-center rounded-pill" style={{ left: (ring - d) / 2, top: (ring - d) / 2, width: d, height: d }}>
          <Icon name="headset-outline" size={PLAYER.emptyIcon} color={PLAYER.emptyInk} />
        </Box>
      </Box>
      <Box testID="player-empty-text" className="absolute items-start" style={{ left: PLAYER.side, right: PLAYER.side, bottom: props.layout.emptyTextBottom, gap: PLAYER.titleRowGap }}>
        <Type step="hero" className="text-text" style={{ fontSize: PLAYER.emptyTitle, lineHeight: PLAYER.emptyTitleLine }} accessibilityRole="header">{props.message ?? 'Nothing is playing yet.'}</Type>
        <Type step="note" className="text-text2">{props.message ? 'Try again, or pick another episode.' : 'Pick an episode and the ring fills with what listeners felt.'}</Type>
      </Box>
      <Box testID="player-empty-pills" className="absolute flex-row" style={{ left: PLAYER.side, right: PLAYER.side, bottom: props.layout.emptyPillsBottom, gap: PLAYER.emptyPillGap }}>
        {props.onTryAgain ? (
          <Pressable className={`${pill} bg-text`} style={{ height: hit.min }} accessibilityRole="button" accessibilityLabel="Try again" onPress={props.onTryAgain}>
            <Type step="row" className="text-void">Try again</Type>
          </Pressable>
        ) : null}
        <Pressable className={`${pill} ${props.onTryAgain ? 'bg-raise' : 'bg-text'}`} style={{ height: hit.min }} accessibilityRole="button" accessibilityLabel="Discover" onPress={() => router.navigate('/')}>
          <Type step="row" className={props.onTryAgain ? 'text-text' : 'text-void'}>Discover</Type>
        </Pressable>
        <Pressable className={`${pill} bg-raise`} style={{ height: hit.min }} accessibilityRole="button" accessibilityLabel="Queue" onPress={() => router.push('/queue')}>
          <Type step="row" className="text-text">Queue</Type>
        </Pressable>
      </Box>
    </>
  );
}
