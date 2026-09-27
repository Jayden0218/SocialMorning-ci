/** Follow / Following (M4 FR-007): optimistic, reverts on a refusal, hidden on your own profile. */
import { useState } from 'react';
import { Button, ButtonText } from './lib/button';
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
    // M9 (T031): gluestack's Button — solid when following, outlined when not.
    <Button
      variant={following ? 'default' : 'outline'}
      className={`rounded-3xl px-[18px] py-2 self-start min-h-[44px] ${following ? 'border border-primary' : 'bg-transparent'}`}
      isDisabled={busy}
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
      <ButtonText className={following ? 'font-semibold text-onPrimary' : 'font-semibold text-text'}>{following ? 'Following' : 'Follow'}</ButtonText>
    </Button>
  );
}

