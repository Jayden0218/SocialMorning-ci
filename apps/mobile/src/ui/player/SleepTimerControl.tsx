// Sleep timer choices (5–90 min), the End-of-episode switch, time left, Cancel.
/**
 * Sleep timer (US3, FR-015..017), M21 US1:
 * - 8 tiles in 2 rows of 4: 5–60 min and 90 (FR-002). The tile in force is lit and announced as
 *   selected (FR-003).
 * - End of episode is a switch, so it can sit beside a minutes timer; the first to fire wins.
 * - The head says what is armed ("Pausing in m:ss", "Stops when this episode ends") with Cancel.
 *   The last 10 s fade to silence (FR-005).
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
const ONE = { ...TAP, flex: 1 };

/** Re-renders every second while mounted, for the countdown. */
export function useSecondTick(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

export function SleepTimerControl(): React.ReactElement {
  const player = usePlayer();
  useSecondTick();
  const timer = player.sleepTimer();
  const remaining = player.sleepRemainingMs();
  const head = remaining !== undefined
    ? `Pausing in ${mmss(remaining)}${timer.endOfEpisode ? ', or at the end of this episode' : ''}`
    : timer.endOfEpisode ? 'Stops when this episode ends' : undefined;
  return (
    <Box className="w-full gap-gap">
      <Box className="flex-row items-center justify-between gap-gap">
        <Text className="text-sm font-bold text-text" accessibilityRole="header">Sleep</Text>
        {head !== undefined ? (
          <Box className="flex-row items-center gap-2.5 flex-shrink">
            <Text className="text-meta text-muted flex-shrink">{head}</Text>
            <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button" accessibilityLabel="Cancel the sleep timer"><Text className="text-accent text-meta font-bold">Cancel</Text></Pressable>
          </Box>
        ) : null}
      </Box>
      {ROWS.map((row, r) => (
        <Box key={r} className="flex-row gap-1.5">
          {row.map((m) => {
            const on = timer.minutes === m;
            return (
              <Pressable
                style={ONE}
                className={`items-center justify-center rounded-row border ${on ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
                key={m}
                onPress={() => player.setSleepTimer(m)}
                accessibilityRole="button"
                accessibilityLabel={`Sleep in ${m} minutes`}
                accessibilityState={{ selected: on }}
              >
                <Text className={on ? 'text-meta font-bold text-onPrimary' : 'text-meta font-semibold text-text'}>{`${m} min`}</Text>
              </Pressable>
            );
          })}
          {/* The second row has 3 tiles; an empty cell keeps the columns aligned with the first. */}
          {row.length < 4 ? <Box style={{ flex: 1 }} /> : null}
        </Box>
      ))}
      <Box className="flex-row items-center gap-section" style={{ minHeight: TAP.minHeight }}>
        <Box className="flex-1">
          <Text className="text-body font-bold text-text">End of episode</Text>
          <Text className="text-xs text-muted">Stops when this episode ends, even with Loop on</Text>
        </Box>
        <Toggle value={timer.endOfEpisode} onChange={(v) => player.setSleepEndOfEpisode(v)} label="Stop at the end of this episode" />
      </Box>
      {!isTimerOff(timer) ? <Text className="text-xs text-muted">The sound fades out over the last 10 seconds.</Text> : null}
    </Box>
  );
}
