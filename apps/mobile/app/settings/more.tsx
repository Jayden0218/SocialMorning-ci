// More settings: import/export shows, a link to Playback, recommendations on/off.
/**
 * More (更多功能, M10): moving your shows in or out, where one-tap Queue puts an episode,
 * and whether Discover recommends for you. The widgets and Siri's "play my latest episode"
 * (M10b US9, `src/outside/`, `app/play-latest.tsx`) have no switches, so they are not listed
 * here; CarPlay is not built (M20 Q1 = B: it needs the paid Apple program).
 *
 * M17 (`SettingsMore-B`): the rows are grouped under three serif section titles — Your shows,
 * Playback, Recommendations — each group in its own card with hairlines between rows. No
 * iPhone extras row (owner decision, FR-016). Same switches, same links, same names.
 *
 * M20 US2 (FR-005): Playback adds "Comments on lock screen" (on by default).
 *
 * M19 T070 (US7, research R3/R4): Playback adds "Music mode" (pitch correction off, so music
 * at 1.5× sounds like a faster record, not a stretched one).
 * M19 (owner approved the native patch, 2026-10-05; R3/R4 revised): "Another app's short sound"
 * — lower the volume (default) or pause — and "Skip silence" (Android cuts silences; iPhone
 * speeds them up). Both reach our expo-audio patch through the player.
 *
 * M21 US10 (T110): every Playback row moved to its own page, `settings/playback.tsx` (same
 * switches, same prefs); the Playback card here is now one row that opens it.
 */
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { getPref, setPref } from '@/settings/prefs';
import { useStores } from '@/ui/shell/providers';
import { LinkRow, SwitchRow } from '@/ui/settings/rows';
import { Card, CardDivider } from '@/ui/kit/Card';
import { PageHeader } from '@/ui/kit/PageHeader';

function Section(props: { title: string }): React.ReactElement {
  return <Text className="text-text text-base font-display-semibold mt-section mb-gap" accessibilityRole="header">{props.title}</Text>;
}

export default function MoreSettings(): React.ReactElement {
  const stores = useStores();
  const [recs, setRecs] = useState(() => getPref(stores.settings, 'personalRecs'));
  return (
    <>
    <PageHeader title="More" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24">
      <Section title="Your shows" />
      <Card>
        <LinkRow href="/settings/opml" icon="swap-horizontal-outline" label="Import or export subscriptions" line="OPML — the file every podcast app reads" />
      </Card>
      {/* M21 US10 (T110): the playback switches moved to their own page. */}
      <Section title="Playback" />
      <Card>
        <LinkRow href="/settings/playback" icon="play-circle-outline" label="Playback" line="Queue, mobile data, transcript, lock screen, music mode, skip silence" />
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
