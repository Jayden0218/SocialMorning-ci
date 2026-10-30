// Share some of your shows: pick two or more subscriptions, give the list a title, and share one link.
/**
 * M22 US17 item 5 (contracts/api.md "Small items"). Opened from My subscriptions ("Share some
 * shows"). The list is saved on the server (`POST /v1/me/shared-lists`) and its page,
 * `/l/<id>` on the API, lists the shows with "Open" links into the app. Signed in only.
 */
import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Input, InputField } from '@/ui/lib/input';
import { hit } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Button } from '@/ui/kit/Button';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM22DiscoverApi } from '@/social/api-m22-discover';

const TAP = { minHeight: hit.min };
const LIST_TITLE_MAX = 60;
const LIST_MIN = 2;
const LIST_MAX = 100;

export default function NewSharedList(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const api = useM22DiscoverApi();
  const { listener } = useSocial();
  const shows = useMemo(() => stores.subscriptions.list().map(({ feedUrl }) => {
    const show = stores.feeds.getShow(feedUrl);
    return { feedUrl, title: show?.title || feedUrl, imageUrl: show?.imageUrl };
  }), [stores]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('Shows I like');
  const [busy, setBusy] = useState(false);
  const toggle = (feedUrl: string) => setPicked((p) => (p.includes(feedUrl) ? p.filter((u) => u !== feedUrl) : p.length >= LIST_MAX ? p : [...p, feedUrl]));
  const ready = picked.length >= LIST_MIN && title.trim().length > 0;
  const share = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const { url } = await api.shareList(title.trim().slice(0, LIST_TITLE_MAX), picked);
      await Share.share({ message: `${title.trim()}\n${url}` });
    } catch {
      toast("Couldn't make the link — try again when you're online.");
    } finally {
      setBusy(false);
    }
  };
  if (!listener) {
    return (
      <>
        <PageHeader title="Share some shows" />
        <Box className="flex-1 bg-background px-screen-x"><Text className="text-text text-body">Sign in to share a list of shows.</Text></Box>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Share some shows" subtitle={`Pick ${LIST_MIN} or more, then share one link.`} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pb-section gap-section">
        <Eyebrow>Title</Eyebrow>
        <Input className="bg-surface border border-border rounded-row h-auto px-0">
          <InputField value={title} onChangeText={(t) => setTitle(t.slice(0, LIST_TITLE_MAX))} maxLength={LIST_TITLE_MAX} placeholder="Name your list" placeholderTextColor={c.muted} accessibilityLabel="List title" className="p-row text-text text-body" />
        </Input>
        <Text className="text-muted text-xs text-right">{title.length} / {LIST_TITLE_MAX}</Text>
        <Eyebrow>{`Shows · ${picked.length} picked`}</Eyebrow>
        {shows.length === 0 ? (
          <Text className="text-muted text-body">Subscribe to some shows first.</Text>
        ) : (
          <Card>
            {shows.map((s, i) => {
              const on = picked.includes(s.feedUrl);
              return (
                <Box key={s.feedUrl}>
                  {i > 0 ? <CardDivider /> : null}
                  <Pressable onPress={() => toggle(s.feedUrl)} accessibilityRole="checkbox" accessibilityLabel={s.title} accessibilityState={{ checked: on }} className="flex-row items-center gap-row py-row" style={TAP}>
                    <Artwork url={s.imageUrl} size={44} name={s.title} />
                    <Text className="text-text text-body flex-1" numberOfLines={2}>{s.title}</Text>
                    <Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? c.accent : c.muted} />
                  </Pressable>
                </Box>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <Box className="bg-background px-screen-x py-row border-t-hairline border-separator">
        <Button label="Share link" onPress={() => void share()} disabled={!ready} busy={busy} accessibilityLabel="Share a link to the picked shows" />
      </Box>
    </>
  );
}
