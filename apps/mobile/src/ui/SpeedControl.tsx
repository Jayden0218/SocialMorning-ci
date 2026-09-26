/** Playback speed (US3, FR-012/013): −0.1 / +0.1, presets, "set as default". Episode time stays episode time (FR-014). */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { usePlayer, usePlayerState } from '../playback/store';
import { useToast } from './providers';

const PRESETS = [1, 1.2, 1.5, 2];

export function SpeedControl(): React.ReactElement {
  const player = usePlayer();
  usePlayerState(); // re-render on runtime notifications
  const toast = useToast();
  const [, force] = useState(0);
  const rate = player.rate();
  const set = (r: number) => { player.setRate(r); force((n) => n + 1); };
  return (
    <View className="w-full gap-1 mt-2">
      <View className="flex-row items-center gap-2.5 flex-wrap">
        <Pressable onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Text className="text-[22px] px-2 text-text">−</Text></Pressable>
        <Text className="text-sm font-bold min-w-12 text-center text-text">{rate.toFixed(1)}×</Text>
        <Pressable onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Text className="text-[22px] px-2 text-text">+</Text></Pressable>
        {PRESETS.map((p) => (
          <Pressable key={p} onPress={() => set(p)} accessibilityRole="button">
            <Text className={`border rounded-pill px-2.5 py-[3px] text-text ${Math.abs(rate - p) < 0.01 ? 'bg-accent border-accent' : 'border-separator'}`}>{p}×</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={() => { player.setDefaultRate(rate); toast(`${rate.toFixed(1)}× is now the default for new shows`); }} accessibilityRole="button">
        <Text className="text-accent text-[13px]">Set {rate.toFixed(1)}× as default (this show remembers its own)</Text>
      </Pressable>
    </View>
  );
}

