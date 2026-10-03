/**
 * Playback speed (US3, FR-012/013): −0.1 / +0.1, presets, "set as default". Episode time stays episode time (FR-014).
 *
 * M17 T102 (`PlaybackSheet-B`): the rate is the big serif number between a round − and +, the
 * presets sit in one pill track (the chosen one yellow), and "Set … as default" is a centred
 * accent line under it. Same buttons, names and handlers as before; only the layout moved.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { hit } from '@/design';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** B's round − and + are 52 pt. */
const ROUND = { width: 52, height: 52 };
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { usePlayer, usePlayerState } from '@/playback/store';
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
    <Box className="w-full gap-gap">
      <Box className="flex-row items-center justify-between">
        <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-surface border border-border" onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Text className="text-lg text-text">−</Text></Pressable>
        <Text className="text-[48px] leading-[52px] font-display text-text">{rate.toFixed(1)}×</Text>
        <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-surface border border-border" onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Text className="text-lg text-text">+</Text></Pressable>
      </Box>
      <Box className="flex-row gap-1 p-1 mt-1 rounded-pill bg-background border border-border">
        {PRESETS.map((p) => (
          <Pressable style={TAP} className={`flex-1 items-center justify-center rounded-pill ${Math.abs(rate - p) < 0.01 ? 'bg-primary' : ''}`} key={p} onPress={() => set(p)} accessibilityRole="button" accessibilityLabel={`${p}×`} accessibilityState={{ selected: Math.abs(rate - p) < 0.01 }}>
            <Text className={Math.abs(rate - p) < 0.01 ? 'text-body font-bold text-onPrimary' : 'text-body font-semibold text-text'}>{p}×</Text>
          </Pressable>
        ))}
      </Box>
      <Pressable style={TAP} className="items-center justify-center" onPress={() => { player.setDefaultRate(rate); toast(`${rate.toFixed(1)}× is now the default for new shows`); }} accessibilityRole="button">
        <Text className="text-accent text-meta font-semibold text-center">Set {rate.toFixed(1)}× as default (this show remembers its own)</Text>
      </Pressable>
    </Box>
  );
}
