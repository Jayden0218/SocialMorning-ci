// Play speed: − big number +, quick choices and the default link; the slider and "This show only" in More settings.
/**
 * Playback speed (US3, FR-012/013): −0.1 / +0.1, presets. Episode time stays episode time (FR-014).
 *
 * M17 T102 (`PlaybackSheet-B`): the rate is the big serif number, the presets sit in one pill
 * track (the chosen one yellow).
 *
 * M21 US2 (spec story 2, scenarios 2–3), after 小宇宙's player settings:
 *   - a slider 0.5–3.0 in 0.1 steps — our own views and React Native's responder system, no native
 *     slider; to a screen reader it is one `adjustable` "Speed" with ±0.1;
 *   - "This show only" (a switch). On: the speed is this show's own (`speed_prefs`). Off: the
 *     speed is the default for every show, and this show's own is cleared, so its next episode —
 *     and any other show's — plays at the default (`clearShowRate` in player-core).
 *
 * M24 US19 (`PlaybackSheet-B`, the short sheet): `SpeedControl` is B's block — − · "1.2×" (48 pt
 * serif) · + on one row, the four presets, and the accent link "Set 1.2× as default (this show
 * remembers its own)", offered while this show plays at its own speed. The slider and the
 * "This show only" switch are `SpeedMore`, behind the sheet's "More settings" row. Nothing lost.
 *
 * The runtime is not changed (src/playback/store.ts keeps its 100 % branches): `setRate` saves the
 * rate for the show playing, so with the switch off that row is cleared again at once.
 */
import { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { clampRate, fractionOfRate, rateAtFraction, RATE_MAX, RATE_MIN, RATE_STEP } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { hit, tabular } from '@/design';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { usePlayer, usePlayerState } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { Toggle } from '@/ui/kit/Toggle';

/** M12 FR-043: every speed and sleep target is 48 pt (the chips were ~24 pt). */
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** B's round − and + are 52 pt. */
const ROUND = { width: 52, height: 52 };
/** The slider's thumb: 24 pt, centred on the value. */
const THUMB = 24;

const PRESETS = [1, 1.2, 1.5, 2];

/** The rate, and the two ways to change it, shared by the sheet's block and More settings. */
function useSpeed() {
  const player = usePlayer();
  const state = usePlayerState(); // re-render on runtime notifications
  const stores = useStores();
  const [, force] = useState(0);
  const rate = player.rate();
  const episodeId = state.kind === 'idle' ? undefined : state.episodeId;
  const feedUrl = episodeId === undefined ? undefined : stores.feeds.getEpisode(episodeId)?.feedUrl;
  /** This show plays at its own speed (a `speed_prefs` row), not the app-wide default. */
  const showOnly = feedUrl !== undefined && stores.speed.get(feedUrl) !== undefined;
  const set = (r: number) => {
    const next = clampRate(r);
    if (showOnly) player.setRate(next);
    else {
      // The default for every show: the runtime saves it for this show too, so clear that row.
      player.setDefaultRate(next);
      player.setRate(next);
      if (feedUrl !== undefined) stores.speed.clear(feedUrl);
    }
    force((n) => n + 1);
  };
  const setShowOnly = (on: boolean) => {
    if (feedUrl === undefined) return;
    if (on) stores.speed.set(feedUrl, rate);
    else {
      player.setRate(player.defaultRate());
      stores.speed.clear(feedUrl);
    }
    force((n) => n + 1);
  };
  /** B's link: this rate becomes every show's default; the show playing keeps its own row. */
  const makeDefault = () => { player.setDefaultRate(rate); force((n) => n + 1); };
  return { player, rate, feedUrl, showOnly, set, setShowOnly, makeDefault };
}

/** The track, the filled part and the thumb, and the touch that moves them. */
function SpeedSlider(props: { rate: number; onChange: (rate: number) => void }): React.ReactElement {
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | undefined>();
  const shown = drag ?? props.rate;
  const at = (e: GestureResponderEvent): number => rateAtFraction(width === 0 ? 0 : e.nativeEvent.locationX / width);
  const f = fractionOfRate(shown);
  return (
    <Box
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Speed"
      accessibilityValue={{ min: RATE_MIN * 10, max: RATE_MAX * 10, now: Math.round(shown * 10), text: `${shown.toFixed(1)}×` }}
      accessibilityActions={[{ name: 'increment', label: 'Faster' }, { name: 'decrement', label: 'Slower' }]}
      onAccessibilityAction={(e) => props.onChange(props.rate + (e.nativeEvent.actionName === 'increment' ? RATE_STEP : -RATE_STEP))}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => width > 0}
      onMoveShouldSetResponder={() => width > 0}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => setDrag(at(e))}
      onResponderMove={(e) => setDrag(at(e))}
      onResponderRelease={(e) => { const r = at(e); setDrag(undefined); props.onChange(r); }}
      onResponderTerminate={() => setDrag(undefined)}
      className="flex-1 justify-center"
      style={{ minHeight: hit.min }}
    >
      <Box pointerEvents="none" className="h-1.5 rounded-pill bg-border overflow-hidden">
        <Box className="h-full rounded-pill bg-accent" style={{ width: `${f * 100}%` }} />
      </Box>
      <Box pointerEvents="none" className="absolute rounded-pill bg-primary border border-border" style={{ width: THUMB, height: THUMB, left: f * width - THUMB / 2 }} />
    </Box>
  );
}

/** The Playback sheet's speed block (B): − · big number · +, the presets, the default link. */
export function SpeedControl(): React.ReactElement {
  const { player, rate, showOnly, set, makeDefault } = useSpeed();
  const isDefault = Math.abs(rate - player.defaultRate()) < 0.01;
  return (
    <Box className="w-full gap-row">
      <Box className="flex-row items-center justify-between">
        <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-surface border border-border" onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Text className="text-lg text-text">−</Text></Pressable>
        <Text className="text-[48px] leading-[62px] font-display text-text" style={tabular} accessibilityLabel={`Speed ${rate.toFixed(1)}×`}>{`${rate.toFixed(1)}×`}</Text>
        <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-surface border border-border" onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Text className="text-lg text-text">+</Text></Pressable>
      </Box>
      <Box className="flex-row gap-1 p-1 rounded-[16px] bg-track">
        {PRESETS.map((p) => (
          <Pressable style={TAP} className={`flex-1 items-center justify-center rounded-[12px] ${Math.abs(rate - p) < 0.01 ? 'bg-primary' : ''}`} key={p} onPress={() => set(p)} accessibilityRole="button" accessibilityLabel={`${p}×`} accessibilityState={{ selected: Math.abs(rate - p) < 0.01 }}>
            <Text className={Math.abs(rate - p) < 0.01 ? 'text-body font-extrabold text-onPrimary' : 'text-body font-semibold text-text'}>{p}×</Text>
          </Pressable>
        ))}
      </Box>
      {showOnly && !isDefault ? (
        <Pressable style={TAP} className="items-center justify-center" onPress={makeDefault} accessibilityRole="button" accessibilityLabel={`Set ${rate.toFixed(1)}× as default (this show remembers its own)`}>
          <Text className="text-meta font-semibold text-accent text-center">{`Set ${rate.toFixed(1)}× as default (this show remembers its own)`}</Text>
        </Pressable>
      ) : (
        <Text className="text-meta text-muted text-center">{showOnly ? `${rate.toFixed(1)}× is also the default for other shows` : `${rate.toFixed(1)}× for every show · keep one for this show in More settings`}</Text>
      )}
    </Box>
  );
}

/** More settings: the fine slider and the "This show only" switch (M21 US2, unchanged). */
export function SpeedMore(): React.ReactElement {
  const { player, rate, feedUrl, showOnly, set, setShowOnly } = useSpeed();
  return (
    <Box className="w-full gap-gap">
      <Box className="flex-row items-baseline justify-between">
        <Text className="text-sm font-bold text-text" accessibilityRole="header">Speed, finer</Text>
        <Text className="text-title font-display text-text" style={tabular}>{`${rate.toFixed(1)}×`}</Text>
      </Box>
      <SpeedSlider rate={rate} onChange={set} />
      {feedUrl !== undefined ? (
        <Box className="flex-row items-center gap-section" style={{ minHeight: TAP.minHeight }}>
          <Box className="flex-1">
            <Text className="text-body font-bold text-text">This show only</Text>
            <Text className="text-xs text-muted">{showOnly ? `Other shows play at ${player.defaultRate().toFixed(1)}×` : 'Off: this speed is the default for every show'}</Text>
          </Box>
          <Toggle value={showOnly} onChange={setShowOnly} label="This show only" />
        </Box>
      ) : null}
    </Box>
  );
}
