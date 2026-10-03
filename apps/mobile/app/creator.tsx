/**
 * Creator centre (创作者中心, M10b US8). Nothing is uploaded — SocialNet never hosts audio
 * (Principle V). A creator claims the show they already publish: they get a code, put it
 * anywhere in their feed (the show description is easiest), and tap Verify; the server
 * re-reads the feed from the publisher and looks for it. Once proven, the page shows the
 * show's numbers and their comments carry a Host mark.
 *
 * M17 T075 (`Creator-B`): the Editorial page — a small centred title in the bar; each claimed
 * show as a white card (large artwork, serif name, the steps, the code as a big serif, Share code
 * and Verify pills); the explanation; "Claim a show" as a serif heading over a row of show cards
 * that scrolls sideways (artwork, name, "Claim" in the accent); the feed address in a pill field;
 * Get my code; and the Creator academy link as a card at the end. Same actions, same handlers.
 */
import { Icon } from '../src/ui/Icon';
import { Link } from '../src/design/tailwind';
import { Artwork } from '../src/ui/Artwork';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { Input, InputField } from '../src/ui/lib/input';
import { Pressable } from '../src/ui/lib/pressable';
import { ScrollView } from '../src/ui/lib/scroll-view';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { hit } from '../src/design';
import type { CreatorClaim, ShowStats } from '../src/social/api';
import { useSocial } from '../src/social/context';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { Eyebrow } from '../src/ui/Eyebrow';
import { mmss } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { plural } from '@socialmorning/social-core';
import { PageHeader } from '../src/ui/PageHeader';
import { useSharePanel } from '../src/ui/ShareChooser';

const TAP = { minHeight: hit.min };
/** A show card in the sideways "Claim a show" row. */
const SHOW_ART = 132;
const SHOW_CARD = { width: SHOW_ART, minHeight: hit.min };

/** `Creator-B`: the page's name small and centred in the bar, not the big serif title. */
function Title(): React.ReactElement {
  return <Text className="flex-1 text-center text-text text-sm font-bold" accessibilityRole="header">Creator centre</Text>;
}

export default function CreatorScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const { api, listener } = useSocial();
  const [claims, setClaims] = useState<CreatorClaim[] | undefined>();
  const [feedUrl, setFeedUrl] = useState('');
  const [note, setNote] = useState<string | undefined>();
  const [stats, setStats] = useState<Record<string, ShowStats>>({});
  const [busy, setBusy] = useState(false);
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();

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

  if (!listener) return <><PageHeader middle={<Title />} /><Box className="flex-1 bg-background"><EmptyPicture icon="mic-outline" line="Sign in to claim your show" /></Box></>;

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
    <>
    <PageHeader middle={<Title />} />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="pt-row pb-24 gap-section" keyboardShouldPersistTaps="handled">
      {(claims ?? []).map((cl) => (
        <Card key={cl.id} className="mx-screen-x py-section gap-row">
          {/* M12 FR-098: the claimed show as a card — its artwork beside its name. */}
          <Box className="flex-row items-end gap-row">
            <Artwork url={stores.feeds.getShow(cl.feedUrl)?.imageUrl} size={96} name={stores.feeds.getShow(cl.feedUrl)?.title} />
            <Text className="text-text text-lg font-display flex-1" numberOfLines={3}>{stores.feeds.getShow(cl.feedUrl)?.title ?? cl.feedUrl}</Text>
          </Box>
          {cl.status === 'proven' ? (
            <ProvenStats stats={stats[cl.feedUrl]} />
          ) : (
            <>
              <Text className="text-muted text-meta">1. Copy this code. 2. Put it anywhere in your show description, in your hosting service. 3. Tap Verify.</Text>
              <Text selectable className="text-text text-display font-display" accessibilityLabel={`Your code: ${cl.code}`}>{cl.code}</Text>
              <Box className="flex-row gap-row">
                <Button kind="secondary" label="Share code" onPress={() => share({ heading: 'Share your code', more: { detail: 'other apps', run: () => void Share.share({ message: cl.code }) } })} className="flex-1" />
                <Button label="Verify" onPress={() => void verify(cl)} disabled={busy} className="flex-1" />
              </Box>
            </>
          )}
        </Card>
      ))}

      {note ? <Text className="px-screen-x text-accent text-body" accessibilityLiveRegion="polite">{note}</Text> : null}

      <Text className="px-screen-x text-muted text-body">Claim the show you publish. We never host your audio — you keep your own feed. Once you prove it is yours, you see your show's numbers and your comments carry a Host mark.</Text>

      <Box className="gap-row">
        <Text className="px-screen-x text-text text-base font-display" accessibilityRole="header">Claim a show</Text>
        {subscribed.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-screen-x gap-row">
            {subscribed.map((s) => (
              <Pressable key={s.feedUrl} onPress={() => void claim(s.feedUrl)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Claim ${s.title}`} className="gap-1" style={SHOW_CARD}>
                <Artwork url={s.imageUrl} size={SHOW_ART} name={s.title} />
                <Text className="text-text text-meta font-bold mt-1" numberOfLines={2}>{s.title}</Text>
                <Text className="text-accent text-xs font-bold">Claim</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Box className="px-screen-x gap-row">
          <Input className="bg-surface border border-border rounded-pill h-auto px-0">
            <InputField value={feedUrl} onChangeText={setFeedUrl} placeholder="Or paste your feed address (RSS)" placeholderTextColor={c.muted}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url" style={TAP} accessibilityLabel="Your feed address"  className="px-section text-text text-body" />
          </Input>
          <Button label="Get my code" onPress={() => void claim(feedUrl)} disabled={busy || !/^https?:\/\/\S+$/.test(feedUrl.trim())} />
        </Box>
      </Box>

      {/* M12 FR-103: the Creator academy link — at the end of the page in `Creator-B`, as a card
          like the claimed shows above. */}
      <Link href="/academy" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Creator academy: how claiming, numbers, comments, clips and the Studio work" className="mx-screen-x bg-surface border border-border rounded-row p-section flex-row items-center gap-row" style={TAP}>
          <Box className="w-10 h-10 rounded-row bg-accentTint items-center justify-center">
            <Icon name="school-outline" size={22} color={c.accent} />
          </Box>
          <Box className="flex-1">
            <Text className="text-text text-title font-display">Creator academy</Text>
            <Text className="text-muted text-meta">Claiming, numbers, comments, clips, the Studio</Text>
          </Box>
          <Icon name="chevron-forward" size={18} color={c.muted} />
        </Pressable>
      </Link>
    </ScrollView>
    {sharePanel}
    </>
  );
}

function ProvenStats(props: { stats: ShowStats | undefined }): React.ReactElement {
  const s = props.stats;
  if (!s) return <Text className="text-muted text-body">Proven — loading your numbers…</Text>;
  return (
    <Box className="gap-1">
      <Eyebrow accent>Proven — you are the host</Eyebrow>
      <Text className="text-text text-body font-semibold">{`${s.listeners} listened · ${plural(s.comments, 'comment')} · ${plural(s.episodes, 'episode')}`}</Text>
      {s.topMoments.length > 0 ? <Text className="text-muted text-meta mt-1">Where people talk most</Text> : null}
      {s.topMoments.map((m) => (
        <Text key={m.episodeId + m.offsetMs} className="text-text text-body" numberOfLines={1}>{`${mmss(m.offsetMs)} · ${m.title} · ${m.comments}`}</Text>
      ))}
    </Box>
  );
}
