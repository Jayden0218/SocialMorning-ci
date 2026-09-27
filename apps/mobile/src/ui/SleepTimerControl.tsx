/** Sleep timer (US3, FR-015..017): the fixed choices, the remaining time while it runs, cancel. */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
    <View className="w-full gap-1 mt-2">
      <View className="flex-row items-center gap-2 flex-wrap">
        <Text className="font-semibold text-text">Sleep</Text>
        {CHOICES.map((c) => (
          <Pressable key={String(c)} onPress={() => player.setSleepTimer(c)} accessibilityRole="button">
            <Text className={`border rounded-pill px-2.5 py-[3px] text-text text-[13px] ${(c === 'endOfEpisode' ? timer.kind === 'endOfEpisode' : false) ? 'bg-selected border-accent' : 'border-separator'}`}>{c === 'endOfEpisode' ? 'End of episode' : `${c} min`}</Text>
          </Pressable>
        ))}
      </View>
      {timer.kind === 'minutes' && remaining !== undefined ? (
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-text">Pausing in {mmss(remaining)}</Text>
          <Pressable onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-[13px]">Cancel</Text></Pressable>
        </View>
      ) : timer.kind === 'endOfEpisode' ? (
        <View className="flex-row items-center gap-2 flex-wrap">
          <Text className="text-text">Stops when this episode ends</Text>
          <Pressable onPress={() => player.setSleepTimer('off')} accessibilityRole="button"><Text className="text-accent text-[13px]">Cancel</Text></Pressable>
        </View>
      ) : null}
    </View>
  );
}

