// All of one listener's likes, newest first, paged.
/**
 * M21 US8 (FR-074): the profile's Likes "View all". The server's rule decides what shows
 * (`GET /v1/listeners/:id/likes`): public likes only, unless it is you; nothing across a block.
 * An empty answer reads as "no public likes", which also covers likes kept private.
 *
 * Before spec 039 (the page as M31 drew it, with a spine; the Spec 039 paragraph below is what the page is now) — M31 W4-A (T050; design-pulse2 social.html `profile-likes--screen`, `--empty`, `--load-failed`; layout pattern Thread): liked episodes
 * hang on the spine (x 40), each under a quiet tick with how long ago ("2d", then the date), over the like card — cover 44, title,
 * show, a Play circle 36, the note in quotes, "liked this, 2d" in hot-text. The card opens the episode, the circle plays it. The title
 * bar says "Likes" and "Episodes Rui Costa liked" (no name: "Episodes they liked"). Loading is the grey spine and breathing ghost
 * rows; none is the empty block "No public likes yet."; a failure is the centred 64 disc with "Couldn't load likes right now." and a
 * light Retry.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; each like is one `LikeCard` in the list (no spine, no tick: the card says "liked this, 2d"); loading is grey rows;
 * a failure is an `InlineNotice` with Retry; none is the empty block "No public likes yet.".
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedEmpty, FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { LikeCard } from '@/ui/social/LikeCard';
import { nowMs as clockMs } from '@/ui/kit/clock';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: LikeItem[]; next?: string };

export default function ListenerLikesScreen(): React.ReactElement {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const profileApi = useProfileApi();
  const { open, play } = useCardActions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [paging, setPaging] = useState(false);
  const load = useCallback(() => {
    profileApi.listenerLikes(String(id)).then((p) => setState({ kind: 'ok', items: p.items, ...(p.next ? { next: p.next } : {}) }))
      .catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [profileApi, id]);
  useFocusEffect(load);
  const more = () => {
    if (state.kind !== 'ok' || !state.next || paging) return;
    setPaging(true);
    profileApi.listenerLikes(String(id), state.next)
      .then((p) => setState({ kind: 'ok', items: [...state.items, ...p.items], ...(p.next ? { next: p.next } : {}) }))
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };
  const named = typeof name === 'string' && name !== '';
  const nowMs = clockMs();
  const items = state.kind === 'ok' ? state.items : [];
  return (
    <FeedPage<LikeItem>
      title="Likes"
      subtitle={named ? `Episodes ${name} liked` : 'Episodes they liked'}
      data={items}
      keyExtractor={(l) => `${l.episode.id}|${l.createdAt}`}
      contentStyle={{ flexGrow: 1 }}
      gap={spacing.row}
      onEndReached={more}
      ListHeaderComponent={state.kind === 'error' ? <InlineNotice text="Couldn't load likes right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} /> : null}
      ListEmptyComponent={state.kind === 'loading' ? <FeedLoading testID="likes-loading" rows={6} /> : state.kind === 'error' ? undefined : <FeedEmpty title="No public likes yet" line="No public likes yet." />}
      ListFooterComponent={items.length > 0 ? (state.kind === 'ok' && state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
      renderItem={({ item }) => (
        <LikeCard item={{ ...item, listener: undefined }} now={new Date(nowMs).toISOString()} onOpen={(c) => void open(c)} onPlay={(c) => void play(c)} />
      )}
    />
  );
}
