/**
 * Notifications (推送设置, M10; sent since M10b US3). The first row is the phone's own
 * permission — only the system can change it, so the switch opens the system settings.
 * "New episodes" and "Popular content" are the server's switches too: each change is sent
 * (`PUT /v1/me/push-prefs`), so turning one off stops it on every device.
 */
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { useSocial } from '../../src/social/context';
import { expoNotify } from '../../src/notify/expo';
import type { PermissionState } from '../../src/notify/permission';
import { getPref, setPref } from '../../src/settings/prefs';
import { useStores } from '../../src/ui/providers';
import { SwitchRow } from '../../src/ui/settings/rows';

export default function PushSettings(): React.ReactElement {
  const stores = useStores();
  const [status, setStatus] = useState<PermissionState | 'unavailable'>('undetermined');
  const { api, listener } = useSocial();
  const [popular, setPopular] = useState(() => getPref(stores.settings, 'popularPush'));
  const [episodes, setEpisodes] = useState(() => getPref(stores.settings, 'newEpisodePush'));
  const save = (next: { newEpisodes: boolean; popular: boolean }) => {
    setPref(stores.settings, 'newEpisodePush', next.newEpisodes);
    setPref(stores.settings, 'popularPush', next.popular);
    if (listener) void api.pushPrefs(next).catch(() => undefined);
  };
  useFocusEffect(useCallback(() => {
    let live = true;
    expoNotify.status().then((s) => { if (live) setStatus(s); }, () => { if (live) setStatus('unavailable'); });
    return () => { live = false; };
  }, []));
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'Notifications' }} />
      <SwitchRow
        icon="phone-portrait-outline"
        label="Allow notifications"
        line={status === 'unavailable' ? 'Not available in this build' : 'Set in your phone’s settings — tap to open them'}
        value={status === 'granted'}
        disabled={status === 'unavailable'}
        onChange={() => { void Linking.openSettings(); }}
      />
      <SwitchRow icon="albums-outline" label="New episodes" line="When a show you follow publishes" value={episodes} onChange={(v) => { setEpisodes(v); save({ newEpisodes: v, popular }); }} />
      <SwitchRow icon="notifications-outline" label="Popular content" line="The day's pick, at most once a day" value={popular} onChange={(v) => { setPopular(v); save({ newEpisodes: episodes, popular: v }); }} />
      {!listener ? <Text className="text-muted text-xs mt-row">Sign in to receive notifications.</Text> : null}
    </ScrollView>
  );
}
