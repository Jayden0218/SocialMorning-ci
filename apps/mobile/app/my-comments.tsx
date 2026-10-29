// Every comment you wrote, hung on a spine at its moment; tap to open the episode there.
/**
 * My comments (我的评论, M10; text M10b US2, FR-006): each of your comments with what you
 * wrote, its episode and moment, from `GET /v1/me/comments`. A deleted or removed comment
 * says so instead of its text. Tapping one opens the episode at that moment.
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `my-comments--screen`, `--signed-out`, `--empty`; layout pattern
 * Thread): your comments hang from the spine at their moment chips (the solid hot "14:32"), "On {episode}" beside
 * each chip, the words in a raise card (radius 18) with their age at the foot. A removed comment reads "Removed by
 * moderation" in hot text, a deleted one "You deleted this comment". The title bar is low: "My comments" and the count
 * (a "+" while more pages wait). Signed out: an empty block with a light Sign in button; none yet: an empty spine and
 * "No comments yet". The whole card is still the one button, with the same name and destination; loading, paging unchanged.
 *
 * Not as drawn: the heart and its count are not on the card (the server sends none for your own comments).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import type { MyComment } from '@/social/api';
import { useSocial } from '@/social/context';
import { mmss } from '@/ui/kit/format';
import { PushedPage } from '@/ui/kit/PushedPage';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { Tick, GhostRows } from '@/ui/comments/Spine';
import { plural } from '@socialmorning/social-core';
import { COMMENTS } from '@/ui/comments/measures';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ME_TYPE } from '@/ui/me/measures';
import { ageLabel, DRAWN, emptyTop, EmptySpine, LIST, PageEmpty, ThreadCard, ThreadNode, ThreadSpine, threadPad } from '@/ui/me/lists';

export default function MyCommentsScreen(): React.ReactElement {
  const { api, listener } = useSocial();
  const [rows, setRows] = useState<MyComment[] | undefined>();
  const [next, setNext] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!listener) { setRows([]); return; }
    let live = true;
    api.myComments().then((r) => { if (live) { setRows(r.items); setNext(r.next); } }, () => { if (live) { setRows([]); setFailed(true); } });
    return () => { live = false; };
  }, [api, listener]);
  const more = useCallback(() => {
    if (!next) return;
    const at = next;
    setNext(undefined);
    void api.myComments(at).then((r) => { setRows((cur) => [...(cur ?? []), ...r.items]); setNext(r.next); }, () => setNext(at));
  }, [api, next]);

  // The count of what is loaded; "+" while more pages wait (the server sends no total).
  const count = rows !== undefined && rows.length > 0 ? `${plural(rows.length, 'comment')}${next ? '+' : ''}` : undefined;
  const now = Date.now();
  return (
    <PushedPage title="My comments" {...(count ? { subtitle: count } : {})}>
      {(layout) => {
        const top = layout.top + (DRAWN.listTop - DRAWN.status);
        if (rows === undefined) {
          return (
            <Box className="flex-1">
              <EmptySpine top={layout.top + (LIST.emptySpineTop - DRAWN.status)} />
              <Box style={{ marginTop: layout.top + 30, marginLeft: COMMENTS.spineX, marginRight: LIST.right - LIST.headGap }}><GhostRows rows={6} /></Box>
            </Box>
          );
        }
        const nothing = rows.length === 0;
        return (
          <Box className="flex-1" style={{ paddingTop: top }}>
            {nothing ? <EmptySpine top={layout.top + (LIST.emptySpineTop - DRAWN.status)} /> : <ThreadSpine top={top} />}
            <FlatList
              className="flex-1"
              data={rows}
              // Owner, 2026-10-05: the bottom of a fetched list says so.
              ListFooterComponent={rows.length > 0 && !next ? <EndOfList /> : undefined}
              keyExtractor={(r) => r.id}
              contentContainerStyle={{ ...threadPad(layout.reserve), flexGrow: 1 }}
              onEndReached={more}
              ItemSeparatorComponent={() => <Box style={{ height: LIST.nodeGap }} />}
              ListEmptyComponent={
                !listener ? (
                  <PageEmpty top={emptyTop(260) - LIST.top} title="Sign in to comment" line="Your comments, at their moments, live here." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} />
                ) : failed ? (
                  <PageEmpty top={emptyTop(300) - LIST.top} title="Couldn't load your comments" />
                ) : (
                  <PageEmpty top={emptyTop(LIST.emptyBlockTop) - LIST.top} title="No comments yet" line="Say something at a moment from the player." />
                )
              }
              renderItem={({ item }) => {
                const text = item.removed ? 'Removed by moderation' : item.deleted ? 'You deleted this comment' : item.hiddenByHost ? `${item.body ?? ''} — hidden by the host` : item.body ?? '';
                const live = item.body && !item.removed && !item.deleted;
                return (
                  <ThreadNode
                    lead={item.offsetMs !== null ? <TimestampChip text={mmss(item.offsetMs)} solid /> : <Tick text="no moment" />}
                    label={<Type step="caption" className="text-text2 flex-1" style={ME_TYPE.node12} numberOfLines={1}>{`On ${item.episode.title}`}</Type>}
                  >
                    <Pressable
                      onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
                      accessibilityRole="button"
                      accessibilityLabel={`${text}. On ${item.episode.title}`}
                    >
                      <ThreadCard>
                        {live ? (
                          <>
                            <Type step="body" className="text-text" numberOfLines={5}>{text}</Type>
                            <Box className="flex-row items-center justify-end">
                              <Type step="mono" className="text-text3" style={ME_TYPE.mono11}>{ageLabel(Date.parse(item.createdAt), now)}</Type>
                            </Box>
                          </>
                        ) : (
                          <Type step="note" className={item.removed ? 'text-hotText italic' : 'text-text3 italic'} numberOfLines={5}>{text}</Type>
                        )}
                      </ThreadCard>
                    </Pressable>
                  </ThreadNode>
                );
              }}
            />
          </Box>
        );
      }}
    </PushedPage>
  );
}
