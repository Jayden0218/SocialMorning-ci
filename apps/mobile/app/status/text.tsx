// Write a text status up to 140 characters for your followers; deleted after 24 hours.
/**
 * M21 US8 (FR-070, FR-071): the "Text" choice of the Updates "+" circle. A counter shows
 * characters left (counted as the server counts them, so an emoji is one); Post is off when the
 * text is empty, only spaces, or over 140. The server keeps it 24 h, like a voice status, then deletes it.
 *
 * M22 US6 (FR-020, T026): up to 10 episode cards and photos go with it (`StatusComposerItems`).
 *
 * M31 W4-B (T051; design-pulse2 `textBase`, `status-text--screen`, `-signed-out`, `-toast`; "Layout: Panel, with the words as the stage"): a 230 card
 * (raise, a 1 line, radius 26, padding 18) holds the words in Unbounded 24 with a hot caret and the count "27 / 140" in mono 12 at its foot (hot past
 * 140); the items row and its rows sit under it; the bottom zone is the title bar — back, "Text status", "Your followers see it on Updates for 24 hours.",
 * a hot Post (dimmed while empty or over 140). An error is a hot line above the title. Signed out: a lock, the sentence and a light Sign in. Same
 * boxes, names and handlers.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { PageGlow } from '@/ui/kit/PageGlow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { colour, gutter, typeScale } from '@/design';
import { useWindowDimensions } from 'react-native';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { TEXT_STATUS_MAX, textLength, useUs8Api } from '@/social/us8-api';
import { StatusComposerItems, itemsForPost, type ComposerItem } from '@/ui/social/StatusComposerItems';
import { useM22SocialApi } from '@/social/api-m22-social';
import { SignInBlock } from '@/ui/status/SignInBlock';
import { TEXT_PAGE, statusType } from '@/ui/status/measures';

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
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const n = textLength(body);
  const over = n > TEXT_STATUS_MAX;
  const ok = n > 0 && !over && listener !== undefined;

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
    <PushedPage
      title="Text status"
      size={26}
      subtitle="Your followers see it on Updates for 24 hours."
      tone="none"
      {...(error ? { extra: <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type>, extraAbove: TEXT_PAGE.errorLine } : {})}
      {...(listener !== undefined ? { right: <PulseButton label="Post" kind="hot" onPress={() => void post()} disabled={!ok} busy={busy} /> } : {})}
    >
      {(layout) => (
        <Box className="flex-1">
          <PageGlow top={TEXT_PAGE.glowTop} strength={TEXT_PAGE.glowStrength} />
          {listener === undefined ? (
            <Box className="absolute left-0 right-0" style={{ top: layout.top + TEXT_PAGE.signInTop }}><SignInBlock line="Sign in to post a status." /></Box>
          ) : (
            <ScrollView className="absolute" style={{ left: 0, right: 0, top: layout.top + TEXT_PAGE.cardTop, bottom: 0 }} contentContainerStyle={{ paddingHorizontal: side, paddingBottom: layout.reserve, gap: TEXT_PAGE.gap }} keyboardShouldPersistTaps="handled">
              <Box testID="status-text-card" className="bg-raise border border-line justify-between" style={{ minHeight: TEXT_PAGE.cardMin, borderRadius: TEXT_PAGE.cardRadius, padding: TEXT_PAGE.cardPad }}>
                <Textarea className="border-0 bg-transparent h-auto w-full" style={{ padding: 0 }}>
                  <TextareaInput
                    placeholderTextColor={colour.text3}
                    placeholder="What are you listening to?"
                    value={body}
                    onChangeText={setBody}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                    cursorColor={colour.hot}
                    selectionColor={colour.hot}
                    accessibilityLabel="Text status"
                    className={`text-text ${typeScale.statement.cls}`}
                    style={[{ padding: 0 }, statusType.cardWords]}
                  />
                </Textarea>
                <Type step="mono" className={over ? 'text-hotText self-end' : 'text-text3 self-end'} accessibilityLiveRegion="polite">
                  {over ? `${n - TEXT_STATUS_MAX} over · ${n} / ${TEXT_STATUS_MAX}` : `${n} / ${TEXT_STATUS_MAX}`}
                </Type>
              </Box>
              <StatusComposerItems items={items} onChange={setItems} colours={c} />
            </ScrollView>
          )}
        </Box>
      )}
    </PushedPage>
  );
}
