// Voice boost, "Play with other apps" with its warning, and the audio-output button and row.
/**
 * M21 US11 (FR-100–FR-102; owner decisions at G0, 2026-10-06). Shared by the Playback settings
 * (`app/settings/more.tsx`, later `app/settings/playback.tsx`) and the player's settings panel
 * (`SettingsPanel`'s `voiceBoostSlot` / `routeSlot`), so both places change the same switches:
 *   - Voice boost: off by default, remembered (`player.voiceBoost`), applied at once. Hidden on
 *     Android below 9 (no DynamicsProcessing); greyed out on iPhone for an HLS episode, whose
 *     audio never reaches the tap (src/settings/audio.ts).
 *   - Play with other apps: off by default (`player.mixWithOthers`), with the one-line cost.
 *   - Audio output: our own icon. iOS lays Apple's invisible route picker over it; Android opens
 *     the system output switcher. Hidden when the module is missing or the phone has no switcher.
 */
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { size } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { CardDivider } from '@/ui/kit/Card';
import { useColours } from '@/ui/kit/useColours';
import { SwitchRow } from '@/ui/settings/rows';
import { useStores } from '@/ui/shell/providers';
import { usePlayer, usePlayerState } from '@/playback/store';
import { getPref, setPref } from '@/settings/prefs';
import { effectsBlocked, voiceBoostSupported } from '@/settings/audio';
import * as AudioRoute from '../../../modules/audio-route';

/** The warning under "Play with other apps" (owner's words, G0). */
export const MIX_WARNING = 'Lock-screen controls go away on iPhone; calls no longer pause playback';
const ROUTE_LABEL = 'Audio output';
const ROUTE_LINE = 'AirPlay, Bluetooth or this phone';
const ROW = { minHeight: size.row };
const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** Android said once that it has no output switcher: every route button stays hidden after that. */
let switcherMissing = false;

/** True when the current episode cannot take voice boost or skip silence (iPhone + HLS). */
export function useEffectsBlocked(): boolean {
  const stores = useStores();
  const state = usePlayerState();
  const url = state.kind === 'idle' ? undefined : stores.feeds.getEpisode(state.episodeId)?.enclosureUrl;
  return effectsBlocked(Platform.OS, url);
}

export function VoiceBoostRow(): React.ReactElement | null {
  const stores = useStores();
  const player = usePlayer();
  const blocked = useEffectsBlocked();
  const [on, setOn] = useState(() => getPref(stores.settings, 'voiceBoost'));
  if (!voiceBoostSupported(Platform.OS, Platform.Version)) return null;
  return (
    <SwitchRow
      icon="mic-outline"
      label="Voice boost"
      line={blocked ? 'Not available for this live stream' : 'Clearer speech: quiet voices up, loud parts evened out'}
      value={on}
      disabled={blocked}
      onChange={(v) => { setOn(v); setPref(stores.settings, 'voiceBoost', v); player.setVoiceBoost(v); }}
    />
  );
}

export function MixRow(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const [on, setOn] = useState(() => getPref(stores.settings, 'mixWithOthers'));
  return (
    <SwitchRow
      icon="layers-outline"
      label="Play with other apps"
      line={MIX_WARNING}
      value={on}
      onChange={(v) => { setOn(v); setPref(stores.settings, 'mixWithOthers', v); player.setMixWithOthers(v); }}
    />
  );
}

/** Whether a route control can be shown on this phone, in this build. */
function useRoute(): { picker: ReturnType<typeof AudioRoute.routePickerView>; show: boolean; hide: () => void } {
  const [gone, setGone] = useState(switcherMissing);
  const picker = Platform.OS === 'ios' ? AudioRoute.routePickerView() : null;
  const show = !gone && AudioRoute.isAvailable() && (Platform.OS === 'android' || picker !== null);
  return { picker, show, hide: () => { switcherMissing = true; setGone(true); } };
}

/** Android: open the system switcher; if it says there is none, hide the button for good. */
function openSwitcher(hide: () => void): void {
  void AudioRoute.showOutputSwitcher().then((ok) => { if (!ok) hide(); });
}

/** The player's icon button (top bar). Hidden when this phone or build has no route picker. */
export function RouteButton(props: { colour: string }): React.ReactElement | null {
  const { picker: Picker, show, hide } = useRoute();
  if (!show) return null;
  const icon = <Icon name="headset-outline" size={24} color={props.colour} />;
  if (Picker) {
    return (
      <Box className="items-center justify-center" style={TAP}>
        <Box {...HIDDEN}>{icon}</Box>
        <Picker label={ROUTE_LABEL} style={StyleSheet.absoluteFill} />
      </Box>
    );
  }
  return (
    <Pressable onPress={() => openSwitcher(hide)} accessibilityRole="button" accessibilityLabel={ROUTE_LABEL} className="items-center justify-center" style={TAP}>
      {icon}
    </Pressable>
  );
}

/** The settings row: icon, "Audio output", what it reaches. Hidden like the button. */
export function RouteRow(): React.ReactElement | null {
  const c = useColours();
  const { picker: Picker, show, hide } = useRoute();
  if (!show) return null;
  const body = (
    <>
      <Icon name="headset-outline" size={20} color={c.accent} />
      <Box className="flex-1">
        <Text className="text-text text-body">{ROUTE_LABEL}</Text>
        <Text className="text-muted text-xs mt-0.5">{ROUTE_LINE}</Text>
      </Box>
      <Icon name="chevron-forward" size={16} color={c.muted} />
    </>
  );
  if (Picker) {
    return (
      <Box className="flex-row items-center gap-section" style={ROW}>
        <Box {...HIDDEN} className="flex-1 flex-row items-center gap-section">{body}</Box>
        <Picker label={`${ROUTE_LABEL}, ${ROUTE_LINE}`} style={StyleSheet.absoluteFill} />
      </Box>
    );
  }
  return (
    <Pressable onPress={() => openSwitcher(hide)} accessibilityRole="button" accessibilityLabel={`${ROUTE_LABEL}, ${ROUTE_LINE}`} className="flex-row items-center gap-section" style={ROW}>
      {body}
    </Pressable>
  );
}

/** The Playback settings' block: voice boost, play with other apps, audio output (each hides itself). */
export function AudioRows(): React.ReactElement {
  const boost = voiceBoostSupported(Platform.OS, Platform.Version);
  const route = useRoute().show;
  return (
    <>
      {boost ? <><VoiceBoostRow /><CardDivider /></> : null}
      <MixRow />
      {route ? <><CardDivider /><RouteRow /></> : null}
    </>
  );
}
