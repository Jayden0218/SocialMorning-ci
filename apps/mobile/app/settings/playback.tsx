// Playback settings: queue order, mobile data, transcript entry, lock-screen comments and ±5 min skip, music mode, skip silence, other apps' sounds.
/**
 * M21 US10 (T110, spec story 10 "Settings"): a "Playback" page holds every playback setting
 * that was in Settings › More — the same switches, the same prefs, the same player calls, moved
 * here unchanged (G-E3 moves recorded in __tests__/fixtures/m17/moves.json). Opened from Settings (a tile) and from
 * More (a row where the rows used to be).
 *
 * The rows' history: "Comments on lock screen" (M20 US2, FR-005, on by default); "Music mode"
 * (M19 T070, research R3/R4: pitch correction off); "Another app's short sound" — lower the
 * volume (default) or pause — and "Skip silence" (M19, owner approved the native patch,
 * 2026-10-05; Android cuts silences, iPhone speeds them up). Both reach our expo-audio patch
 * through the player. M21 US11 adds its audio rows at the marked spot.
 *
 * M31 S-B (T060 part 2; design-pulse2 `settings-playback--screen`; layout Panel + Mosaic): the four most-used switches are large 2-column
 * tiles under the edge label MOST USED — Skip silence, Music mode, Allow mobile data for playback and Voice boost (only where the phone can
 * do it; "Not available for this live stream" and dimmed when the episode blocks it) — each with its state in mono under the name. PLAYING
 * is one group: Queue adds to the end, Show transcript entry on the player, Comments on lock screen, Playlist backups (a link) and ±5 min
 * on the lock screen, their lines kept. SOUND is one group: "Another app's short sound" with its two-way track (Lower the volume | Pause),
 * Play with other apps and Audio output. Every switch saves at once, as before. The tiles' long lines ("Off: voices keep their pitch at any
 * speed…") became the drawn short states; the rows keep their lines. Not as drawn: Allow mobile data's off state says "Off · downloads only"
 * (the drawing shows only its on state "On").
 */
import { Platform } from 'react-native';
import { AudioRows, VoiceBoostTile, useVoiceBoost } from '@/ui/settings/AudioRows';
import { useState } from 'react';
import { getPref, setPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import { PanelGroup } from '@/ui/me/Panel';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { usePlayer } from '@/playback/store';
import { LOCK_SKIP_KEY, lockSkipSeconds } from '@/settings/playback';
import { setLockScreenSkipSeconds } from '@/playback/expo-audio-adapter';
import { BigGrid, BigSwitch, Line, LinkRow, Section, SettingsPage, SettingsSegment, SwitchRow } from '@/ui/settings/panel';
import { SET } from '@/ui/settings/measures';

export default function PlaybackSettings(): React.ReactElement {
  const stores = useStores();
  const [end, setEnd] = useState(() => getPref(stores.settings, 'queueAddToEnd'));
  const [mobile, setMobile] = useState(() => getPref(stores.settings, 'mobilePlayback'));
  const [transcript, setTranscript] = useState(() => getPref(stores.settings, 'transcriptEntry'));
  const [music, setMusic] = useState(() => getPref(stores.settings, 'musicMode'));
  const [pausePrompts, setPausePrompts] = useState(() => getPref(stores.settings, 'pauseOnPrompts'));
  const [skip, setSkip] = useState(() => getPref(stores.settings, 'skipSilence'));
  const [lock, setLock] = useState(() => getPref(stores.settings, 'lockComments'));
  // M22 US17 (T072): the lock-screen skip buttons jump 5 minutes instead of 10 s.
  const [fiveMin, setFiveMin] = useState(() => lockSkipSeconds(stores.settings) === 300);
  const player = usePlayer();
  const boost = useVoiceBoost();
  return (
    <SettingsPage title="Playback">
      <Section label="Most used">
        <BigGrid testID="playback-tiles">
          <BigSwitch icon="play-forward-outline" label="Skip silence" state={skip ? (Platform.OS === 'ios' ? 'On · sped up on iPhone' : 'On · silences are cut') : 'Off'} on={skip} onChange={(v) => { setSkip(v); setPref(stores.settings, 'skipSilence', v); player.setSkipSilence(v); }} />
          <BigSwitch icon="musical-notes-outline" label="Music mode" state={music ? 'On · pitch follows speed' : 'Off · voices keep pitch'} on={music} onChange={(v) => { setMusic(v); setPref(stores.settings, 'musicMode', v); player.setMusicMode(v); }} />
          <BigSwitch icon="cellular-outline" label="Allow mobile data for playback" state={mobile ? 'On' : 'Off · downloads only'} on={mobile} onChange={(v) => { setMobile(v); setPref(stores.settings, 'mobilePlayback', v); }} />
          {boost.supported ? <VoiceBoostTile boost={boost} /> : null}
        </BigGrid>
      </Section>
      <Section label="Playing">
        <PanelGroup>
          <SwitchRow icon="add-circle-outline" label="Queue adds to the end" line="Off: a one-tap Queue plays the episode next. The episode page offers both." value={end} onChange={(v) => { setEnd(v); setPref(stores.settings, 'queueAddToEnd', v); }} />
          <SwitchRow icon="document-text-outline" label="Show transcript entry on the player" line="The transcript button and the live line under the title" value={transcript} onChange={(v) => { setTranscript(v); setPref(stores.settings, 'transcriptEntry', v); }} />
          <SwitchRow icon="chatbubble-ellipses-outline" label="Comments on lock screen" line="A listener's comment from near where you are, under the episode title" value={lock} onChange={(v) => { setLock(v); setPref(stores.settings, 'lockComments', v); }} />
          {/* M22 US4: the last 10 playlist versions on this phone. */}
          <LinkRow href="/settings/queue-backups" icon="time-outline" label="Playlist backups" line="The last 10 versions of your playlist on this phone" />
          <SwitchRow icon="time-outline" label="±5 min on the lock screen" line="Off: the lock-screen skip buttons jump 10 seconds" value={fiveMin} onChange={(v) => { setFiveMin(v); stores.settings.set(LOCK_SKIP_KEY, v ? '1' : '0'); setLockScreenSkipSeconds(v ? 300 : 10); }} />
        </PanelGroup>
      </Section>
      <Section label="Sound">
        <PanelGroup>
          <Box testID="short-sound" style={{ paddingVertical: SET.rowPadX - 2, paddingHorizontal: SET.rowPadX, gap: SET.tileGap }}>
            <Type step="row" className="text-text" accessibilityRole="header">Another app's short sound</Type>
            <Line>A map's directions or a message tone, while an episode plays.</Line>
            <SettingsSegment
              items={[
                { value: 'lower', label: 'Lower the volume', accessibilityLabel: "Another app's short sound: lower the volume" },
                { value: 'pause', label: 'Pause', accessibilityLabel: "Another app's short sound: pause" },
              ] as const}
              value={pausePrompts ? 'pause' : 'lower'}
              onChange={(v) => { const on = v === 'pause'; setPausePrompts(on); setPref(stores.settings, 'pauseOnPrompts', on); player.setPauseOnPrompts(on); }}
            />
          </Box>
          {/* M21 US11: play with other apps, audio output. */}
          <AudioRows />
        </PanelGroup>
      </Section>
    </SettingsPage>
  );
}
