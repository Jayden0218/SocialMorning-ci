// The player's controls: speed, skip back 15, play or pause, skip forward 30, and the sleep moon.
/**
 * Round 2 (owner: "completely same"): the glyphs are the drawing's bare circular arrows — no "15" / "30" printed on
 * them (the names still say it); each is 30 wide (48 to the finger, `hitSlop`) so the five items space out as drawn
 * (44 · 30 · 80 · 30 · 44, the free room shared between them); the row has no padding — the page puts it 20 in.
 *
 * M31 T024 (design-pulse2 `player--screen`): one row, 124 from the bottom — the rate in mono (opens the
 * Playback sheet), skip back 15 (30), play/pause (an 80 light disc — the fixed `play` token, whatever the accent theme — with a void glyph), skip forward 30,
 * and the moon (44; the time left in mono 11 under it while a timer runs). Same names as the old
 * page: "Skip back 15 seconds", "Pause" / "Play", "Skip forward 30 seconds",
 * "Speed 1.0×, sleep timer and chapters".
 *
 * Instead of the controls, in place:
 *   - on a failure, the play disc becomes "Try again" (a light pill, 48), same `player.play()`;
 *   - after a clip ends, "The clip ended." with "Keep listening" (a light pill) — the old banner;
 *   - at the end with an offer to make, the controls give way to the offer card (the page decides).
 *
 * This leaf reads the head of the state (kind), the rate and the sleep timer — never the position — so
 * it does not redraw per TICK. The clip-ended test reads the position through a selector that answers
 * a boolean.
 */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { hit, tabular } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { sameHead, selectHead, selectIsPlaying, usePlayer, usePlayerSelector } from '@/playback/store';
import { MoonButton } from './MoonButton';
import { PLAYER } from './measures';
import { useRate } from './useRuntime';

/** M4: "Keep listening" is offered while the position is within this of where the last clip ended. */
export const CLIP_END_NEAR_MS = 6_000;

/** A 30 glyph with a 48 tap area. */
const SKIP = { width: PLAYER.skip, height: PLAYER.skip };
const SKIP_SLOP = (hit.min - PLAYER.skip) / 2;
const SPEED = { height: PLAYER.moon, width: PLAYER.speedLabel };
const SPEED_SLOP = { top: 2, bottom: 2, left: 0, right: 4 };

export function TransportRow(props: { onOpenPlayback: () => void }): React.ReactElement {
  const player = usePlayer();
  const c = useColours();
  const head = usePlayerSelector(selectHead, sameHead);
  const isPlaying = usePlayerSelector(selectIsPlaying);
  const rate = useRate();
  // M4: remember where the last clip ended so "Keep listening" is offered right there.
  const clipNow = player.clip();
  const [lastClipEnd, setLastClipEnd] = useState<number | undefined>();
  useEffect(() => { if (clipNow) setLastClipEnd(clipNow.endMs); }, [clipNow]);
  const clipEnded = usePlayerSelector((s) => !player.clip() && s.kind === 'paused' && lastClipEnd !== undefined && Math.abs(s.positionMs - lastClipEnd) <= CLIP_END_NEAR_MS);

  if (clipEnded) {
    return (
      <Box testID="player-controls" className="flex-row items-center justify-between gap-row">
        <Type step="note" className="text-text2 flex-1">The clip ended.</Type>
        <Pressable className="rounded-pill bg-text items-center justify-center px-block" style={{ height: hit.min }} accessibilityRole="button" accessibilityLabel="Keep listening" onPress={() => { setLastClipEnd(undefined); player.play(); }}>
          <Type step="row" className="text-void">Keep listening</Type>
        </Pressable>
      </Box>
    );
  }
  return (
    <Box testID="player-controls" className="flex-row items-center justify-between">
      <Pressable onPress={props.onOpenPlayback} accessibilityRole="button" accessibilityLabel={`Speed ${rate.toFixed(1)}×, sleep timer and chapters`} hitSlop={SPEED_SLOP} className="justify-center" style={SPEED}>
        <Type step="mono" className="text-text" style={[tabular, { fontSize: PLAYER.speedText }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{`${rate.toFixed(1)}×`}</Type>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip back 15 seconds" onPress={() => player.skip(-15_000)} hitSlop={SKIP_SLOP} className="items-center justify-center" style={SKIP}>
        <Icon name="skip-back-15" size={PLAYER.skip} color={c.text} />
      </Pressable>
      {head.kind === 'error' ? (
        <Pressable className="rounded-pill bg-text items-center justify-center px-block" style={{ height: hit.min }} accessibilityRole="button" accessibilityLabel="Try again" onPress={() => player.play()}>
          <Type step="row" className="text-void">Try again</Type>
        </Pressable>
      ) : (
        <Pressable
          className="rounded-pill bg-play items-center justify-center"
          style={{ width: PLAYER.play, height: PLAYER.play }}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={() => (isPlaying ? player.pause() : player.play())}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={PLAYER.playGlyph} color={c.onPlay} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Skip forward 30 seconds" onPress={() => player.skip(30_000)} hitSlop={SKIP_SLOP} className="items-center justify-center" style={SKIP}>
        <Icon name="skip-forward-30" size={PLAYER.skip} color={c.text} />
      </Pressable>
      <MoonButton />
    </Box>
  );
}
