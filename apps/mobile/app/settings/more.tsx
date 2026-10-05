// More settings: import/export shows, queue and playback options, recommendations on/off.
/**
 * More (更多功能, M10): moving your shows in or out, where one-tap Queue puts an episode,
 * and whether Discover recommends for you. Siri, CarPlay and widgets are not here: each
 * needs native code this Expo app does not have.
 *
 * M17 (`SettingsMore-B`): the rows are grouped under three serif section titles — Your shows,
 * Playback, Recommendations — each group in its own card with hairlines between rows. No
 * iPhone extras row (owner decision, FR-016). Same switches, same links, same names.
 *
 * M19 T070 (US7, research R3/R4): Playback adds "Music mode" (pitch correction off, so music
 * at 1.5× sounds like a faster record, not a stretched one).
 * M19 (owner approved the native patch, 2026-10-05; R3/R4 revised): "Another app's short sound"
 * — lower the volume (default) or pause — and "Skip silence" (Android cuts silences; iPhone
 * speeds them up). Both reach our expo-audio patch through the player.
 */
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

export default function MoreSettings(): React.ReactElement {
  const stores = useStores();
  const [end, setEnd] = useState(() => getPref(stores.settings, 'queueAddToEnd'));
  const [recs, setRecs] = useState(() => getPref(stores.settings, 'personalRecs'));
  const [mobile, setMobile] = useState(() => getPref(stores.settings, 'mobilePlayback'));
  const [transcript, setTranscript] = useState(() => getPref(stores.settings, 'transcriptEntry'));
  const [music, setMusic] = useState(() => getPref(stores.settings, 'musicMode'));
  const [pausePrompts, setPausePrompts] = useState(() => getPref(stores.settings, 'pauseOnPrompts'));
  const [skip, setSkip] = useState(() => getPref(stores.settings, 'skipSilence'));
  const player = usePlayer();
  return (
    <>
    <PageHeader title="More" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24">
      <Section title="Your shows" />
      <Card>
        <LinkRow href="/settings/opml" icon="swap-horizontal-outline" label="Import or export subscriptions" line="OPML — the file every podcast app reads" />
      </Card>
      <Section title="Playback" />
      <Card>
        <SwitchRow icon="add-circle-outline" label="Queue adds to the end" line="Off: a one-tap Queue plays the episode next. The episode page offers both." value={end} onChange={(v) => { setEnd(v); setPref(stores.settings, 'queueAddToEnd', v); }} />
        <CardDivider />
        <SwitchRow icon="cellular-outline" label="Allow mobile data for playback" line="Off: on mobile data only downloaded episodes play" value={mobile} onChange={(v) => { setMobile(v); setPref(stores.settings, 'mobilePlayback', v); }} />
        <CardDivider />
        <SwitchRow icon="document-text-outline" label="Show transcript entry on the player" line="The transcript button and the live line under the title" value={transcript} onChange={(v) => { setTranscript(v); setPref(stores.settings, 'transcriptEntry', v); }} />
        <CardDivider />
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
      </Card>
      <Section title="Recommendations" />
      <Card>
        <SwitchRow icon="sparkles-outline" label="Personalised recommendations" line="For You on Discover, from what you follow and play. Off: no For You, and nothing is sent for it." value={recs} onChange={(v) => { setRecs(v); setPref(stores.settings, 'personalRecs', v); }} />
        <CardDivider />
        {/* M12 FR-094 */}
        <LinkRow href="/settings/how-for-you" icon="help-circle-outline" label="How For You works" line="What it uses, and what it never uses" />
      </Card>
    </ScrollView>
    </>
  );
}
