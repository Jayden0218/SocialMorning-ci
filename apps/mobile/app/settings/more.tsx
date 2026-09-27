/**
 * More (更多功能, M10): moving your shows in or out, where one-tap Queue puts an episode,
 * and whether Discover recommends for you. Siri, CarPlay and widgets are not here: each
 * needs native code this Expo app does not have.
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { getPref, setPref } from '../../src/settings/prefs';
import { useStores } from '../../src/ui/providers';
import { Divider, LinkRow, SwitchRow } from '../../src/ui/settings/rows';

export default function MoreSettings(): React.ReactElement {
  const stores = useStores();
  const [end, setEnd] = useState(() => getPref(stores.settings, 'queueAddToEnd'));
  const [recs, setRecs] = useState(() => getPref(stores.settings, 'personalRecs'));
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'More' }} />
      <LinkRow href="/settings/opml" icon="swap-horizontal-outline" label="Import or export subscriptions" line="OPML — the file every podcast app reads" />
      <SwitchRow icon="add-circle-outline" label="Queue adds to the end" line="Off: a one-tap Queue plays the episode next. The episode page offers both." value={end} onChange={(v) => { setEnd(v); setPref(stores.settings, 'queueAddToEnd', v); }} />
      <Divider />
      <SwitchRow icon="sparkles-outline" label="Personalised recommendations" line="For You on Discover, from what you follow and play. Off: no For You, and nothing is sent for it." value={recs} onChange={(v) => { setRecs(v); setPref(stores.settings, 'personalRecs', v); }} />
    </ScrollView>
  );
}
