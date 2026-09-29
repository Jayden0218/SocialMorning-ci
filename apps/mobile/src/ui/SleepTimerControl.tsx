/** Sleep timer (US3, FR-015..017): the fixed choices, the remaining time while it runs, cancel. */
import { useEffect, useState } from 'react';
import { Pressable } from './lib/pressable';
import { hit } from '../design';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
import { Text } from './lib/text';
import { Box } from './lib/box';
import type { SleepChoice } from '@socialmorning/player-core';
import { usePlayer } from '../playback/store';
import { mmss } from './format';

const CHOICES: SleepChoice[] = [5, 10, 15, 30, 45, 60, 'endOfEpisode'];

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
    <Box className="w-full gap-1 mt-2">
      <Box className="flex-row items-center gap-2 flex-wrap">
        <Text className="font-semibold text-text">Sleep</Text>
        {CHOICES.map((c) => (
          <Pressable style={TAP} className="justify-center" key={String(c)} onPress={() => player.setSleepTimer(c)} accessibilityRole="button">
            <Text className={`border rounded-pill px-3 py-1.5 ${(c === 'endOfEpisode' ? timer.kind === 'endOfEpisode' : false) ? 'text-[13px] bg-primary border-primary text-onPrimary' : 'text-[13px] border-separator text-text'}`}>{c === 'endOfEpisode' ? 'End of episode' : `${c} min`}</Text>
          </Pressable>
        ))}
      </Box>
      {timer.kind === 'minutes' && remaining !== undefined ? (
        <Box className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-text">Pausing in {mmss(remaining)}</Text>
          <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-[13px]">Cancel</Text></Pressable>
        </Box>
      ) : timer.kind === 'endOfEpisode' ? (
        <Box className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-text">Stops when this episode ends</Text>
          <Pressable style={TAP} className="justify-center" onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-[13px]">Cancel</Text></Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

