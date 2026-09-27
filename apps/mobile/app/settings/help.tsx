/**
 * Help and feedback (帮助与反馈, M10): SocialNet's common questions (tap to read the
 * answer), then "Send feedback" and "Contact support". M6's "Report a problem" lives here.
 */
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { colour, hit } from '../../src/design';
import { FAQ } from '../../src/settings/faq';
import { appealsMailto, APPEALS_KEY, refreshAppeals } from '../../src/social/links';
import { useSocial } from '../../src/social/context';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { useStores } from '../../src/ui/providers';
import { LinkRow } from '../../src/ui/settings/rows';

const TAP = { minHeight: hit.min + 8 };

export default function HelpScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  const [open, setOpen] = useState<number | undefined>();
  const [appeals, setAppeals] = useState<string | undefined>(() => stores.settings.get(APPEALS_KEY) || undefined);
  useEffect(() => { void refreshAppeals(api, stores).then(setAppeals); }, [api, stores]);
  const mail = appealsMailto(appeals);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="py-section pb-24">
      <Stack.Screen options={{ title: 'Help and feedback' }} />
      <Text className="text-text text-base font-bold px-screen-x mb-row" accessibilityRole="header">Common questions</Text>
      {FAQ.map((f, i) => (
        <View key={f.q} className="border-b-hairline border-separator px-screen-x">
          <Pressable onPress={() => setOpen(open === i ? undefined : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }} accessibilityLabel={f.q} className="flex-row items-center py-row" style={TAP}>
            <View className="flex-1">
              <Text className="text-text text-sm">{f.q}</Text>
              <Text className="text-muted text-xs">[{f.tag}]</Text>
            </View>
            <Icon name={open === i ? 'chevron-down' : 'chevron-forward'} size={18} color={colour.muted} />
          </Pressable>
          {open === i ? <Text className="text-muted text-sm pb-section">{f.a}</Text> : null}
        </View>
      ))}
      <View className="px-screen-x mt-section gap-row">
        <LinkRow href="/settings/feedback" icon="create-outline" label="Send feedback" line="Tell us what went wrong or what you would like" />
        <Button label={mail ? 'Contact support' : 'Contact support (offline)'} kind="secondary" disabled={!mail} onPress={() => { if (mail) void Linking.openURL(mail); }} accessibilityLabel="Report a problem to support" />
      </View>
    </ScrollView>
  );
}
