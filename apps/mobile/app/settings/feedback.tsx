// Send feedback with type, text and up to 3 images; see what you sent.
/**
 * Send feedback (M10; images and direct delivery M10b US6): choose a kind, write it, add up to
 * 3 images, send. It goes straight to the owner's /mod page; if the server cannot be reached,
 * the email app is offered instead (without the images). "My feedback" lists what you sent.
 *
 * M17 T087 (`SettingsFeedback-B`): the two tabs became one link on the right of the back row
 * ("My feedback" with a count, or "Write feedback" back); the title names the open side under a
 * "Help and feedback" line. The kinds are a scrolling row of pills (radios, the chosen one dark);
 * the text box is a white card that writes in the serif; "n of 3 images" under it; and a white
 * bar at the bottom holds the image tiles (tap to remove, the × marks it), the dashed add tile
 * and the yellow Send. "My feedback" is a list of white cards. Same handlers throughout.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Image } from '@/ui/lib/image';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { pickImages, type PickedImage } from '@/settings/feedback-images';
import { useColours } from '@/ui/kit/useColours';
import { FEEDBACK_KINDS, type FeedbackKind } from '@/settings/faq';
import { FEEDBACK_MAX, feedbackMailto, listFeedback, rememberFeedback, type SentFeedback } from '@/settings/feedback';
import { APPEALS_KEY, refreshAppeals } from '@/social/links';
import { useSocial } from '@/social/context';
import { Button } from '@/ui/kit/Button';
import { shortDate } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { Icon } from '@/ui/kit/Icon';
import { Card } from '@/ui/kit/Card';
import { BottomBar } from '@/ui/kit/BottomBar';
import { useStores, useToast } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min };
const TILE = { width: hit.min, height: hit.min };

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

  const other = tab === 'write' ? 'mine' : 'write';
  return (
    <>
    <PageHeader
      title={tab === 'write' ? 'Write feedback' : 'My feedback'}
      subtitle="Help and feedback"
      right={(
        <Box className="flex-row">
          {([other] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="button" {...(t === 'mine' ? { accessibilityHint: `${sent.length} sent` } : {})} accessibilityLabel={t === 'write' ? 'Write feedback' : 'My feedback'} className="flex-row items-center gap-1.5 px-row" style={TAP}>
              <Text className="text-accent text-meta font-bold">{t === 'write' ? 'Write feedback' : 'My feedback'}</Text>
              {t === 'mine' && sent.length > 0 ? (
                <Box className="min-w-5 h-5 px-1 rounded-pill bg-accentTint items-center justify-center">
                  <Text className="text-accent text-micro font-bold">{sent.length}</Text>
                </Box>
              ) : null}
            </Pressable>
          ))}
        </Box>
      )}
    />
    <Box className="flex-1 bg-background">
      {tab === 'write' ? (
        <>
        <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-row pb-section gap-row" keyboardShouldPersistTaps="handled">
          <Text className="text-muted text-xs">It is about</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-gap" accessibilityRole="radiogroup" accessibilityLabel="Kind of feedback">
            {FEEDBACK_KINDS.map((k) => (
              <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="radio" accessibilityState={{ checked: kind === k }} accessibilityLabel={k} className={`px-section rounded-pill items-center justify-center ${kind === k ? 'bg-text' : 'bg-surface border border-border'}`} style={TAP}>
                <Text className={kind === k ? 'text-background text-meta font-semibold' : 'text-text text-meta font-semibold'}>{k}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text className="text-muted text-xs">Your feedback</Text>
          <Textarea className="bg-surface border border-border rounded-row min-h-60 h-auto">
            <TextareaInput value={body} onChangeText={setBody} maxLength={FEEDBACK_MAX} multiline placeholder="Write here…" placeholderTextColor={c.muted} textAlignVertical="top" accessibilityLabel="Your feedback" className="p-section text-text text-title font-display-semibold" />
          </Textarea>
          <Text className="text-muted text-micro text-right">{`${images.length} of 3 images`}</Text>
        </ScrollView>
        <BottomBar tone="surface" line="border" className="flex-row items-center gap-row">
            {images.map((img, i) => (
              <Pressable key={img.uri + i} onPress={() => setImages((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove image ${i + 1}`} style={TILE}>
                <Image source={{ uri: img.uri }} className="w-12 h-12 rounded-row bg-background" />
                <Box className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-pill bg-text items-center justify-center" accessible={false}>
                  <Icon name="close" size={12} color={c.background} />
                </Box>
              </Pressable>
            ))}
            {images.length < 3 ? (
              <Pressable onPress={addImages} accessibilityRole="button" accessibilityLabel="Add an image" className="rounded-row border border-dashed border-track items-center justify-center" style={TILE}>
                <Icon name="image-outline" size={22} color={c.text} />
              </Pressable>
            ) : null}
            <Box className="flex-1" />
            <Button label="Send" onPress={send} disabled={!ready} busy={busy} className="px-9" />
        </BottomBar>
        </>
      ) : (
        <FlatList
          data={sent}
          // Owner, 2026-10-05: the bottom of a fetched list says so.
          ListFooterComponent={sent.length > 0 ? <EndOfList /> : null}
          keyExtractor={(f) => String(f.at)}
          contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
          ListEmptyComponent={<EmptyPicture icon="document-text-outline" line="Nothing sent yet" />}
          renderItem={({ item }) => (
            <Card className="py-section">
              <Text className="text-muted text-xs">{item.kind} · {shortDate(item.at)}</Text>
              <Text className="text-text text-body mt-1" numberOfLines={4}>{item.body}</Text>
            </Card>
          )}
        />
      )}
    </Box>
    </>
  );
}
