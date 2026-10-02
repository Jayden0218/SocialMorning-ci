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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Link } from '../../src/design/tailwind';
import { useSocial } from '../../src/social/context';
import { useSafety } from '../../src/safety/context';
import { FollowButton } from '../../src/ui/FollowButton';
import { BlockButton } from '../../src/ui/BlockButton';
import { hms } from '../../src/ui/StatsBlock';
import { Artwork } from '../../src/ui/Artwork';
import { countryName } from '../../src/ui/country';
import { useStores } from '../../src/ui/providers';
import { listeningHistory } from '../../src/me/history';
import { latestEarned } from '../../src/me/stickers';
import { myStickers, myTotals } from '../../src/me/my-stickers';
import { PageHeader } from '../../src/ui/PageHeader';
import { FeedItem } from '../../src/ui/FeedItem';
import { Placeholder } from '../../src/ui/Placeholder';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { Pressable } from '../../src/ui/lib/pressable';
import { ApiError, type FeedItem as Item, type Profile } from '../../src/social/api';
import { EmptyState } from '../../src/ui/EmptyState';
import { plural } from '@socialmorning/social-core';
import { ProfileStatRow, listenedLabel, type StatCell } from '../../src/ui/ProfileStatRow';

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
  const header = <PageHeader title="Profile" />;
  if (error) return <>{header}<Box className="p-4 gap-3"><Text className="text-text">{error}</Text></Box></>;
  if (!profile) return <>{header}<Box className="p-4 items-center"><Loader /></Box></>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  if (profile.suspended) {
    return <>{header}<Box className="p-4 gap-3"><Text className="text-lg font-semibold text-text">{profile.displayName}</Text><Text className="text-muted">This account is suspended.</Text></Box></>;
  }
  if (blocked || reported) {
    return (
      <>
      {header}
      <Box className="p-4 gap-3">
        <Text className="text-lg font-semibold text-text">{profile.displayName}</Text>
        {reported ? <Placeholder kind="reported" /> : <Text className="text-muted">You blocked this listener.</Text>}
        {blocked ? <BlockButton listenerId={profile.id} displayName={profile.displayName} /> : null}
      </Box>
      </>
    );
  }
  // M12 FR-006 (B6): your own totals are at least what this phone has recorded. M16a bug 3: the
  // Stickers page reads the same two functions (src/me/my-stickers.ts), so the numbers agree.
  const server = profile.stats?.all;
  const all = own && server ? { ...server, ...myTotals(stores, server) } : server;
  const history = own ? listeningHistory(stores, 5) : [];
  const earned = own ? myStickers(stores, profile) : [];
  const latest = latestEarned(earned);
  const subs = own ? stores.subscriptions.list().length : undefined;
  const time = listenedLabel(profile.stats === null ? undefined : all?.listenedMs ?? 0);
  const statCells: StatCell[] = [
    { key: 'following', value: String(profile.following), label: 'Following', spoken: `${profile.following} following`, href: { pathname: '/profile/[id]/following', params: { id: profile.id, name: profile.displayName } } },
    { key: 'followers', value: String(profile.followers), label: 'Followers', spoken: plural(profile.followers, 'follower'), href: { pathname: '/profile/[id]/followers', params: { id: profile.id, name: profile.displayName } } },
    ...(subs !== undefined ? [{ key: 'subs', value: String(subs), label: 'Subscriptions', spoken: plural(subs, 'subscription'), href: '/subscriptions' }] : []),
    { key: 'time', value: time.value, label: 'Listened', spoken: time.spoken },
  ];
  const h = Math.floor((all?.listenedMs ?? 0) / 3_600_000);
  const m = Math.floor(((all?.listenedMs ?? 0) % 3_600_000) / 60_000);
  return (
    <>
    {header}
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

      {/* M12 FR-064: four numbers in one row — the listening time moved up from the card. */}
      <ProfileStatRow cells={statCells} />

      {!own ? (
        <Box className="flex-row gap-4 items-center flex-wrap mt-section">
          <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
          <BlockButton listenerId={profile.id} displayName={profile.displayName} />
          <Pressable onPress={() => setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${profile.displayName}`} className="py-2 min-h-12 justify-center">
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
          {/* M12 FR-065: the stickers themselves, not a count — earned ones in colour, the next
              ones faint, so there is something to see from the first day. */}
          <Link href="/stickers" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel={`My stickers: ${plural(earned.filter((x) => x.earned).length, 'sticker')} earned${latest ? `, latest ${latest.title}` : ''}. Open all stickers`} className="bg-surface rounded-artwork p-section">
              <Box className="flex-row gap-row">
                {[...earned.filter((x) => x.earned).reverse(), ...earned.filter((x) => !x.earned)].slice(0, 5).map((x) => (
                  <Box key={x.id} className="flex-1 items-center gap-1">
                    <Box className={`w-12 h-12 rounded-pill items-center justify-center ${x.earned ? 'bg-accentTint' : 'bg-background'}`}>
                      <Icon name={x.icon} size={24} color={x.earned ? c.accent : c.muted} />
                    </Box>
                    <Text className={x.earned ? 'text-text text-xs text-center' : 'text-muted text-xs text-center'} numberOfLines={2}>{x.title}</Text>
                  </Box>
                ))}
              </Box>
              <Text className="text-muted text-xs mt-row">{latest ? `Latest: ${latest.title} · all stickers ›` : 'Listen for an hour to earn the first · all stickers ›'}</Text>
            </Pressable>
          </Link>
        </>
      ) : null}

      <Text className="text-text text-base font-bold mt-section mb-row" accessibilityRole="header">{own ? 'Recently played' : 'Recent'}</Text>
      {own
        ? (history.length === 0 ? <Text className="text-muted text-sm">Nothing played yet.</Text> : history.map((r) => (
            <Link key={r.episode.id} href={{ pathname: '/episode/[id]', params: { id: r.episode.id } }} asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={r.episode.title} className="flex-row gap-row py-row items-center">
                <Artwork url={r.episode.imageUrl ?? stores.feeds.getShow(r.episode.feedUrl)?.imageUrl} size={64} rounded="row" name={stores.feeds.getShow(r.episode.feedUrl)?.title} />
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
    </>
  );
}
