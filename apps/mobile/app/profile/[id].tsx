/**
 * A profile (M4 US3, FR-011): name, follower/following counts, stats (hidden when the
 * listener is private and it is not you), recent public activity, Follow.
 * M6: Report and Block; a listener you blocked shows "You blocked this listener · Unblock";
 * a suspended account says so; a profile you reported is hidden for you.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { useSafety } from '../../src/safety/context';
import { FollowButton } from '../../src/ui/FollowButton';
import { BlockButton } from '../../src/ui/BlockButton';
import { StatsBlock } from '../../src/ui/StatsBlock';
import { FeedItem } from '../../src/ui/FeedItem';
import { Placeholder } from '../../src/ui/Placeholder';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { Pressable } from 'react-native';
import { ApiError, type FeedItem as Item, type Profile } from '../../src/social/api';
import { EmptyState } from '../../src/ui/EmptyState';

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const { safety, version, feed } = useSafety();
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
  if (error) return <View className="p-4 gap-3"><Text>{error}</Text></View>;
  if (!profile) return <View className="p-4 gap-3"><Text className="text-muted">Loading…</Text></View>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  if (profile.suspended) {
    return <View className="p-4 gap-3"><Text className="text-lg font-semibold text-text">{profile.displayName}</Text><Text className="text-muted">This account is suspended.</Text></View>;
  }
  if (blocked || reported) {
    return (
      <View className="p-4 gap-3">
        <Text className="text-lg font-semibold text-text">{profile.displayName}</Text>
        {reported ? <Placeholder kind="reported" /> : <Text className="text-muted">You blocked this listener.</Text>}
        {blocked ? <BlockButton listenerId={profile.id} displayName={profile.displayName} /> : null}
      </View>
    );
  }
  return (
    <ScrollView contentContainerClassName="p-4 gap-3">
      <Text className="text-lg font-semibold text-text" accessibilityRole="header">{profile.displayName}{own ? ' (you)' : ''}</Text>
      <View className="flex-row gap-4 items-center flex-wrap">
        {/* Counts and names are links but not actions. Six accent words on one screen read
            as six warnings (owner's K1 note, 2026-09-25). */}
        <Link href={{ pathname: '/profile/[id]/followers', params: { id: profile.id } }} className="text-text" accessibilityRole="link">{`${profile.followers} followers`}</Link>
        <Link href={{ pathname: '/profile/[id]/following', params: { id: profile.id } }} className="text-text" accessibilityRole="link">{`${profile.following} following`}</Link>
      </View>
      {!own ? (
        <View className="flex-row gap-4 items-center flex-wrap">
          <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
          <BlockButton listenerId={profile.id} displayName={profile.displayName} />
          <Pressable onPress={() => setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${profile.displayName}`} className="py-2 min-h-[44px] justify-center">
            <Text className="text-muted">Report</Text>
          </Pressable>
        </View>
      ) : null}
      {/* M6 (FR-019): the stats surface is the numbers, not the activity list below it. */}
      {profile.stats !== null && profile.stats.all.listenedMs === 0 && profile.stats.all.finished === 0
        ? <EmptyState surface="stats" />
        : <StatsBlock stats={profile.stats} own={own} />}
      <Text className="text-[18px] font-semibold mt-2 text-text" accessibilityRole="header">Recent</Text>
      {profile.recent.length === 0 ? <Text className="text-muted">Nothing public yet.</Text> : feed(profile.recent).map((item) => <FeedItem key={item.id} item={item} onOpen={open} />)}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </ScrollView>
  );
}
