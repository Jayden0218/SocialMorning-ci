/**
 * Notifications (推送设置, M10). The first row is the phone's own permission — only the
 * system can change it, so the switch opens the system settings. The second is stored
 * for the day the server sends popular-content notifications; it sends none yet, and the
 * row says so.
 */
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { expoNotify } from '../../src/notify/expo';
import type { PermissionState } from '../../src/notify/permission';
import { getPref, setPref } from '../../src/settings/prefs';
import { useStores } from '../../src/ui/providers';
import { SwitchRow } from '../../src/ui/settings/rows';

export default function PushSettings(): React.ReactElement {
  const stores = useStores();
  const [status, setStatus] = useState<PermissionState | 'unavailable'>('undetermined');
  const [popular, setPopular] = useState(() => getPref(stores.settings, 'popularPush'));
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
      <SwitchRow icon="notifications-outline" label="Popular content" line="Now and then, shows you may like. None are sent yet." value={popular} onChange={(v) => { setPopular(v); setPref(stores.settings, 'popularPush', v); }} />
    </ScrollView>
  );
}
