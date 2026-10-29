// Play speed: the dial with − and +, quick choices and the default link; the fine bar and "This show only" in More settings.
/**
 * Playback speed (US3, FR-012/013): −0.1 / +0.1, presets. Episode time stays episode time (FR-014).
 *
 * M21 US2 (spec story 2, scenarios 2–3), after 小宇宙's player settings:
 *   - "This show only" (a switch). On: the speed is this show's own (`speed_prefs`). Off: the
 *     speed is the default for every show, and this show's own is cleared, so its next episode —
 *     and any other show's — plays at the default (`clearShowRate` in player-core).
 *
 * Round 2: the preset chips are the drawn 36 tall, two a row, 6 apart (mono 13, 600); the − and + glyphs are Geist 20; the hot
 * line shows whenever the rate is not the default (it had waited for a show-only rate as well); the blocks are 14 apart.
 *
 * M31 T024 (design-pulse2 `player--playback-sheet`, `player--playback-more-settings`): the sheet's
 * block is the DIAL (`SpeedDial`, 176) with the − and + circles (48) and the presets 1× 1.2× 1.5× 2×
 * as chips (the chosen one light) beside it, then the hot-text line "Set 1.2× as default (this show
 * remembers its own)" — or, when the rate is the default, the caption in text3. `SpeedMore` is the "Speed,
 * finer" tile: the rate in Unbounded 20 and a 26-bar slider (0.5–3.0, 0.1 steps; the kit `Curve` with
 * every bar the same height), then "This show only". To a screen reader the bar is one `adjustable`
 * "Speed" with ±0.1. Nothing lost.
 *
 * The runtime is not changed (src/playback/store.ts keeps its 100 % branches): `setRate` saves the
 * rate for the show playing, so with the switch off that row is cleared again at once.
 * M31: the episode comes from a selector, the rate from `useRate` — no re-render per TICK (review C4).
 */
import { useState } from 'react';
import { clampRate, fractionOfRate, RATE_MAX, RATE_MIN, RATE_STEP } from '@socialmorning/player-core';
import { Pressable } from '@/ui/lib/pressable';
import { bars, hit } from '@/design';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { Toggle } from '@/ui/kit/Toggle';
import { Curve } from '@/ui/kit/Curve';
import { selectEpisodeId, usePlayer, usePlayerSelector } from '@/playback/store';
import { useStores } from '@/ui/shell/providers';
import { DIAL_TICKS } from './dial-math';
import { PLAYER } from './measures';
import { SpeedDial } from './SpeedDial';
import { useRate } from './useRuntime';

/** M12 FR-043: every speed and sleep target is 48 pt. */
const TAP = { minHeight: hit.min, minWidth: hit.min };
/** The − and + circles are 48; their glyphs are the drawing's 20. */
const ROUND = { width: PLAYER.stepButton, height: PLAYER.stepButton };
/** The default link is one drawn line (13 / 17); the finger gets 48. */
const LINE_SLOP = { top: 15, bottom: 15, left: 0, right: 0 };
const STEP = { fontSize: PLAYER.stepGlyph, lineHeight: PLAYER.stepLine };
/** The preset chips are 36 tall and 6 apart; the finger gets 48. */
const CHIP = { height: PLAYER.chip };
const CHIP_SLOP = { top: (hit.min - PLAYER.chip) / 2, bottom: (hit.min - PLAYER.chip) / 2, left: 0, right: 0 };

const PRESETS = [1, 1.2, 1.5, 2];
const STEPS = Array.from({ length: DIAL_TICKS }, () => 1);

/** The rate, and the two ways to change it, shared by the sheet's block and More settings. */
function useSpeed() {
  const player = usePlayer();
  const episodeId = usePlayerSelector(selectEpisodeId);
  const rate = useRate();
  const stores = useStores();
  const [, force] = useState(0);
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

/** The 26-bar slider: one `adjustable` "Speed" to a screen reader, the bars drawn by `Curve`. */
function SpeedBars(props: { rate: number; onChange: (rate: number) => void }): React.ReactElement {
  const index = Math.round(fractionOfRate(props.rate) * (DIAL_TICKS - 1));
  return (
    <Box
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Speed"
      accessibilityValue={{ min: RATE_MIN * 10, max: RATE_MAX * 10, now: Math.round(props.rate * 10), text: `${props.rate.toFixed(1)}×` }}
      accessibilityActions={[{ name: 'increment', label: 'Faster' }, { name: 'decrement', label: 'Slower' }]}
      onAccessibilityAction={(e) => props.onChange(props.rate + (e.nativeEvent.actionName === 'increment' ? RATE_STEP : -RATE_STEP))}
      className="justify-center"
      style={{ minHeight: hit.min }}
    >
      <Curve data={STEPS} count={DIAL_TICKS} height={PLAYER.speedBar} min={PLAYER.speedBar} gap={PLAYER.speedBarGap} played={(index + 1) / DIAL_TICKS} onSeek={(f) => props.onChange(RATE_MIN + Math.round(f * (DIAL_TICKS - 1)) * RATE_STEP)} />
    </Box>
  );
}

/** The Playback sheet's speed block: the dial, − and +, the presets, the default link. */
export function SpeedControl(): React.ReactElement {
  const { player, rate, showOnly, set, makeDefault } = useSpeed();
  const isDefault = Math.abs(rate - player.defaultRate()) < 0.01;
  return (
    <Box className="w-full" style={{ gap: bars.sheetGap }}>
      <Box className="flex-row items-center" style={{ gap: PLAYER.speedGap }}>
        <SpeedDial rate={rate} onChange={set} />
        <Box testID="speed-controls" className="flex-1 gap-gap">
          <Box className="flex-row gap-gap">
            <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-raise" onPress={() => set(rate - 0.1)} accessibilityRole="button" accessibilityLabel="Slower"><Type step="row" className="text-text" style={STEP}>−</Type></Pressable>
            <Pressable style={ROUND} className="items-center justify-center rounded-pill bg-raise" onPress={() => set(rate + 0.1)} accessibilityRole="button" accessibilityLabel="Faster"><Type step="row" className="text-text" style={STEP}>+</Type></Pressable>
          </Box>
          <Box testID="speed-presets" style={{ gap: PLAYER.chipGap }}>
            {[PRESETS.slice(0, 2), PRESETS.slice(2)].map((row) => (
              <Box key={row[0]} className="flex-row" style={{ gap: PLAYER.chipGap }}>
                {row.map((p) => (
                  <Pressable style={CHIP} hitSlop={CHIP_SLOP} className={`flex-1 items-center justify-center rounded-pill border ${Math.abs(rate - p) < 0.01 ? 'bg-text border-text' : 'bg-raise border-line'}`} key={p} onPress={() => set(p)} accessibilityRole="button" accessibilityLabel={`${p}×`} accessibilityState={{ selected: Math.abs(rate - p) < 0.01 }}>
                    <Type step="mono" className={Math.abs(rate - p) < 0.01 ? 'font-semibold text-void' : 'font-semibold text-text'} style={{ fontSize: PLAYER.chipText, lineHeight: PLAYER.chipLine }}>{`${p}×`}</Type>
                  </Pressable>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      {!isDefault ? (
        <Pressable hitSlop={LINE_SLOP} className="justify-center" onPress={makeDefault} accessibilityRole="button" accessibilityLabel={`Set ${rate.toFixed(1)}× as default (this show remembers its own)`}>
          <Type step="caption" className="text-hotText font-semibold">{`Set ${rate.toFixed(1)}× as default (this show remembers its own)`}</Type>
        </Pressable>
      ) : (
        <Type step="caption" className="text-text3">{showOnly ? `${rate.toFixed(1)}× is also the default for other shows` : `${rate.toFixed(1)}× for every show · keep one for this show in More settings`}</Type>
      )}
    </Box>
  );
}

/** More settings: the fine slider and the "This show only" switch (M21 US2). */
export function SpeedMore(): React.ReactElement {
  const { player, rate, feedUrl, showOnly, set, setShowOnly } = useSpeed();
  return (
    <Box testID="speed-finer" className="w-full bg-raise" style={{ gap: PLAYER.panelGap, padding: PLAYER.panelPad, borderRadius: PLAYER.panelRadius }}>
      <Box className="flex-row items-baseline justify-between">
        <Type step="compact" className="text-text" accessibilityRole="header">Speed, finer</Type>
        <Type step="heading" className="text-text font-extrabold" style={{ fontSize: PLAYER.speedFiner, lineHeight: PLAYER.speedFinerLine }}>{`${rate.toFixed(1)}×`}</Type>
      </Box>
      <SpeedBars rate={rate} onChange={set} />
      {feedUrl !== undefined ? (
        <Box className="flex-row items-center" style={{ minHeight: TAP.minHeight, gap: PLAYER.panelGap }}>
          <Box className="flex-1">
            <Type step="compact" className="text-text">This show only</Type>
            <Type step="caption" className="text-text2" style={{ fontSize: PLAYER.panelDetail, lineHeight: PLAYER.panelDetailLine }}>{showOnly ? `Other shows play at ${player.defaultRate().toFixed(1)}×` : 'Off: this speed is the default for every show'}</Type>
          </Box>
          <Toggle value={showOnly} onChange={setShowOnly} label="This show only" />
        </Box>
      ) : null}
    </Box>
  );
}
