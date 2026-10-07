// Playback settings: queue order, mobile data, transcript entry, lock-screen comments, music mode, skip silence, other apps' sounds.
/**
 * M21 US10 (T110, spec story 10 "Settings"): a "Playback" page holds every playback setting
 * that was in Settings › More — the same switches, the same prefs, the same player calls, moved
 * here unchanged (G-E3 moves recorded in m17/moves.json). Opened from Settings (a tile) and from
 * More (a row where the rows used to be).
 *
 * The rows' history: "Comments on lock screen" (M20 US2, FR-005, on by default); "Music mode"
 * (M19 T070, research R3/R4: pitch correction off); "Another app's short sound" — lower the
 * volume (default) or pause — and "Skip silence" (M19, owner approved the native patch,
 * 2026-10-05; Android cuts silences, iPhone speeds them up). Both reach our expo-audio patch
 * through the player. M21 US11 adds its audio rows at the marked spot.
 */
import { AudioRows } from '@/ui/settings/AudioRows';
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { getPref, setPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import { LinkRow, SwitchRow } from '@/ui/settings/rows';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Segmented } from '@/ui/kit/Segmented';
import { Box } from '@/ui/lib/box';
import { PageHeader } from '@/ui/kit/PageHeader';
import { usePlayer } from '@/playback/store';

function Section(props: { title: string }): React.ReactElement {
  return <Text className="text-text text-base font-display-semibold mt-section mb-gap" accessibilityRole="header">{props.title}</Text>;
}

export default function PlaybackSettings(): React.ReactElement {
  const stores = useStores();
  const [end, setEnd] = useState(() => getPref(stores.settings, 'queueAddToEnd'));
  const [mobile, setMobile] = useState(() => getPref(stores.settings, 'mobilePlayback'));
  const [transcript, setTranscript] = useState(() => getPref(stores.settings, 'transcriptEntry'));
  const [music, setMusic] = useState(() => getPref(stores.settings, 'musicMode'));
  const [pausePrompts, setPausePrompts] = useState(() => getPref(stores.settings, 'pauseOnPrompts'));
  const [skip, setSkip] = useState(() => getPref(stores.settings, 'skipSilence'));
  const [lock, setLock] = useState(() => getPref(stores.settings, 'lockComments'));
  const player = usePlayer();
  return (
    <>
    <PageHeader title="Playback" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24">
      <Section title="Playing" />
      <Card>
        <SwitchRow icon="add-circle-outline" label="Queue adds to the end" line="Off: a one-tap Queue plays the episode next. The episode page offers both." value={end} onChange={(v) => { setEnd(v); setPref(stores.settings, 'queueAddToEnd', v); }} />
        <CardDivider />
        <SwitchRow icon="cellular-outline" label="Allow mobile data for playback" line="Off: on mobile data only downloaded episodes play" value={mobile} onChange={(v) => { setMobile(v); setPref(stores.settings, 'mobilePlayback', v); }} />
        <CardDivider />
        <SwitchRow icon="document-text-outline" label="Show transcript entry on the player" line="The transcript button and the live line under the title" value={transcript} onChange={(v) => { setTranscript(v); setPref(stores.settings, 'transcriptEntry', v); }} />
        <CardDivider />
        <SwitchRow icon="chatbubble-ellipses-outline" label="Comments on lock screen" line="A listener's comment from near where you are, under the episode title" value={lock} onChange={(v) => { setLock(v); setPref(stores.settings, 'lockComments', v); }} />
        <CardDivider />
        {/* M22 US4: the last 10 playlist versions on this phone. */}
        <LinkRow href="/settings/queue-backups" icon="time-outline" label="Playlist backups" line="The last 10 versions of your playlist on this phone" />
      </Card>
      <Section title="Sound" />
      <Card>
        <SwitchRow icon="musical-notes-outline" label="Music mode" line="Off: voices keep their pitch at any speed. On: the pitch follows the speed, which suits music." value={music} onChange={(v) => { setMusic(v); setPref(stores.settings, 'musicMode', v); player.setMusicMode(v); }} />
        <CardDivider />
        <SwitchRow icon="play-forward-outline" label="Skip silence" line="On iPhone, silences are sped up rather than cut." value={skip} onChange={(v) => { setSkip(v); setPref(stores.settings, 'skipSilence', v); player.setSkipSilence(v); }} />
        <CardDivider />
        <Box className="py-row gap-gap">
          <Text className="text-text text-body" accessibilityRole="header">Another app's short sound</Text>
          <Text className="text-muted text-xs">A map's directions or a message tone, while an episode plays.</Text>
          <Segmented
            items={[
              { value: 'lower', label: 'Lower the volume', accessibilityLabel: "Another app's short sound: lower the volume" },
              { value: 'pause', label: 'Pause', accessibilityLabel: "Another app's short sound: pause" },
            ] as const}
            value={pausePrompts ? 'pause' : 'lower'}
            onChange={(v) => { const on = v === 'pause'; setPausePrompts(on); setPref(stores.settings, 'pauseOnPrompts', on); player.setPauseOnPrompts(on); }}
          />
        </Box>
        {/* M21 US11: voice boost, play with other apps, audio output. */}
        <AudioRows />
        <CardDivider />
      </Card>
    </ScrollView>
    </>
  );
}
