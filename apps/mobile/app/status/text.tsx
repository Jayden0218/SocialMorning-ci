// Write a text status up to 140 characters for your followers; deleted after 24 hours.
/**
 * M21 US8 (FR-070, FR-071): the "Text" choice of the Updates "+" circle. A counter shows
 * characters left (counted as the server counts them, so an emoji is one); Post is off when the
 * text is empty, only spaces, or over 140. The server keeps it 24 h, like a voice status, then deletes it.
 *
 * M22 US6 (FR-020, T026): up to 10 episode cards and photos go with it (`StatusComposerItems`).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { PageHeader } from '@/ui/kit/PageHeader';
import { BottomBar } from '@/ui/kit/BottomBar';
import { Button } from '@/ui/kit/Button';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { TEXT_STATUS_MAX, textLength, useUs8Api } from '@/social/us8-api';
import { StatusComposerItems, itemsForPost, type ComposerItem } from '@/ui/social/StatusComposerItems';
import { useM22SocialApi } from '@/social/api-m22-social';

export default function TextStatusScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const us8 = useUs8Api();
  const { listener, api } = useSocial();
  // M22 US6: the items that go with the words.
  const m22 = useM22SocialApi();
  const [items, setItems] = useState<ComposerItem[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const n = textLength(body);
  const ok = n > 0 && n <= TEXT_STATUS_MAX && listener !== undefined;

  const post = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (items.length > 0) await m22.postTextStatus(body, await itemsForPost(api, items));
      else await us8.postTextStatus(body);
      toast('Posted. It is gone after 24 hours.');
      router.back();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'You have 5 statuses up now. Delete one, or wait for one to expire.' : e instanceof ApiError ? e.message : "Couldn't post. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Text status" subtitle="Your followers see it on Updates for 24 hours." />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-24 gap-gap" keyboardShouldPersistTaps="handled">
        <Textarea className="bg-surface border border-border rounded-row min-h-24 h-auto">
          <TextareaInput placeholderTextColor={c.muted} placeholder="What are you listening to?" value={body} onChangeText={setBody} multiline textAlignVertical="top" autoFocus accessibilityLabel="Text status" className="p-row text-body text-text" />
        </Textarea>
        <Text className={n > TEXT_STATUS_MAX ? 'text-accent text-xs text-right font-bold' : 'text-muted text-xs text-right'} accessibilityLiveRegion="polite">
          {n > TEXT_STATUS_MAX ? `${n - TEXT_STATUS_MAX} over · ${n} / ${TEXT_STATUS_MAX}` : `${n} / ${TEXT_STATUS_MAX}`}
        </Text>
        {listener !== undefined ? <StatusComposerItems items={items} onChange={setItems} colours={c} /> : null}
        {listener === undefined ? <Text className="text-muted text-body">Sign in to post a status.</Text> : null}
        {error ? <Text className="text-accent text-body" accessibilityLiveRegion="polite">{error}</Text> : null}
      </ScrollView>
      <BottomBar tone="surface" line="border" className="flex-row items-center justify-end">
        <Box className="flex-1" />
        <Button label="Post" onPress={() => void post()} disabled={!ok} busy={busy} className="px-9" />
      </BottomBar>
    </>
  );
}
