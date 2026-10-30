// Sleep timer choices (5–90 min), End of episode, time left, Cancel — in three layouts.
/**
 * Sleep timer (US3, FR-015..017), M21 US1:
 * - 8 tiles in 2 rows of 4: 5–60 min and 90 (FR-002). The tile in force is lit and announced as
 *   selected (FR-003).
 * - End of episode is a switch, so it can sit beside a minutes timer; the first to fire wins.
 * - The head says what is armed ("Pausing in m:ss", "Stops when this episode ends") with Cancel.
 *   The last 10 s fade to silence (FR-005).
 *
 * M24 US19 (`PlaybackSheet-B`): three layouts of the same controls, the same handlers:
 * - `full` (the moon button's sheet): as above.
 * - `sheet` (the short Playback sheet, B): 5 10 15 30 / 45 60 + an "End of episode" tile two
 *   columns wide. The tile turns End of episode on and off — the same `setSleepEndOfEpisode` as
 *   the switch, so it still sits beside a minutes timer.
 * - `more` (More settings): what B's grid leaves out — 90 min, and the note on the 10 s fade.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { isTimerOff, type SleepMinutes } from '@socialmorning/player-core';
import { usePlayer } from '@/playback/store';
import { mmss } from '@/ui/kit/format';
import { Toggle } from '@/ui/kit/Toggle';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
const ROWS: SleepMinutes[][] = [[5, 10, 15, 30], [45, 60, 90]];
/** B's grid in the Playback sheet: no 90 (it is in More settings), End of episode as a tile. */
const SHEET_ROWS: SleepMinutes[][] = [[5, 10, 15, 30], [45, 60]];
const ONE = { ...TAP, flex: 1 };
const TWO = { ...TAP, flex: 2 };

/** Re-renders every second while mounted, for the countdown. */
export function useSecondTick(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

const tileClass = (on: boolean) => `items-center justify-center rounded-row border ${on ? 'bg-primary border-primary' : 'bg-surface border-border'}`;
const tileText = (on: boolean) => (on ? 'text-meta font-bold text-onPrimary' : 'text-meta font-semibold text-text');

/** One minutes tile. */
function MinutesTile(props: { m: SleepMinutes; on: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      style={ONE}
      className={tileClass(props.on)}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`Sleep in ${props.m} minutes`}
      accessibilityState={{ selected: props.on }}
    >
      <Text className={tileText(props.on)}>{`${props.m} min`}</Text>
    </Pressable>
  );
}

export function SleepTimerControl(props: { variant?: 'full' | 'sheet' | 'more' }): React.ReactElement {
  const player = usePlayer();
  useSecondTick();
  const variant = props.variant ?? 'full';
  const timer = player.sleepTimer();
  const remaining = player.sleepRemainingMs();
  const head = remaining !== undefined
    ? `Pausing in ${mmss(remaining)}${timer.endOfEpisode ? ', or at the end of this episode' : ''}`
    : timer.endOfEpisode ? 'Stops when this episode ends' : undefined;

  if (variant === 'more') {
    return (
      <Box className="w-full gap-gap">
        <Text className="text-sm font-bold text-text" accessibilityRole="header">Sleep, longer</Text>
        <Box className="flex-row gap-1.5">
          <MinutesTile m={90} on={timer.minutes === 90} onPress={() => player.setSleepTimer(90)} />
          <Box style={{ flex: 3 }} />
        </Box>
        <Text className="text-xs text-muted">When a sleep timer ends, the sound fades out over the last 10 seconds.</Text>
      </Box>
    );
  }

  const rows = variant === 'sheet' ? SHEET_ROWS : ROWS;
  return (
    <Box className="w-full gap-gap">
      <Box className="flex-row items-center justify-between gap-gap">
        <Text className="text-sm font-bold text-text" accessibilityRole="header">Sleep</Text>
        {head !== undefined ? (
          <Box className="flex-row items-center gap-2.5 flex-shrink">
            <Text className="text-meta text-muted flex-shrink" numberOfLines={variant === 'sheet' ? 1 : undefined}>{head}</Text>
            <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button" accessibilityLabel="Cancel the sleep timer"><Text className="text-accent text-meta font-bold">Cancel</Text></Pressable>
          </Box>
        ) : null}
      </Box>
      {rows.map((row, r) => (
        <Box key={r} className="flex-row gap-1.5">
          {row.map((m) => <MinutesTile key={m} m={m} on={timer.minutes === m} onPress={() => player.setSleepTimer(m)} />)}
          {/* B: End of episode is the second row's last tile, two columns wide. */}
          {variant === 'sheet' && r === rows.length - 1 ? (
            <Pressable
              style={TWO}
              className={tileClass(timer.endOfEpisode)}
              onPress={() => player.setSleepEndOfEpisode(!timer.endOfEpisode)}
              accessibilityRole="button"
              accessibilityLabel="Stop at the end of this episode"
              accessibilityState={{ selected: timer.endOfEpisode }}
            >
              <Text className={tileText(timer.endOfEpisode)}>End of episode</Text>
            </Pressable>
          ) : null}
          {/* The full layout's second row has 3 tiles; an empty cell keeps the columns aligned with the first. */}
          {variant === 'full' && row.length < 4 ? <Box style={{ flex: 1 }} /> : null}
        </Box>
      ))}
      {variant === 'full' ? (
        <>
          <Box className="flex-row items-center gap-section" style={{ minHeight: TAP.minHeight }}>
            <Box className="flex-1">
              <Text className="text-body font-bold text-text">End of episode</Text>
              <Text className="text-xs text-muted">Stops when this episode ends, even with Loop on</Text>
            </Box>
            <Toggle value={timer.endOfEpisode} onChange={(v) => player.setSleepEndOfEpisode(v)} label="Stop at the end of this episode" />
          </Box>
          {!isTimerOff(timer) ? <Text className="text-xs text-muted">The sound fades out over the last 10 seconds.</Text> : null}
        </>
      ) : null}
    </Box>
  );
}
