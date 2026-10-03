/**
 * Sleep timer (US3, FR-015..017): the fixed choices, the remaining time while it runs, cancel.
 *
 * M17 T102 (`PlaybackSheet-B`): a "Sleep" head with the running state ("Pausing in …" or "Stops
 * when this episode ends") and its Cancel on the right; the choices are white tiles in a
 * 4-column grid (End of episode spans two). Same choices, names, Cancels and handlers as before.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import type { SleepChoice } from '@socialmorning/player-core';
import { usePlayer } from '@/playback/store';
import { mmss } from '@/ui/kit/format';

const CHOICES: SleepChoice[] = [5, 10, 15, 30, 45, 60, 'endOfEpisode'];
/** B's grid: four across, End of episode two columns wide. React Native has no CSS grid, so rows of flex tiles. */
const ROWS: SleepChoice[][] = [CHOICES.slice(0, 4), CHOICES.slice(4)];
const ONE = { ...TAP, flex: 1 };
const TWO = { ...TAP, flex: 2 };

export function SleepTimerControl(): React.ReactElement {
  const player = usePlayer();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const timer = player.sleepTimer();
  const remaining = player.sleepRemainingMs();
  return (
    <Box className="w-full gap-gap">
      <Box className="flex-row items-center justify-between gap-gap">
        <Text className="text-sm font-bold text-text" accessibilityRole="header">Sleep</Text>
        {timer.kind === 'minutes' && remaining !== undefined ? (
          <Box className="flex-row items-center gap-2.5">
            <Text className="text-meta text-muted">Pausing in {mmss(remaining)}</Text>
            <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-meta font-semibold">Cancel</Text></Pressable>
          </Box>
        ) : timer.kind === 'endOfEpisode' ? (
          <Box className="flex-row items-center gap-2.5 flex-shrink">
            <Text className="text-meta text-muted flex-shrink">Stops when this episode ends</Text>
            <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-meta font-semibold">Cancel</Text></Pressable>
          </Box>
        ) : null}
      </Box>
      {ROWS.map((row, r) => (
        <Box key={r} className="flex-row gap-1.5">
          {row.map((c) => (
            <Pressable style={c === 'endOfEpisode' ? TWO : ONE} className={`items-center justify-center rounded-row border ${c === 'endOfEpisode' && timer.kind === 'endOfEpisode' ? 'bg-primary border-primary' : 'bg-surface border-border'}`} key={String(c)} onPress={() => player.setSleepTimer(c)} accessibilityRole="button">
              <Text className={c === 'endOfEpisode' && timer.kind === 'endOfEpisode' ? 'text-meta font-bold text-onPrimary' : 'text-meta font-semibold text-text'}>{c === 'endOfEpisode' ? 'End of episode' : `${c} min`}</Text>
            </Pressable>
          ))}
        </Box>
      ))}
    </Box>
  );
}
