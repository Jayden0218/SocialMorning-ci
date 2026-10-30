// Appeal: the moderation actions against me (a removal or my suspension), each appealable once.
/**
 * M24 US6. Opened from a "was removed" system notice, or from the sign-in screen when the account
 * is suspended. Each card says what happened; one not appealed yet has a box (≤ 1000 characters)
 * and Send. After sending it shows the appeal's state. A suspended listener has no session, so the
 * calls carry the token the suspension answer gave (src/social/appeals-api.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Card } from '@/ui/kit/Card';
import { Button } from '@/ui/kit/Button';
import { Loader } from '@/ui/kit/Loader';
import { useColours } from '@/ui/kit/useColours';
import { shortDate } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { APPEAL_TOKEN_KEY } from '@/social/context';
import { ApiError } from '@/social/api';
import { APPEAL_TEXT_MAX, appealLine, useAppealsApi, type Appealable } from '@/social/appeals-api';

export default function AppealScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const token = useCallback(() => stores.settings.get(APPEAL_TOKEN_KEY) || undefined, [stores]);
  const api = useAppealsApi(token);
  const [items, setItems] = useState<Appealable[] | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | undefined>(undefined);
  const load = useCallback(async () => {
    try { setItems(await api.list()); setFailed(undefined); }
    catch (e) { setItems([]); setFailed(e instanceof ApiError && e.code === 'unauthenticated' ? 'Sign in to see what you can appeal.' : "Couldn't load your appeals. Try again later."); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);
  const send = async (a: Appealable) => {
    const text = (texts[a.actionId] ?? '').trim();
    if (!text) return;
    setBusy(a.actionId);
    try { await api.send(a.actionId, text); toast('Appeal sent.'); await load(); }
    catch (e) { toast(e instanceof ApiError && e.code === 'conflict' ? 'You already appealed this.' : "Couldn't send. Try again."); }
    finally { setBusy(undefined); }
  };
  return (
    <>
      <PageHeader title="Appeal" />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-gap pb-24 gap-row flex-grow">
        <Text className="text-body text-muted">Tell us why we should look again. You can appeal each decision once.</Text>
        {items === undefined ? <Loader /> : null}
        {failed ? <Text className="text-body text-accent">{failed}</Text> : null}
        {items !== undefined && items.length === 0 && !failed ? <EmptyPicture icon="shield-checkmark-outline" line="Nothing to appeal" /> : null}
        {(items ?? []).map((a) => (
          <Card key={a.actionId} className="gap-gap py-row">
            <Text className="text-body font-bold text-text">{a.what}</Text>
            <Text className="text-xs text-muted">{shortDate(Date.parse(a.at))} · {appealLine(a)}</Text>
            {a.appeal ? null : (
              <>
                <Textarea className="bg-surface border border-border rounded-row min-h-24 h-auto">
                  <TextareaInput
                    placeholderTextColor={c.muted} className="p-3 align-top text-body text-text" placeholder="Why should we look again?"
                    value={texts[a.actionId] ?? ''} onChangeText={(t) => setTexts((x) => ({ ...x, [a.actionId]: t.slice(0, APPEAL_TEXT_MAX) }))}
                    multiline maxLength={APPEAL_TEXT_MAX} accessibilityLabel={`Your appeal: ${a.what}`}
                  />
                </Textarea>
                <Text className="text-muted text-xs text-right">{(texts[a.actionId] ?? '').length} / {APPEAL_TEXT_MAX}</Text>
                <Button label="Send appeal" onPress={() => { void send(a); }} busy={busy === a.actionId} disabled={busy !== undefined || !(texts[a.actionId] ?? '').trim()} />
              </>
            )}
          </Card>
        ))}
      </ScrollView>
    </>
  );
}
