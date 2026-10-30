// The notice threads you muted, each with Unmute, for Settings › Privacy.
/**
 * M22 US3 (FR-011, T016): a muted thread is a comment thread or a like-post you chose "Mute this"
 * for, from the ⋯ on a notice. Nothing from it is noticed or pushed until you unmute it here
 * (GET / DELETE /v1/me/muted-threads). Same card as "Muted users" above it.
 */
import { useEffect, useState } from 'react';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Pressable } from '@/ui/lib/pressable';
import { Card, CardDivider } from '@/ui/kit/Card';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { useToast } from '@/ui/shell/providers';
import { useM22SocialApi, type MutedThread } from '@/social/api-m22-social';

const TAP = { minHeight: hit.min };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: MutedThread[] };

export function MutedThreads(props: { iconColour: string }): React.ReactElement {
  const api = useM22SocialApi();
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    api.mutedThreads().then((items) => { if (live) setState({ kind: 'ok', items }); }).catch(() => { if (live) setState({ kind: 'error' }); });
    return () => { live = false; };
  }, [api]);
  const unmute = (t: MutedThread) => {
    if (state.kind !== 'ok') return;
    const before = state.items;
    setState({ kind: 'ok', items: before.filter((x) => !(x.threadKind === t.threadKind && x.threadKey === t.threadKey)) });
    api.unmuteThread(t).then(() => toast('Unmuted. New notices from it will show again.')).catch(() => {
      setState({ kind: 'ok', items: before });
      toast("Couldn't unmute — try again when you're online.");
    });
  };
  return (
    <Card>
      {state.kind === 'loading' ? <Text className="text-muted text-body py-row">Loading…</Text>
        : state.kind === 'error' ? <Text className="text-muted text-body py-row">Couldn't load your muted threads.</Text>
        : state.items.length === 0 ? <Text className="text-muted text-body py-row">No muted threads. Choose “Mute this” from the ⋯ on a notice to stop notices from one thread.</Text>
        : state.items.map((t, i) => (
          <Box key={`${t.threadKind}:${t.threadKey}`}>
            {i > 0 ? <CardDivider /> : null}
            <Box className="flex-row items-center gap-row py-row" style={TAP}>
              <Icon name={t.threadKind === 'comment' ? 'chatbubble-outline' : 'heart-outline'} size={20} color={props.iconColour} />
              <Text className="text-text text-body flex-1" numberOfLines={2}>{t.title}</Text>
              <Pressable onPress={() => unmute(t)} accessibilityRole="button" accessibilityLabel={`Unmute ${t.title}`} className="px-row rounded-pill border border-border items-center justify-center" style={TAP}>
                <Text className="text-text text-meta font-semibold">Unmute</Text>
              </Pressable>
            </Box>
          </Box>
        ))}
    </Card>
  );
}
