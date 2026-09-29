/**
 * Minor mode (未成年模式, M10): hides every episode its publisher marked explicit — in
 * Updates, show pages and the inbox. The mark is the publisher's own `<itunes:explicit>`;
 * an unmarked episode is shown.
 */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { getPref, setPref } from '../../src/settings/prefs';
import { useStores } from '../../src/ui/providers';
import { SwitchRow } from '../../src/ui/settings/rows';

export default function MinorMode(): React.ReactElement {
  const stores = useStores();
  const [on, setOn] = useState(() => getPref(stores.settings, 'hideExplicit'));
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'Minor mode' }} />
      <SwitchRow icon="umbrella-outline" label="Hide explicit episodes" line="Episodes their publisher marks explicit are not listed in Updates, show pages or the inbox." value={on} onChange={(v) => { setOn(v); setPref(stores.settings, 'hideExplicit', v); }} />
      <Text className="text-muted text-xs mt-section">This relies on each publisher marking its episodes. SocialNet does not check the audio itself.</Text>
    </ScrollView>
  );
}
