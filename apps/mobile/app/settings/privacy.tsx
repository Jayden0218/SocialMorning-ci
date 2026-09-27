/**
 * Privacy (隐私设置, M10). "Keep my listening private" is M4's switch (it was on Account):
 * your listens, listening time and recently played are hidden from others; comments and
 * clips stay public. Blocked listeners are managed from here.
 */
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { Divider, LinkRow, SwitchRow } from '../../src/ui/settings/rows';

export default function PrivacySettings(): React.ReactElement {
  const { api, listener } = useSocial();
  const stores = useStores();
  const [priv, setPriv] = useState(() => stores.settings.get('me.privateListening') === '1');
  useEffect(() => {
    if (!listener) return;
    void api.me().then((me) => {
      if (me.privateListening === undefined) return;
      setPriv(me.privateListening);
      stores.settings.set('me.privateListening', me.privateListening ? '1' : '0');
    }).catch(() => undefined); // offline: the mirror stands
  }, [api, listener, stores]);
  const blocked = stores.blocks.all().filter((b) => b.pending >= 0).length;
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row">
      <Stack.Screen options={{ title: 'Privacy' }} />
      {listener ? (
        <SwitchRow
          icon="eye-off-outline"
          label="Keep my listening private"
          line="Others will not see what you listen to, your listening time or recently played. Comments and clips stay public."
          value={priv}
          onChange={async (v) => {
            setPriv(v);
            try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); } catch { setPriv(!v); }
          }}
        />
      ) : <Text className="text-muted text-sm py-row">Sign in to choose who sees your listening.</Text>}
      <Divider />
      <LinkRow href="/settings/blocked" icon="person-remove-outline" label="Blocked listeners" value={blocked > 0 ? String(blocked) : ''} />
    </ScrollView>
  );
}
