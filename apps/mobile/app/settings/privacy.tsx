// Privacy: keep your listening private switch, and a link to blocked listeners.
/**
 * Privacy (隐私设置, M10). "Keep my listening private" is M4's switch (it was on Account):
 * your listens, listening time and recently played are hidden from others; comments and
 * clips stay public. Blocked listeners are managed from here.
 *
 * M17 T093 (`SettingsPrivacy-B`): the switch is a card — icon, serif title, the line, then a
 * row that says the current state beside the app's own toggle; "Always public" chips under it;
 * Blocked listeners is a card with the count as a serif figure. Same API call and link.
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { useSocial } from '@/social/context';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { Toggle } from '@/ui/kit/Toggle';
import { hit } from '@/design';

const TAP = { minHeight: hit.min };

export default function PrivacySettings(): React.ReactElement {
  const { api, listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
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
  const setPrivacy = async (v: boolean) => {
    setPriv(v);
    try { await api.setPrivacy(v); stores.settings.set('me.privateListening', v ? '1' : '0'); } catch { setPriv(!v); }
  };
  return (
    <>
    <PageHeader title="Privacy" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
      <Card className="py-section gap-gap">
        <Icon name="eye-off-outline" size={28} color={c.accent} />
        <Text className="text-text text-base font-display" accessibilityRole="header">Keep my listening private</Text>
        <Text className="text-muted text-body">Others will not see what you listen to, your listening time or recently played. Comments and clips stay public.</Text>
        <CardDivider />
        {listener ? (
          <Box className="flex-row items-center gap-row" style={TAP}>
            <Text className="text-text text-body font-semibold flex-1">{priv ? 'On — your listening is private' : 'Off — your listening is visible'}</Text>
            <Toggle value={priv} onChange={(v) => { void setPrivacy(v); }} label="Keep my listening private" />
          </Box>
        ) : <Text className="text-muted text-body py-row">Sign in to choose who sees your listening.</Text>}
      </Card>

      <Box className="flex-row items-center gap-gap" accessible accessibilityLabel="Always public: comments and clips">
        <Text className="text-muted text-meta">Always public:</Text>
        <Box className="bg-accentTint rounded-pill px-row py-1.5"><Text className="text-accent text-meta font-bold">Comments</Text></Box>
        <Box className="bg-accentTint rounded-pill px-row py-1.5"><Text className="text-accent text-meta font-bold">Clips</Text></Box>
      </Box>

      <Card>
        <Link href="/settings/blocked" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="Blocked listeners" accessibilityValue={{ text: String(blocked) }} className="flex-row items-center gap-section py-section" style={TAP}>
            {blocked > 0
              ? <Text className="text-text text-hero font-display">{String(blocked)}</Text>
              : <Icon name="person-remove-outline" size={24} color={c.accent} />}
            <Box className="flex-1">
              <Text className="text-text text-body font-bold">Blocked listeners</Text>
              <Text className="text-muted text-xs mt-0.5">Manage who you blocked</Text>
            </Box>
            <Icon name="chevron-forward" size={16} color={c.muted} />
          </Pressable>
        </Link>
      </Card>
    </ScrollView>
    </>
  );
}
