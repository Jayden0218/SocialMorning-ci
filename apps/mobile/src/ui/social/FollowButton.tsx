/**
 * Follow / Following (M4 FR-007): optimistic, reverts on a refusal, hidden on your own profile.
 * M17 (`Profile-B`): the Editorial pill — "Follow" is the yellow primary pill (the call to
 * action), "Following" the white outlined one. `className` lets a row stretch it (`flex-1`).
 */
import { useState } from 'react';
import { hit } from '@/design';
import { Button, ButtonText } from '@/ui/lib/button';
import { router } from 'expo-router';
import { useSocial } from '@/social/context';
import { useToast } from '@/ui/shell/providers';
import { ApiError } from '@/social/api';

const TAP = { minHeight: hit.min };

export function FollowButton(props: { listenerId: string; following: boolean; onChange?: (following: boolean) => void; className?: string }): React.ReactElement | null {
  const { api, listener } = useSocial();
  const toast = useToast();
  const [following, setFollowing] = useState(props.following);
  const [busy, setBusy] = useState(false);
  if (listener?.listenerId === props.listenerId) return null;
  return (
    // M9 (T031): gluestack's Button. M17: yellow to follow, outlined once following.
    <Button
      variant={following ? 'outline' : 'default'}
      className={`rounded-pill px-section justify-center items-center ${following ? 'border border-border bg-surface' : 'bg-primary'} ${props.className ?? 'self-start'}`}
      style={TAP}
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
      <ButtonText className={following ? 'text-body font-bold text-text' : 'text-body font-bold text-onPrimary'}>{following ? 'Following' : 'Follow'}</ButtonText>
    </Button>
  );
}

