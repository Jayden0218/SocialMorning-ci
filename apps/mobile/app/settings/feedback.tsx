/** Send feedback (M10): choose a kind, write it, send through your email app; "My feedback" lists what you sent. */
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { colour, hit } from '../../src/design';
import { FEEDBACK_KINDS, type FeedbackKind } from '../../src/settings/faq';
import { FEEDBACK_MAX, feedbackMailto, listFeedback, rememberFeedback, type SentFeedback } from '../../src/settings/feedback';
import { APPEALS_KEY, refreshAppeals } from '../../src/social/links';
import { useSocial } from '../../src/social/context';
import { Button } from '../../src/ui/Button';
import { shortDate } from '../../src/ui/format';
import { EmptyPicture } from '../../src/ui/me/parts';
import { useStores, useToast } from '../../src/ui/providers';

const TAP = { minHeight: hit.min };

export default function FeedbackScreen(): React.ReactElement {
  const { api } = useSocial();
  const stores = useStores();
  const toast = useToast();
  const [tab, setTab] = useState<'write' | 'mine'>('write');
  const [kind, setKind] = useState<FeedbackKind | undefined>();
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<SentFeedback[]>(() => listFeedback(stores.settings));
  const [to, setTo] = useState<string | undefined>(() => stores.settings.get(APPEALS_KEY) || undefined);
  useEffect(() => { void refreshAppeals(api, stores).then(setTo); }, [api, stores]);
  const ready = kind !== undefined && body.trim().length >= 5 && to !== undefined;

  const send = () => {
    if (!ready || !kind || !to) return;
    void Linking.openURL(feedbackMailto(to, kind, body, Constants.expoConfig?.version ?? '?')).then(() => {
      rememberFeedback(stores.settings, kind, body, Date.now());
      setSent(listFeedback(stores.settings));
      setBody('');
      setKind(undefined);
      toast('Opened your email app — send the message from there.');
    }, () => toast('No email app on this phone.'));
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Help and feedback' }} />
      <View className="flex-row border-b-hairline border-separator">
        {(['write', 'mine'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'write' ? 'Write feedback' : 'My feedback'} className="flex-1 items-center justify-center" style={TAP}>
            <Text className={tab === t ? 'text-accent text-sm font-bold' : 'text-muted text-sm'}>{t === 'write' ? 'Write feedback' : 'My feedback'}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'write' ? (
        <View className="flex-1 px-screen-x pt-section gap-section">
          <View className="flex-row flex-wrap gap-x-section">
            {FEEDBACK_KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} accessibilityLabel={k} className="flex-row items-center gap-2" style={TAP}>
                <View className={`w-5 h-5 rounded-pill border-2 ${kind === k ? 'border-accent bg-accent' : 'border-separator'}`} />
                <Text className={kind === k ? 'text-text text-sm' : 'text-muted text-sm'}>{k}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={body} onChangeText={setBody} maxLength={FEEDBACK_MAX} multiline placeholder="Write here…" placeholderTextColor={colour.muted} textAlignVertical="top"
            className="bg-surface rounded-artwork p-section text-text text-sm min-h-40" accessibilityLabel="Your feedback" />
          {to === undefined ? <Text className="text-muted text-xs">The support address has not loaded yet — check your connection.</Text> : null}
          <View className="flex-1" />
          <Button label="Send" onPress={send} disabled={!ready} className="mb-section" />
        </View>
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(f) => String(f.at)}
          contentContainerClassName="px-screen-x py-row flex-grow"
          ListEmptyComponent={<EmptyPicture emoji="📝" line="Nothing sent yet" />}
          renderItem={({ item }) => (
            <View className="py-row border-b-hairline border-separator">
              <Text className="text-muted text-xs">{item.kind} · {shortDate(item.at)}</Text>
              <Text className="text-text text-sm" numberOfLines={4}>{item.body}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
