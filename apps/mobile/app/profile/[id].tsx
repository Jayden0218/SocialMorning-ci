/**
 * A profile (M4 US3, FR-011): name, follower/following counts, stats (hidden when the
 * listener is private and it is not you), recent public activity, Follow.
 * M6: Report and Block; a listener you blocked shows "You blocked this listener · Unblock";
 * a suspended account says so; a profile you reported is hidden for you.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  if (error) return <View style={styles.body}><Text>{error}</Text></View>;
  if (!profile) return <View style={styles.body}><Text style={styles.muted}>Loading…</Text></View>;
  const own = listener?.listenerId === profile.id;
  const blocked = !own && safety.isBlocked(profile.id);
  const reported = !own && safety.isHidden('profile', profile.id);
  if (profile.suspended) {
    return <View style={styles.body}><Text style={styles.name}>{profile.displayName}</Text><Text style={styles.muted}>This account is suspended.</Text></View>;
  }
  if (blocked || reported) {
    return (
      <View style={styles.body}>
        <Text style={styles.name}>{profile.displayName}</Text>
        {reported ? <Placeholder kind="reported" /> : <Text style={styles.muted}>You blocked this listener.</Text>}
        {blocked ? <BlockButton listenerId={profile.id} displayName={profile.displayName} /> : null}
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.name} accessibilityRole="header">{profile.displayName}{own ? ' (you)' : ''}</Text>
      <View style={styles.row}>
        <Link href={{ pathname: '/profile/[id]/followers', params: { id: profile.id } }} style={styles.link}>{`${profile.followers} followers`}</Link>
        <Link href={{ pathname: '/profile/[id]/following', params: { id: profile.id } }} style={styles.link}>{`${profile.following} following`}</Link>
      </View>
      {!own ? (
        <View style={styles.row}>
          <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
          <BlockButton listenerId={profile.id} displayName={profile.displayName} />
          <Pressable onPress={() => setReporting({ kind: 'profile', id: profile.id, authorId: profile.id, label: 'profile' })} accessibilityRole="button" accessibilityLabel={`Report ${profile.displayName}`} style={styles.btn}>
            <Text style={styles.muted}>Report</Text>
          </Pressable>
        </View>
      ) : null}
      <StatsBlock stats={profile.stats} own={own} />
      <Text style={styles.h2} accessibilityRole="header">Recent</Text>
      {profile.recent.length === 0 ? <Text style={styles.muted}>Nothing public yet.</Text> : feed(profile.recent).map((item) => <FeedItem key={item.id} item={item} onOpen={open} />)}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  name: { fontSize: 24, fontWeight: '600' },
  h2: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  link: { color: '#1a4fd6' },
  muted: { color: '#666' },
  btn: { paddingVertical: 8, minHeight: 44, justifyContent: 'center' },
});
