/**
 * Creator centre (创作者中心, M10b US8). Nothing is uploaded — SocialNet never hosts audio
 * (Principle V). A creator claims the show they already publish: they get a code, put it
 * anywhere in their feed (the show description is easiest), and tap Verify; the server
 * re-reads the feed from the publisher and looks for it. Once proven, the page shows the
 * show's numbers and their comments carry a Host mark.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { hit } from '../src/design';
import type { CreatorClaim, ShowStats } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { Button } from '../src/ui/Button';
import { mmss } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';

const TAP = { minHeight: hit.min };

export default function CreatorScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  const [claims, setClaims] = useState<CreatorClaim[] | undefined>();
  const [feedUrl, setFeedUrl] = useState('');
  const [note, setNote] = useState<string | undefined>();
  const [stats, setStats] = useState<Record<string, ShowStats>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!listener) { setClaims([]); return () => undefined; }
    let live = true;
    api.creatorClaims().then((r) => {
      if (!live) return;
      setClaims(r);
      for (const cl of r.filter((x) => x.status === 'proven')) {
        void api.creatorStats(cl.feedUrl).then((s) => { if (live) setStats((cur) => ({ ...cur, [cl.feedUrl]: s })); }, () => undefined);
      }
    }, () => { if (live) { setClaims([]); setNote("Couldn't load your shows"); } });
    return () => { live = false; };
  }, [api, listener]);
  useFocusEffect(load);

  if (!listener) return <View className="flex-1 bg-background"><EmptyPicture icon="mic-outline" line="Sign in to claim your show" /></View>;

  const claim = async (url: string) => {
    setBusy(true); setNote(undefined);
    try {
      const made = await api.creatorClaim(url.trim());
      setClaims((cur) => [made, ...(cur ?? []).filter((x) => x.id !== made.id)]);
      setFeedUrl('');
    } catch { setNote('That is not a feed address (it starts with https://).'); }
    setBusy(false);
  };
  const verify = async (cl: CreatorClaim) => {
    setBusy(true); setNote(undefined);
    try {
      const r = await api.creatorVerify(cl.id);
      if (r === 'taken') setNote('Someone else has already proven this show.');
      else if (r.status === 'pending') setNote('The code is not in your feed yet. Feeds can take a few minutes to update — try again soon.');
      else load();
    } catch { setNote("Couldn't reach your feed. Try again."); }
    setBusy(false);
  };

  const subscribed = stores.subscriptions.list().map((s) => stores.feeds.getShow(s.feedUrl)).filter((s) => s !== undefined)
    .filter((s) => !(claims ?? []).some((cl) => cl.feedUrl === s.feedUrl)).slice(0, 5);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x py-row pb-24 gap-section" keyboardShouldPersistTaps="handled">
      <Text className="text-muted text-sm">Claim the show you publish. We never host your audio — you keep your own feed. Once you prove it is yours, you see your show's numbers and your comments carry a Host mark.</Text>

      {(claims ?? []).map((cl) => (
        <View key={cl.id} className="bg-surface rounded-artwork p-section gap-row">
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>{stores.feeds.getShow(cl.feedUrl)?.title ?? cl.feedUrl}</Text>
          {cl.status === 'proven' ? (
            <ProvenStats stats={stats[cl.feedUrl]} />
          ) : (
            <>
              <Text className="text-muted text-sm">1. Copy this code. 2. Put it anywhere in your show description, in your hosting service. 3. Tap Verify.</Text>
              <Text selectable className="text-text text-base font-bold" accessibilityLabel={`Your code: ${cl.code}`}>{cl.code}</Text>
              <View className="flex-row gap-row">
                <Button kind="secondary" label="Share code" onPress={() => void Share.share({ message: cl.code })} className="flex-1" />
                <Button label="Verify" onPress={() => void verify(cl)} disabled={busy} className="flex-1" />
              </View>
            </>
          )}
        </View>
      ))}

      {note ? <Text className="text-accent text-sm" accessibilityLiveRegion="polite">{note}</Text> : null}

      <View className="gap-row">
        <Text className="text-text text-sm font-semibold">Claim a show</Text>
        {subscribed.map((s) => (
          <Pressable key={s.feedUrl} onPress={() => void claim(s.feedUrl)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Claim ${s.title}`} className="justify-center border-b-hairline border-separator" style={TAP}>
            <Text className="text-text text-sm" numberOfLines={1}>{s.title}</Text>
          </Pressable>
        ))}
        <TextInput value={feedUrl} onChangeText={setFeedUrl} placeholder="Or paste your feed address (RSS)" placeholderTextColor={c.muted}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url"
          className="bg-surface rounded-artwork px-section text-text text-sm" style={TAP} accessibilityLabel="Your feed address" />
        <Button label="Get my code" onPress={() => void claim(feedUrl)} disabled={busy || !/^https?:\/\/\S+$/.test(feedUrl.trim())} />
      </View>
    </ScrollView>
  );
}

function ProvenStats(props: { stats: ShowStats | undefined }): React.ReactElement {
  const s = props.stats;
  if (!s) return <Text className="text-muted text-sm">Proven — loading your numbers…</Text>;
  return (
    <View className="gap-1">
      <Text className="text-accent text-xs font-bold">Proven — you are the host</Text>
      <Text className="text-text text-sm">{`${s.listeners} listened · ${s.comments} comment${s.comments === 1 ? '' : 's'} · ${s.episodes} episode${s.episodes === 1 ? '' : 's'}`}</Text>
      {s.topMoments.length > 0 ? <Text className="text-muted text-xs mt-1">Where people talk most</Text> : null}
      {s.topMoments.map((m) => (
        <Text key={m.episodeId + m.offsetMs} className="text-text text-sm" numberOfLines={1}>{`${mmss(m.offsetMs)} · ${m.title} · ${m.comments}`}</Text>
      ))}
    </View>
  );
}
