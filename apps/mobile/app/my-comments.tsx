// Every comment you wrote, one card each at its moment; tap to open the episode there.
/**
 * My comments (我的评论, M10; text M10b US2, FR-006): each of your comments with what you
 * wrote, its episode and moment, from `GET /v1/me/comments`. A deleted or removed comment
 * says so instead of its text. Tapping one opens the episode at that moment.
 *
 * Words as drawn (design-pulse2 `listen.html` `my-comments--screen`, `--signed-out`, `--empty`): the moment chip is the solid hot "14:32", "On {episode}" beside it, the
 * words in a raise card with their age at the foot. A removed comment reads "Removed by moderation" in hot text, a deleted one "You deleted this comment". The title
 * is "My comments" with the count (a "+" while more pages wait). Signed out: an empty block with a light Sign in button; none yet: "No comments yet". The whole
 * card is still the one button, with the same name and destination; loading, paging unchanged.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; each comment is ONE card (its moment chip and "On {episode}" on the head row, the words, the age at the
 * foot) and the whole card is still the one button. Signed out and none yet are empty blocks; a failed read is an `InlineNotice`.
 *
 * Not as drawn: the heart and its count are not on the card (the server sends none for your own comments).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import type { MyComment } from '@/social/api';
import { useSocial } from '@/social/context';
import { mmss } from '@/ui/kit/format';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { InlineNotice } from '@/ui/kit/layout';
import { plural } from '@socialmorning/social-core';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ageLabel } from '@/ui/me/lists';
import { FeedEmpty, FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { ItemCard } from '@/ui/notifications/cards';
import { nowMs as clockMs } from '@/ui/kit/clock';

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
  const now = clockMs();
  return (
    <FeedPage
      title="My comments"
      {...(count ? { subtitle: count } : {})}
      data={rows ?? []}
      keyExtractor={(r) => r.id}
      contentStyle={{ flexGrow: 1 }}
      gap={spacing.row}
      onEndReached={more}
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={rows && rows.length > 0 && !next ? <EndOfList /> : undefined}
      ListHeaderComponent={listener && failed ? <InlineNotice text="Couldn't load your comments" actionLabel="Retry" onAction={() => { setFailed(false); setRows(undefined); api.myComments().then((r) => { setRows(r.items); setNext(r.next); }, () => { setRows([]); setFailed(true); }); }} /> : null}
      ListEmptyComponent={
        rows === undefined ? <FeedLoading testID="my-comments-loading" rows={6} />
        : !listener ? <FeedEmpty title="Sign in to comment" line="Your comments, at their moments, live here." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} />
        : failed ? undefined
        : <FeedEmpty title="No comments yet" line="Say something at a moment from the player." />
      }
      renderItem={({ item }) => {
        const text = item.removed ? 'Removed by moderation' : item.deleted ? 'You deleted this comment' : item.hiddenByHost ? `${item.body ?? ''} — hidden by the host` : item.body ?? '';
        const live = item.body && !item.removed && !item.deleted;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.episode.id, ...(item.offsetMs !== null ? { at: String(item.offsetMs) } : {}) } })}
            accessibilityRole="button"
            accessibilityLabel={`${text}. On ${item.episode.title}`}
          >
            <ItemCard testID="thread-card">
              <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
                {item.offsetMs !== null ? <TimestampChip text={mmss(item.offsetMs)} solid /> : <Type step="tag" className="text-text3">no moment</Type>}
                <Type step="caption" className="text-text2 flex-1" numberOfLines={1}>{`On ${item.episode.title}`}</Type>
              </Box>
              {live ? (
                <>
                  <Type step="body" className="text-text" numberOfLines={5}>{text}</Type>
                  <Box className="flex-row items-center justify-end">
                    <Type step="mono" className="text-text3">{ageLabel(Date.parse(item.createdAt), now)}</Type>
                  </Box>
                </>
              ) : (
                <Type step="note" className={item.removed ? 'text-hotText italic' : 'text-text3 italic'} numberOfLines={5}>{text}</Type>
              )}
            </ItemCard>
          </Pressable>
        );
      }}
    />
  );
}
