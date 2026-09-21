/** Follow / Following (M4 FR-007): optimistic, reverts on a refusal, hidden on your own profile. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useSocial } from '../social/context';
import { useToast } from './providers';
import { ApiError } from '../social/api';

export function FollowButton(props: { listenerId: string; following: boolean; onChange?: (following: boolean) => void }): React.ReactElement | null {
  const { api, listener } = useSocial();
  const toast = useToast();
  const [following, setFollowing] = useState(props.following);
  const [busy, setBusy] = useState(false);
  if (listener?.listenerId === props.listenerId) return null;
  return (
    <Pressable
      style={[styles.btn, following && styles.on]}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
      onPress={async () => {
        if (!listener) { router.push('/auth/sign-in'); return; }
        const next = !following;
        setFollowing(next); setBusy(true);
        try {
          if (next) await api.follow(props.listenerId); else await api.unfollow(props.listenerId);
          props.onChange?.(next);
        } catch (e) {
          setFollowing(!next);
          toast(e instanceof ApiError && e.code === 'network' ? "Couldn't reach the server." : e instanceof ApiError ? e.message : 'Something went wrong.');
        } finally { setBusy(false); }
      }}
    >
      <Text style={[styles.text, following && styles.textOn]}>{following ? 'Following' : 'Follow'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { borderWidth: 1, borderColor: '#111', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 8, alignSelf: 'flex-start' },
  on: { backgroundColor: '#111' },
  text: { fontWeight: '600' },
  textOn: { color: '#fff' },
});
