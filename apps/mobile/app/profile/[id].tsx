/**
 * A profile (M4 US3, FR-011): name, follower/following counts, stats (hidden when the
 * listener is private and it is not you), recent public activity, Follow.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { FollowButton } from '../../src/ui/FollowButton';
import { StatsBlock } from '../../src/ui/StatsBlock';
import { FeedItem } from '../../src/ui/FeedItem';
import { ApiError, type FeedItem as Item, type Profile } from '../../src/social/api';

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const [profile, setProfile] = useState<Profile | undefined>();
  const [error, setError] = useState<string | undefined>();
  useFocusEffect(useCallback(() => {
    let live = true;
    api.profile(String(id)).then((p) => { if (live) { setProfile(p); setError(undefined); } }).catch((e) => { if (live) setError(e instanceof ApiError ? (e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e)); });
    return () => { live = false; };
  }, [api, id]));
  const open = (item: Item) => {
    if (item.kind === 'clipped' && item.refId) router.push({ pathname: '/clip/[id]', params: { id: item.refId } });
    else router.push({ pathname: '/episode/[id]', params: { id: item.episode.id } });
  };
  if (error) return <View style={styles.body}><Text>{error}</Text></View>;
  if (!profile) return <View style={styles.body}><Text style={styles.muted}>Loading…</Text></View>;
  const own = listener?.listenerId === profile.id;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.name}>{profile.displayName}{own ? ' (you)' : ''}</Text>
      <View style={styles.row}>
        <Link href={{ pathname: '/profile/[id]/followers', params: { id: profile.id } }} style={styles.link}>{`${profile.followers} followers`}</Link>
        <Link href={{ pathname: '/profile/[id]/following', params: { id: profile.id } }} style={styles.link}>{`${profile.following} following`}</Link>
      </View>
      <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
      <StatsBlock stats={profile.stats} own={own} />
      <Text style={styles.h2}>Recent</Text>
      {profile.recent.length === 0 ? <Text style={styles.muted}>Nothing public yet.</Text> : profile.recent.map((item) => <FeedItem key={item.id} item={item} onOpen={open} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  name: { fontSize: 24, fontWeight: '600' },
  h2: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  row: { flexDirection: 'row', gap: 16 },
  link: { color: '#1a4fd6' },
  muted: { color: '#666' },
});
