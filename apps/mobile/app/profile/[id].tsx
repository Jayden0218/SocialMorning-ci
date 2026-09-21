/** A profile (M4 US3; a stub with name, counts and Follow until T028 adds stats and activity). */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { FollowButton } from '../../src/ui/FollowButton';
import { ApiError, type Profile } from '../../src/social/api';

export default function ProfileScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const [profile, setProfile] = useState<Profile | undefined>();
  const [error, setError] = useState<string | undefined>();
  useFocusEffect(useCallback(() => {
    let live = true;
    api.profile(String(id)).then((p) => { if (live) { setProfile(p); setError(undefined); } }).catch((e) => { if (live) setError(e instanceof ApiError ? e.message : String(e)); });
    return () => { live = false; };
  }, [api, id]));
  if (error) return <View style={styles.body}><Text>{error}</Text></View>;
  if (!profile) return <View style={styles.body}><Text style={styles.muted}>Loading…</Text></View>;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.name}>{profile.displayName}</Text>
      <View style={styles.row}>
        <Link href={{ pathname: '/profile/[id]/followers', params: { id: profile.id } }} style={styles.link}>{`${profile.followers} followers`}</Link>
        <Link href={{ pathname: '/profile/[id]/following', params: { id: profile.id } }} style={styles.link}>{`${profile.following} following`}</Link>
      </View>
      <FollowButton listenerId={profile.id} following={profile.isFollowing} onChange={(f) => setProfile({ ...profile, isFollowing: f, followers: profile.followers + (f ? 1 : -1) })} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  name: { fontSize: 24, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 16 },
  link: { color: '#1a4fd6' },
  muted: { color: '#666' },
});
