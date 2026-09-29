/** Playback speed (US3, FR-012/013): −0.1 / +0.1, presets, "set as default". Episode time stays episode time (FR-014). */
import { useState } from 'react';
import { Pressable } from './lib/pressable';
import { hit } from '../design';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
import { Text } from './lib/text';
import { Box } from './lib/box';
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
    <Box className="w-full gap-1 mt-2">
      <Box className="flex-row items-center gap-2.5 flex-wrap">
        <Pressable style={TAP} className="justify-center" onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Text className="text-[22px] px-2 text-text">−</Text></Pressable>
        <Text className="text-sm font-bold min-w-12 text-center text-text">{rate.toFixed(1)}×</Text>
        <Pressable style={TAP} className="justify-center" onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Text className="text-[22px] px-2 text-text">+</Text></Pressable>
        {PRESETS.map((p) => (
          <Pressable style={TAP} className="justify-center" key={p} onPress={() => set(p)} accessibilityRole="button" accessibilityLabel={`${p}×`} accessibilityState={{ selected: Math.abs(rate - p) < 0.01 }}>
            <Text className={`border rounded-pill px-3 py-1.5 ${Math.abs(rate - p) < 0.01 ? 'bg-primary border-primary text-onPrimary' : 'border-separator text-text'}`}>{p}×</Text>
          </Pressable>
        ))}
      </Box>
      <Pressable style={TAP} className="justify-center" onPress={() => { player.setDefaultRate(rate); toast(`${rate.toFixed(1)}× is now the default for new shows`); }} accessibilityRole="button">
        <Text className="text-accent text-[13px]">Set {rate.toFixed(1)}× as default (this show remembers its own)</Text>
      </Pressable>
    </Box>
  );
}

