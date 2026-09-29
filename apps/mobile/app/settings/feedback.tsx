/**
 * Send feedback (M10; images and direct delivery M10b US6): choose a kind, write it, add up to
 * 3 images, send. It goes straight to the owner's /mod page; if the server cannot be reached,
 * the email app is offered instead (without the images). "My feedback" lists what you sent.
 */
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Image } from '../../src/ui/lib/image';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Textarea, TextareaInput } from '../../src/ui/lib/textarea';
import { FlatList } from '../../src/ui/lib/flat-list';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { colour, hit } from '../../src/design';
import { pickImages, type PickedImage } from '../../src/feedback/images';
import { useColours } from '../../src/ui/useColours';
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
  const c = useColours(stores.settings);
  const toast = useToast();
  const [tab, setTab] = useState<'write' | 'mine'>('write');
  const [kind, setKind] = useState<FeedbackKind | undefined>();
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<SentFeedback[]>(() => listFeedback(stores.settings));
  const [to, setTo] = useState<string | undefined>(() => stores.settings.get(APPEALS_KEY) || undefined);
  useEffect(() => { void refreshAppeals(api, stores).then(setTo); }, [api, stores]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const ready = kind !== undefined && body.trim().length >= 5 && !busy;
  const addImages = () => {
    void pickImages(3 - images.length).then((r) => {
      if (r.kind === 'denied') toast('Allow photo access for SocialNet in your phone’s Settings to add images.');
      else if (r.kind === 'ok') setImages((cur) => [...cur, ...r.images].slice(0, 3));
      else if (r.kind === 'too-big') { setImages((cur) => [...cur, ...r.kept].slice(0, 3)); toast('One image was too large even after shrinking, and was left out.'); }
    }, () => toast('Could not open your photos.'));
  };

  const done = (k: FeedbackKind) => {
    rememberFeedback(stores.settings, k, body, Date.now());
    setSent(listFeedback(stores.settings));
    setBody('');
    setKind(undefined);
    setImages([]);
  };
  const send = () => {
    if (!ready || !kind) return;
    const k = kind;
    const version = Constants.expoConfig?.version ?? '?';
    setBusy(true);
    api.sendFeedback({ kind: k, body: body.trim(), appVersion: version, images: images.map((i) => ({ mime: 'image/jpeg' as const, base64: i.base64 })) })
      .then(() => { done(k); toast('Sent. Thank you.'); })
      .catch(() => {
        // Offline or refused: the email app still works (without the images).
        if (!to) { toast('Could not send — check your connection.'); return; }
        void Linking.openURL(feedbackMailto(to, k, body, version)).then(() => { done(k); toast('Opened your email app — send the message from there.'); }, () => toast('Could not send — check your connection.'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Box className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Help and feedback' }} />
      <Box className="flex-row border-b-hairline border-separator">
        {(['write', 'mine'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'write' ? 'Write feedback' : 'My feedback'} className="flex-1 items-center justify-center" style={TAP}>
            <Text className={tab === t ? 'text-accent text-sm font-bold' : 'text-muted text-sm'}>{t === 'write' ? 'Write feedback' : 'My feedback'}</Text>
          </Pressable>
        ))}
      </Box>
      {tab === 'write' ? (
        <Box className="flex-1 px-screen-x pt-section gap-section">
          <Box className="flex-row flex-wrap gap-x-section">
            {FEEDBACK_KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} accessibilityLabel={k} className="flex-row items-center gap-2" style={TAP}>
                <Box className={`w-5 h-5 rounded-pill border-2 ${kind === k ? 'border-accent bg-accent' : 'border-separator'}`} />
                <Text className={kind === k ? 'text-text text-sm' : 'text-muted text-sm'}>{k}</Text>
              </Pressable>
            ))}
          </Box>
          <Textarea className="bg-surface rounded-artwork min-h-40 border-0 h-auto">
            <TextareaInput value={body} onChangeText={setBody} maxLength={FEEDBACK_MAX} multiline placeholder="Write here…" placeholderTextColor={c.muted} textAlignVertical="top" accessibilityLabel="Your feedback" className="p-section text-text text-sm" />
          </Textarea>
          <ScrollView horizontal contentContainerClassName="gap-row" showsHorizontalScrollIndicator={false}>
            {images.map((img, i) => (
              <Pressable key={img.uri + i} onPress={() => setImages((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove image ${i + 1}`}>
                <Image source={{ uri: img.uri }} className="w-20 h-20 rounded-row bg-surface" />
              </Pressable>
            ))}
            {images.length < 3 ? (
              <Pressable onPress={addImages} accessibilityRole="button" accessibilityLabel="Add an image" className="w-20 h-20 rounded-row border border-separator items-center justify-center">
                <Text className="text-muted text-lg">＋</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          <Box className="flex-1" />
          <Button label={busy ? 'Sending…' : 'Send'} onPress={send} disabled={!ready} className="mb-section" />
        </Box>
      ) : (
        <FlatList
          data={sent}
          keyExtractor={(f) => String(f.at)}
          contentContainerClassName="px-screen-x py-row flex-grow"
          ListEmptyComponent={<EmptyPicture icon="document-text-outline" line="Nothing sent yet" />}
          renderItem={({ item }) => (
            <Box className="py-row border-b-hairline border-separator">
              <Text className="text-muted text-xs">{item.kind} · {shortDate(item.at)}</Text>
              <Text className="text-text text-sm" numberOfLines={4}>{item.body}</Text>
            </Box>
          )}
        />
      )}
    </Box>
  );
}
