// Sleep timer: six small rings or a clock, End of episode, time left, Cancel — in three layouts.
/**
 * Sleep timer (US3, FR-015..017), M21 US1: minutes 5–90, End of episode, what is armed ("Pausing in
 * m:ss", "Stops when this episode ends") with Cancel. The last 10 s fade to silence (FR-005).
 *
 * Round 2: the Playback sheet's sleep line reads as drawn — "pausing in 24:12 · Cancel", lower case, the dot between, "Cancel" bold hot-text on
 * the same line — and the captions are the drawing's `.cap` (Geist Mono 11, 0.08 em; `Cap`), not Unbounded; the notes are 12; blocks 14 apart.
 *
 * M31 T024 (design-pulse2 `player--playback-sheet`, `player--playback-more-settings`,
 * `player--sleep-timer-sheet`): three layouts of the same controls, the same handlers and names:
 * - `sheet` (the Playback sheet): the head ("Sleep" + what is armed + Cancel), SIX small rings —
 *   5 10 15 30 45 60, each a 46 ring filled to its share of an hour, the chosen one hot — then an
 *   "End of episode" chip and the fade note.
 * - `more` (More settings): "Sleep, longer" — a 90 ring and End of episode as a switch, and the note.
 * - `full` (the moon's sheet): a 270 clock — six 52 circles round a 6 track, the chosen one hot, the
 *   track filling hot → violet as time runs out — with the time left in the middle ("24:12 / pausing
 *   in") and Cancel under it; off, it reads "Off" and "Tap a time". End of episode is a 44 chip.
 * The chosen one is announced as selected (FR-003); never hue alone — the filled circle and the words say it.
 */
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { bars, colour, hit } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { Toggle } from '@/ui/kit/Toggle';
import { mmss } from '@/ui/kit/format';
import { useColours } from '@/ui/kit/useColours';
import { isTimerOff, type SleepMinutes } from '@socialmorning/player-core';
import { usePlayer } from '@/playback/store';
import { Arc } from './arc';
import { Cap } from './Cap';
import { CLOCK_MINUTES, clockPoint, elapsedShare } from './dial-math';
import { PLAYER } from './measures';
import { useSleep } from './useRuntime';

const RING = PLAYER.sleepRing;
const DOT = 52;
const CLOCK = 270;

/** One minutes choice: a ring (the Playback sheet), a circle on the clock, or the 90 ring. */
function MinutesTile(props: { m: SleepMinutes; on: boolean; shape: 'ring' | 'dot'; onPress: () => void }): React.ReactElement {
  const c = useColours();
  if (props.shape === 'dot') {
    return (
      <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Sleep in ${props.m} minutes`} accessibilityState={{ selected: props.on }} className={`items-center justify-center rounded-pill border ${props.on ? 'bg-hot border-hot' : 'bg-raise border-line'}`} style={{ width: DOT, height: DOT }}>
        <Type step="mono" className={props.on ? 'text-void' : 'text-text'} style={{ fontSize: String(props.m).length > 2 ? PLAYER.sleepDotSmall : PLAYER.sleepDot }}>{String(props.m)}</Type>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" accessibilityLabel={`Sleep in ${props.m} minutes`} accessibilityState={{ selected: props.on }} hitSlop={(hit.min - RING) / 2} className="items-center justify-center" style={{ width: RING, height: RING }}>
      <Box style={{ width: RING, height: RING }}>
        <Arc size={RING} fraction={props.m / 60} width={PLAYER.sleepStroke} gradientId={`sleep${props.m}`} hot={c.hot} {...(props.on ? {} : { tint: colour.barIdle })} />
        <Box className="absolute inset-0 items-center justify-center">
          <Type step="mono" className={props.on ? 'text-hotText' : 'text-text'} style={{ fontSize: PLAYER.sleepRingText }}>{String(props.m)}</Type>
        </Box>
      </Box>
    </Pressable>
  );
}

/** The sleep line's words, as drawn: "pausing in 24:12", or what an End-of-episode timer says. Lower case; undefined when nothing is armed. */
export function sleepHead(remainingMs: number | undefined, endOfEpisode: boolean): string | undefined {
  if (remainingMs !== undefined) return `pausing in ${mmss(remainingMs)}${endOfEpisode ? ', or at the end of this episode' : ''}`;
  return endOfEpisode ? 'stops when this episode ends' : undefined;
}

/** The gap before "Cancel" is a real space the line cannot swallow: a trailing plain space at the end of a Text is dropped on the web, which drew "24:12 ·Cancel". */
export const NBSP = '\u00A0';

/** "Cancel" is one drawn line of 12; the finger gets 48 high. */
const CANCEL_SLOP = { top: 18, bottom: 18, left: 6, right: 6 };

export function SleepTimerControl(props: { variant?: 'full' | 'sheet' | 'more' }): React.ReactElement {
  const player = usePlayer();
  const c = useColours();
  const { timer, remainingMs: remaining } = useSleep();
  const variant = props.variant ?? 'full';
  const off = isTimerOff(timer);
  const head = sleepHead(remaining, timer.endOfEpisode);
  const cancel = (
    <Pressable hitSlop={CANCEL_SLOP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button" accessibilityLabel="Cancel the sleep timer">
      <Type step="mono" className="text-hotText font-bold" style={{ fontSize: PLAYER.sleepHead, lineHeight: PLAYER.sleepHeadLine }}>Cancel</Type>
    </Pressable>
  );
  const fade = <Type step="caption" className="text-text3" style={{ fontSize: PLAYER.note, lineHeight: PLAYER.noteLine }}>The sound fades out over the last 10 seconds.</Type>;

  if (variant === 'more') {
    return (
      <Box testID="sleep-longer" className="w-full bg-raise" style={{ gap: PLAYER.panelGap, padding: PLAYER.panelPad, borderRadius: PLAYER.panelRadius }}>
        <Type step="compact" className="text-text" accessibilityRole="header">Sleep, longer</Type>
        <Box className="flex-row items-center" style={{ gap: PLAYER.panelGap }}>
          <MinutesTile m={90} on={timer.minutes === 90} shape="ring" onPress={() => player.setSleepTimer(90)} />
          <Box className="flex-1">
            <Type step="compact" className="text-text">End of episode</Type>
            <Type step="caption" className="text-text2" style={{ fontSize: PLAYER.panelDetail, lineHeight: PLAYER.panelDetailLine }}>Stops when this episode ends, even with Loop on</Type>
          </Box>
          <Toggle value={timer.endOfEpisode} onChange={(v) => player.setSleepEndOfEpisode(v)} label="Stop at the end of this episode" />
        </Box>
        <Type step="caption" className="text-text3" style={{ fontSize: PLAYER.note, lineHeight: PLAYER.noteLine }}>When a sleep timer ends, the sound fades out over the last 10 seconds.</Type>
      </Box>
    );
  }

  if (variant === 'sheet') {
    return (
      <Box testID="sleep-block" className="w-full" style={{ gap: bars.sheetGap }}>
        <Box className="flex-row items-center justify-between gap-gap">
          <Cap accessibilityRole="header">Sleep</Cap>
          {head !== undefined ? (
            <Box className="flex-row items-center flex-shrink">
              <Type step="mono" className="text-text2 flex-shrink" style={{ fontSize: PLAYER.sleepHead, lineHeight: PLAYER.sleepHeadLine }} numberOfLines={1}>{`${head} ·${NBSP}`}</Type>
              {cancel}
            </Box>
          ) : null}
        </Box>
        <Box className="flex-row justify-between">
          {CLOCK_MINUTES.map((m) => <MinutesTile key={m} m={m} on={timer.minutes === m} shape="ring" onPress={() => player.setSleepTimer(m)} />)}
        </Box>
        <EndChip height={PLAYER.chip} />
        {fade}
      </Box>
    );
  }

  // full: the clock.
  const share = timer.minutes !== undefined && remaining !== undefined ? elapsedShare(timer.minutes, remaining) : 0;
  return (
    <Box className="w-full items-center gap-row">
      <Box style={{ width: CLOCK, height: CLOCK }}>
        <Box className="absolute" style={{ left: DOT / 2, top: DOT / 2 }}>
          <Arc size={CLOCK - DOT} fraction={share} width={PLAYER.sleepTrack} gradientId="sleepClock" hot={c.hot} />
        </Box>
        {CLOCK_MINUTES.map((m, i) => {
          const p = clockPoint(i, CLOCK_MINUTES.length, CLOCK, DOT);
          return (
            <Box key={m} className="absolute" style={{ left: p.x - DOT / 2, top: p.y - DOT / 2 }}>
              <MinutesTile m={m} on={timer.minutes === m} shape="dot" onPress={() => player.setSleepTimer(m)} />
            </Box>
          );
        })}
        <Box className="absolute items-center justify-center gap-hair" style={{ left: DOT + 14, right: DOT + 14, top: DOT + 14, bottom: DOT + 14 }}>
          <Icon name="moon-outline" size={PLAYER.sleepMoon} color={c.hotText} />
          <Type step="heading" className="text-text font-extrabold" style={{ fontSize: PLAYER.sleepClockText, lineHeight: PLAYER.sleepClockLine }}>
            {remaining !== undefined ? mmss(remaining) : timer.endOfEpisode ? 'End' : 'Off'}
          </Type>
          <Cap>{remaining !== undefined ? 'pausing in' : timer.endOfEpisode ? 'at the end' : 'tap a time'}</Cap>
          {head !== undefined ? cancel : null}
        </Box>
      </Box>
      <EndChip height={hit.min} />
      {!off ? <Box className="items-center">{fade}</Box> : null}
    </Box>
  );
}

/** The "End of episode" chip: 44 on the clock, 36 under the rings; chosen → the light fill. It turns End of episode on and off — the same `setSleepEndOfEpisode` as the switch, so it still sits beside a minutes timer. */
function EndChip(props: { height: number }): React.ReactElement {
  const player = usePlayer();
  const c = useColours();
  const { timer } = useSleep();
  return (
    <Pressable
      style={{ height: props.height }}
      className={`flex-row items-center justify-center gap-hair rounded-pill border self-stretch ${timer.endOfEpisode ? 'bg-text border-text' : 'bg-raise border-line'}`}
      onPress={() => player.setSleepEndOfEpisode(!timer.endOfEpisode)}
      accessibilityRole="button"
      accessibilityLabel="Stop at the end of this episode"
      accessibilityState={{ selected: timer.endOfEpisode }}
      hitSlop={Math.max(0, Math.ceil((hit.min - props.height) / 2))}
    >
      <Icon name="moon-outline" size={PLAYER.sleepChipMoon} color={timer.endOfEpisode ? c.void : c.text} />
      <Type step="caption" className={timer.endOfEpisode ? 'text-void font-semibold' : 'text-text font-semibold'}>End of episode</Type>
    </Pressable>
  );
}
