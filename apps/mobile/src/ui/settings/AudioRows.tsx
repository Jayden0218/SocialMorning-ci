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
 *
 * M31 S-B (T060 part 2; design-pulse2 `settings-playback--screen`, `player--playback-more-settings`): the rows have two looks, one switch
 * each, so the Player's "More settings" page and the Playback settings page stay the same controls. `look="sheet"` (the default, what
 * the player's tile slots draw) is the sheet's row: an icon chip 34 on raise-2, the name in Geist 600 15, the line in 12 / 16, the switch
 * or a chevron — as `SettingsPanel` draws its own rows. `look="page"` is the Settings page's group row (icon 22, 60 tall, line 13 / 18).
 * Voice boost on the Playback page is the large 2-column tile (`useVoiceBoost` gives the page the state, and whether the phone has it at all; `VoiceBoostTile` draws it).
 */
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { TAP } from '@/ui/kit/TopBar';
import { Toggle } from '@/ui/kit/Toggle';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { BigSwitch, SwitchRow } from '@/ui/settings/panel';
import { SET } from '@/ui/settings/measures';
import { PLAYER } from '@/ui/player/measures';
import { useStores } from '@/ui/shell/providers';
import { selectEpisodeId, usePlayer, usePlayerSelector } from '@/playback/store';
import { getPref, setPref } from '@/settings/prefs';
import { effectsBlocked, voiceBoostSupported } from '@/settings/audio';
import * as AudioRoute from '../../../modules/audio-route';

/** The warning under "Play with other apps" (owner's words, G0). */
export const MIX_WARNING = 'Lock-screen controls go away on iPhone; calls no longer pause playback';
const ROUTE_LABEL = 'Audio output';
const ROUTE_LINE = 'AirPlay, Bluetooth or this phone';
const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
const SHEET_ROW = { minHeight: PLAYER.panelRow, paddingVertical: PLAYER.panelRowPadY, paddingHorizontal: PLAYER.panelPad, gap: PLAYER.rowGap };
const SHEET_CHIP = { width: PLAYER.panelIcon, height: PLAYER.panelIcon, borderRadius: PLAYER.panelIconRadius };
const PAGE_ROW = { minHeight: Math.max(SET.rowMin, hit.min), paddingVertical: SET.rowPadY, paddingHorizontal: SET.rowPadX, gap: SET.rowGap };

export type AudioLook = 'sheet' | 'page';

/** Android said once that it has no output switcher: every route button stays hidden after that. */
let switcherMissing = false;

/** True when the current episode cannot take voice boost or skip silence on this phone (iPhone + HLS). */
export function useEffectsBlocked(): boolean {
  const stores = useStores();
  const episodeId = usePlayerSelector(selectEpisodeId);
  const url = episodeId === undefined ? undefined : stores.feeds.getEpisode(episodeId)?.enclosureUrl;
  return effectsBlocked(Platform.OS, url);
}

/** The sheet's row: an icon chip, the name, a line under it and the control at the end (the same row `SettingsPanel` draws). */
function SheetBody(props: { icon: IconName; label: string; line: string; end: React.ReactNode }): React.ReactElement {
  const c = useColours();
  return (
    <>
      <Box className="items-center justify-center bg-raise2" style={SHEET_CHIP}><Icon name={props.icon} size={PLAYER.panelIconGlyph} color={c.hotText} /></Box>
      <Box className="flex-1">
        <Type step="row" className="text-text">{props.label}</Type>
        <Type step="caption" className="text-text2" style={{ fontSize: PLAYER.panelDetail, lineHeight: PLAYER.panelDetailLine, marginTop: PLAYER.detailGap }}>{props.line}</Type>
      </Box>
      {props.end}
    </>
  );
}

/** Voice boost's state: whether this phone can do it, whether this episode blocks it, and the switch. */
export function useVoiceBoost(): { supported: boolean; blocked: boolean; on: boolean; set: (v: boolean) => void } {
  const stores = useStores();
  const player = usePlayer();
  const blocked = useEffectsBlocked();
  const [on, setOn] = useState(() => getPref(stores.settings, 'voiceBoost'));
  return {
    supported: voiceBoostSupported(Platform.OS, Platform.Version),
    blocked,
    on,
    set: (v) => { setOn(v); setPref(stores.settings, 'voiceBoost', v); player.setVoiceBoost(v); },
  };
}

const BOOST_LINE = 'Clearer speech: quiet voices up, loud parts evened out';
const BOOST_BLOCKED = 'Not available for this live stream';

export function VoiceBoostRow(props: { look?: AudioLook }): React.ReactElement | null {
  const boost = useVoiceBoost();
  if (!boost.supported) return null;
  const line = boost.blocked ? BOOST_BLOCKED : BOOST_LINE;
  if (props.look === 'page') {
    return <SwitchRow icon="mic-outline" label="Voice boost" line={line} value={boost.on} disabled={boost.blocked} onChange={boost.set} />;
  }
  return (
    <Box className="flex-row items-center" style={SHEET_ROW}>
      <SheetBody icon="mic-outline" label="Voice boost" line={line} end={<Toggle value={boost.on} onChange={boost.set} label="Voice boost" disabled={boost.blocked} />} />
    </Box>
  );
}

/** The Playback page's large tile for voice boost (design `big({ ic: 'mic', label: 'Voice boost', state: 'Off' })`); the page gives it `useVoiceBoost()` and leaves it out where unsupported. */
export function VoiceBoostTile(props: { boost: ReturnType<typeof useVoiceBoost> }): React.ReactElement {
  const { boost } = props;
  return <BigSwitch icon="mic-outline" label="Voice boost" state={boost.blocked ? BOOST_BLOCKED : boost.on ? 'On' : 'Off'} on={boost.on} dim={boost.blocked} disabled={boost.blocked} onChange={boost.set} />;
}

export function MixRow(props: { look?: AudioLook }): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const [on, setOn] = useState(() => getPref(stores.settings, 'mixWithOthers'));
  const change = (v: boolean) => { setOn(v); setPref(stores.settings, 'mixWithOthers', v); player.setMixWithOthers(v); };
  if (props.look !== 'page') {
    return (
      <Box className="flex-row items-center" style={SHEET_ROW}>
        <SheetBody icon="layers-outline" label="Play with other apps" line={MIX_WARNING} end={<Toggle value={on} onChange={change} label="Play with other apps" />} />
      </Box>
    );
  }
  return <SwitchRow icon="layers-outline" label="Play with other apps" line={MIX_WARNING} value={on} onChange={change} />;
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

/** The route row: icon, "Audio output", what it reaches. Hidden like the button. */
export function RouteRow(props: { look?: AudioLook }): React.ReactElement | null {
  const c = useColours();
  const { picker: Picker, show, hide } = useRoute();
  if (!show) return null;
  const page = props.look === 'page';
  const body = page ? (
    <>
      <Icon name="headset-outline" size={SET.rowIcon} color={c.text} />
      <Box className="flex-1">
        <Type step="row" className="text-text">{ROUTE_LABEL}</Type>
        <Box style={{ marginTop: SET.rowLineGap }}><Type step="caption" className="text-text2 font-normal">{ROUTE_LINE}</Type></Box>
      </Box>
      <Icon name="chevron-forward" size={SET.rowChevron} color={c.text3} />
    </>
  ) : (
    <SheetBody icon="headset-outline" label={ROUTE_LABEL} line={ROUTE_LINE} end={<Icon name="chevron-forward" size={PLAYER.panelIconGlyph} color={c.text3} />} />
  );
  const frame = page ? PAGE_ROW : SHEET_ROW;
  if (Picker) {
    return (
      <Box className="flex-row items-center" style={frame}>
        <Box {...HIDDEN} className="flex-1 flex-row items-center" style={{ gap: frame.gap }}>{body}</Box>
        <Picker label={`${ROUTE_LABEL}, ${ROUTE_LINE}`} style={StyleSheet.absoluteFill} />
      </Box>
    );
  }
  return (
    <Pressable onPress={() => openSwitcher(hide)} accessibilityRole="button" accessibilityLabel={`${ROUTE_LABEL}, ${ROUTE_LINE}`} className="flex-row items-center" style={frame}>
      {body}
    </Pressable>
  );
}

/** The Playback settings' Sound rows after the short-sound choice: play with other apps, audio output (each hides itself). */
export function AudioRows(): React.ReactElement {
  return (
    <>
      <MixRow look="page" />
      <RouteRow look="page" />
    </>
  );
}
