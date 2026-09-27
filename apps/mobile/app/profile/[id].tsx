/**
 * A profile (M4 US3, FR-011): name, follower/following counts, stats (hidden when the
 * listener is private and it is not you), recent public activity, Follow.
 * M6: Report and Block; a listener you blocked shows "You blocked this listener · Unblock";
 * a suspended account says so; a profile you reported is hidden for you.
 * M10 (owner, 2026-09-27): the reference's layout; your own profile adds subscriptions,
 * stickers and what you played recently (this phone's positions).
 */
import { useCallback, useState } from 'react';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { colour } from '../../src/design';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { Loader } from '../../src/ui/Loader';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { useSafety } from '../../src/safety/context';
import { FollowButton } from '../../src/ui/FollowButton';
import { BlockButton } from '../../src/ui/BlockButton';
import { hms } from '../../src/ui/StatsBlock';
import { Artwork } from '../../src/ui/Artwork';
import { countryName } from '../../src/ui/country';
import { useStores } from '../../src/ui/providers';
import { listeningHistory } from '../../src/me/history';
import { listMoments } from '../../src/me/moments';
import { latestEarned, stickers } from '../../src/me/stickers';
import { FeedItem } from '../../src/ui/FeedItem';
import { Placeholder } from '../../src/ui/Placeholder';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { Pressable } from '../../src/ui/lib/pressable';
import { ApiError, type FeedItem as Item, type Profile } from '../../src/social/api';
import { EmptyState } from '../../src/ui/EmptyState';

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const { safety, version, feed } = useSafety();
  const stores = useStores();
  const c = useColours(stores.settings);
  const [profile, setProfile] = useState<Profile | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  useFocusEffect(useCallback(() => {
    let live = true;
    api.profile(String(id)).then((p) => { if (live) { setProfile(p); setError(undefined); } }).catch((e) => { if (live) setError(e instanceof ApiError ? (e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e)); });
    return () => { live = false; };
  }, [api, id, version]));
  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id } });
  };
  if (error) return <Box className="p-4 gap-3"><Text className="text-text">{error}</Text></Box>;
  if (!profile) return <Box className="p-4 items-center"><Loader /></Box>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  if (profile.suspended) {
    return <Box className="p-4 gap-3"><Text className="text-lg font-semibold text-text">{profile.displayName}</Text><Text className="text-muted">This account is suspended.</Text></Box>;
  }
  if (blocked || reported) {
    return (
      <Box className="p-4 gap-3">
        <Text className="text-lg font-semibold text-text">{profile.displayName}</Text>
        {reported ? <Placeholder kind="reported" /> : <Text className="text-muted">You blocked this listener.</Text>}
        {blocked ? <BlockButton listenerId={profile.id} displayName={profile.displayName} /> : null}
      </Box>
    );
  }
  const all = profile.stats?.all;
  const history = own ? listeningHistory(stores, 5) : [];
  const earned = own ? stickers({ listenedMs: all?.listenedMs ?? 0, finished: all?.finished ?? 0, moments: listMoments(stores.settings).length, comments: profile.recent.filter((r) => r.kind === 'commented').length }) : [];
  const latest = latestEarned(earned);
  const h = Math.floor((all?.listenedMs ?? 0) / 3_600_000);
  const m = Math.floor(((all?.listenedMs ?? 0) % 3_600_000) / 60_000);
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-section pb-24">
      {/* M10 (owner, 2026-09-27): laid out after the reference — big name, avatar, counts,
          a listening-time card, stickers, then recent listens. */}
      <Box className="flex-row items-start justify-between">
        <Box className="flex-1 pr-row">
          <Text className="text-text text-lg font-bold" accessibilityRole="header">{profile.displayName}</Text>
          {own ? <Text className="text-muted text-xs mt-1">This is you</Text> : null}
          {/* M10b US7: "IP location" — the country from the last sign-in, public (the privacy policy says so). */}
          {profile.country ? <Text className="text-muted text-xs mt-1">{`IP location: ${countryName(profile.country)}`}</Text> : null}
        </Box>
        <Box className="items-end gap-row">
          <Box className="w-20 h-20 rounded-pill bg-surface items-center justify-center" accessible={false}>
            <Text className="text-muted text-lg">{profile.displayName.slice(0, 1).toUpperCase()}</Text>
          </Box>
          {own ? <Link href="/account" className="text-accent text-sm" accessibilityRole="link">Edit profile</Link> : null}
        </Box>
      </Box>

      <Box className="flex-row gap-section mt-section">
        {/* Counts and names are links but not actions (owner's K1 note, 2026-09-25). */}
        <Link href={{ pathname: '/profile/[id]/following', params: { id: profile.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${profile.following} following`}><Text className="text-text text-lg font-bold">{profile.following}</Text><Text className="text-muted text-xs">Following</Text></Pressable>
        </Link>
        <Link href={{ pathname: '/profile/[id]/followers', params: { id: profile.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${profile.followers} follower${profile.followers === 1 ? '' : 's'}`}><Text className="text-text text-lg font-bold">{profile.followers}</Text><Text className="text-muted text-xs">Followers</Text></Pressable>
        </Link>
        {own ? (
          <Link href="/subscriptions" asChild>
            <Pressable accessibilityRole="link" accessibilityLabel={`${stores.subscriptions.list().length} subscriptions`}><Text className="text-text text-lg font-bold">{stores.subscriptions.list().length}</Text><Text className="text-muted text-xs">Subscriptions</Text></Pressable>
          </Link>
        ) : null}
      </Box>

      {!own ? (
        <Box className="flex-row gap-4 items-center flex-wrap mt-section">
          <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
          <BlockButton listenerId={profile.id} displayName={profile.displayName} />
          <Pressable onPress={() => setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${profile.displayName}`} className="py-2 min-h-[44px] justify-center">
            <Text className="text-muted">Report</Text>
          </Pressable>
        </Box>
      ) : null}

      <Text className="text-text text-base font-bold mt-section mb-row" accessibilityRole="header">Listening time</Text>
      {/* M6 (FR-019): the stats surface is the numbers, not the activity list below it. */}
      {profile.stats === null ? (
        <Text className="text-muted text-sm">{own ? 'Your listening is private.' : 'Listening is private.'}</Text>
      ) : all && all.listenedMs === 0 && all.finished === 0 ? (
        <EmptyState surface="stats" />
      ) : (
        <Box className="bg-surface rounded-artwork p-section" accessible accessibilityLabel={`Total listening time ${h} hours ${m} minutes`}>
          <Text className="text-text text-lg font-bold">{h}<Text className="text-muted text-xs font-normal"> h </Text>{m}<Text className="text-muted text-xs font-normal"> min</Text></Text>
          <Text className="text-muted text-xs">Total listening time · {all?.finished ?? 0} finished</Text>
          {profile.stats.last7.listenedMs > 0 ? <Text className="text-muted text-xs mt-1">This week: {hms(profile.stats.last7.listenedMs)}</Text> : null}
        </Box>
      )}

      {own ? (
        <>
          <Text className="text-text text-base font-bold mt-section mb-row" accessibilityRole="header">My stickers</Text>
          <Link href="/stickers" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`${earned.filter((x) => x.earned).length} stickers`} className="bg-surface rounded-artwork p-section flex-row items-center justify-between">
              <Box>
                <Text className="text-text text-sm font-bold">{earned.filter((x) => x.earned).length} stickers ›</Text>
                <Text className="text-muted text-xs">{latest ? `Latest: ${latest.title}` : 'Listen for an hour to earn the first'}</Text>
              </Box>
              <Box className="flex-row gap-1">{earned.filter((x) => x.earned).slice(-3).map((x) => <Icon key={x.id} name={x.icon} size={22} color={c.text} />)}</Box>
            </Pressable>
          </Link>
        </>
      ) : null}

      <Text className="text-text text-base font-bold mt-section mb-row" accessibilityRole="header">{own ? 'Recently played' : 'Recent'}</Text>
      {own
        ? (history.length === 0 ? <Text className="text-muted text-sm">Nothing played yet.</Text> : history.map((r) => (
            <Link key={r.episode.id} href={{ pathname: '/episode/[id]', params: { id: r.episode.id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={r.episode.title} className="flex-row gap-row py-row items-center">
                <Artwork url={r.episode.imageUrl ?? stores.feeds.getShow(r.episode.feedUrl)?.imageUrl} size={64} rounded="row" />
                <Box className="flex-1">
                  <Text className="text-text text-sm font-semibold" numberOfLines={2}>{r.episode.title}</Text>
                  <Text className="text-muted text-xs" numberOfLines={1}>{stores.feeds.getShow(r.episode.feedUrl)?.title ?? ''}{r.finished ? ' · finished' : ''}</Text>
                </Box>
              </Pressable>
            </Link>
          )))
        : (profile.recent.length === 0 ? <Text className="text-muted text-sm">Nothing public yet.</Text> : feed(profile.recent).map((item) => <FeedItem key={item.id} item={item} onOpen={open} />))}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </ScrollView>
  );
}
