// All of one listener's likes, newest first, paged.
/**
 * M21 US8 (FR-074): the profile's Likes "View all". The server's rule decides what shows
 * (`GET /v1/listeners/:id/likes`): public likes only, unless it is you; nothing across a block.
 * An empty answer reads as "no public likes", which also covers likes kept private.
 *
 * M31 W4-A (T050; design-pulse2 social.html `profile-likes--screen`, `--empty`, `--load-failed`; layout pattern Thread): liked episodes
 * hang on the spine (x 40), each under a quiet tick with how long ago ("2d", then the date), over the like card — cover 44, title,
 * show, a Play circle 36, the note in quotes, "liked this, 2d" in hot-text. The card opens the episode, the circle plays it. The title
 * bar says "Likes" and "Episodes Rui Costa liked" (no name: "Episodes they liked"). Loading is the grey spine and breathing ghost
 * rows; none is the empty block "No public likes yet."; a failure is the centred 64 disc with "Couldn't load likes right now." and a
 * light Retry.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Box } from '@/ui/lib/box';
import { useProfileApi, type LikeItem } from '@/social/profile-api';
import { useCardActions } from '@/discover/useDiscover';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { ageLabel, DRAWN, emptyTop, EmptySpine, LIST, PageEmpty, ThreadNode, ThreadSpine, threadPad } from '@/ui/me/lists';
import { COMMENTS } from '@/ui/comments/measures';
import { GhostRows, Tick } from '@/ui/comments/Spine';
import { LikeCard } from '@/ui/social/LikeCard';
import { CenterBlock, IconBlock } from '@/ui/profile/parts';

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
  const nowMs = Date.now();
  return (
    <PushedPage title="Likes" subtitle={named ? `Episodes ${name} liked` : 'Episodes they liked'} tone={state.kind === 'error' ? 'grey' : 'hot'}>
      {(layout) => {
        const top = layout.top + (DRAWN.listTop - DRAWN.status);
        const emptyAt = layout.top + (LIST.emptySpineTop - DRAWN.status);
        if (state.kind === 'loading') {
          return (
            <Box className="flex-1" testID="likes-loading">
              <EmptySpine top={emptyAt} />
              <Box style={{ marginTop: layout.top + 6, marginLeft: COMMENTS.spineX, marginRight: LIST.right - LIST.headGap }}><GhostRows rows={6} /></Box>
            </Box>
          );
        }
        if (state.kind === 'error') {
          return (
            <Box className="flex-1">
              <CenterBlock top={layout.top} drawn={250}>
                <IconBlock icon="wifi" failure line="Couldn't load likes right now."><PulseButton label="Retry" kind="light" onPress={() => { setState({ kind: 'loading' }); load(); }} full /></IconBlock>
              </CenterBlock>
            </Box>
          );
        }
        const nothing = state.items.length === 0;
        return (
          <Box className="flex-1" style={{ paddingTop: top }}>
            {nothing ? <EmptySpine top={emptyAt} /> : <ThreadSpine top={top} />}
            <FlatList
              className="flex-1"
              data={state.items}
              keyExtractor={(l) => `${l.episode.id}|${l.createdAt}`}
              contentContainerStyle={{ ...threadPad(layout.reserve), flexGrow: 1 }}
              ItemSeparatorComponent={() => <Box style={{ height: LIST.nodeGap }} />}
              ListEmptyComponent={<PageEmpty top={emptyTop(240) - LIST.top} title="No public likes yet" line="No public likes yet." />}
              ListFooterComponent={state.items.length > 0 ? (state.next ? <Box className="items-center py-row"><Loader /></Box> : <EndOfList />) : undefined}
              onEndReached={more}
              renderItem={({ item }) => (
                <ThreadNode lead={<Tick text={ageLabel(Date.parse(item.createdAt), nowMs)} />}>
                  <LikeCard item={{ ...item, listener: undefined }} now={new Date(nowMs).toISOString()} onOpen={(c) => void open(c)} onPlay={(c) => void play(c)} />
                </ThreadNode>
              )}
            />
          </Box>
        );
      }}
    </PushedPage>
  );
}
