// Follow or Following button on a profile.
/**
 * Follow / Following (M4 FR-007): optimistic, reverts on a refusal, hidden on your own profile.
 * M31 W4-A (design-pulse2 social.html `profile--screen` bottom zone, `profile--more-sheet`): "Follow" is the hot 48 pill with a
 * plus ("Follow" in void words, 48 tall), "Following" the quiet raise pill; `className` lets a row stretch it (`flex-1`).
 * `compact` is the pill inside a person's tile on Followers / Following: 32 tall as drawn for a tile, its touch area brought
 * to 48 by `hitSlop`. Not drawn: the drawing's tile carries no Follow; the M21 feature stays (the action inventory's rule).
 * A refusal speaks in a toast (the server's own sentence, or "Couldn't reach the server."), the pill springs back.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { useSocial } from '@/social/context';
import { useToast } from '@/ui/shell/providers';
import { ApiError } from '@/social/api';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { PROFILE } from '@/ui/profile/measures';

const COMPACT = { height: PROFILE.followHeight };
const SLOP = { top: PROFILE.followSlop, bottom: PROFILE.followSlop, left: PROFILE.followSlop, right: PROFILE.followSlop };

export function FollowButton(props: { listenerId: string; following: boolean; onChange?: (following: boolean) => void; className?: string; compact?: boolean }): React.ReactElement | null {
  const { api, listener } = useSocial();
  const toast = useToast();
  const [following, setFollowing] = useState(props.following);
  const [busy, setBusy] = useState(false);
  if (listener?.listenerId === props.listenerId) return null;
  const press = async () => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    if (busy) return;
    const next = !following;
    setFollowing(next); setBusy(true);
    try {
      if (next) await api.follow(props.listenerId); else await api.unfollow(props.listenerId);
      props.onChange?.(next);
    } catch (e) {
      setFollowing(!next);
      toast(e instanceof ApiError && e.code === 'network' ? "Couldn't reach the server." : e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally { setBusy(false); }
  };
  if (props.compact === true) {
    return (
      <Pressable
        onPress={() => void press()}
        disabled={busy}
        hitSlop={SLOP}
        accessibilityRole="button"
        accessibilityLabel={following ? 'Unfollow' : 'Follow'}
        accessibilityState={{ disabled: busy }}
        className={`rounded-pill items-center justify-center px-row ${following ? 'bg-raise2' : 'bg-hot'} ${busy ? 'opacity-40' : 'active:opacity-85'} ${props.className ?? 'self-start'}`}
        style={COMPACT}
      >
        <Type step="chip" className={following ? 'text-text' : 'text-void'} numberOfLines={1}>{following ? 'Following' : 'Follow'}</Type>
      </Pressable>
    );
  }
  return (
    <PulseButton
      label={following ? 'Following' : 'Follow'}
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
      kind={following ? 'quiet' : 'hot'}
      {...(following ? {} : { icon: 'add' as const })}
      disabled={busy}
      onPress={() => void press()}
      className={props.className ?? 'self-start'}
    />
  );
}
