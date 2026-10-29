// Two newest comments on the episode page, then "All N comments".
/**
 * The episode page's comments (M12 FR-027): the two newest, then "All N comments", which opens
 * the comments page. The page used to hold the whole conversation (~3000 pt on one episode).
 * M31 W2-B: the cards are the Pulse cards (CommentRow `flush`, no spine); the episode lane decides where this block lives.
 */
import { useMemo } from 'react';
import { orderComments, plural } from '@socialmorning/social-core';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import type { Comment } from '@/social/api';
import { useSafety } from '@/safety/context';
import { CommentRow } from './CommentRow';
import { SectionTitle } from '@/ui/discover/parts';

const TAP = { minHeight: hit.min };

export function CommentPreview(props: { comments: Comment[]; serverTime: string; stale: boolean; onSeek: (ms: number) => void; onOpen: () => void }): React.ReactElement {
  const safety = useSafety();
  const visible = useMemo(() => safety.comments(props.comments), [props.comments, safety]);
  const count = visible.reduce((n, x) => n + (x.deleted ? 0 : 1) + (x.replies ?? []).filter((r) => !r.deleted).length, 0);
  const top = useMemo(
    () => orderComments(visible.filter((x) => !x.deleted).map((x) => ({ ...x, createdAt: new Date(x.createdAt).getTime(), raw: x })), 'newest').slice(0, 2).map((o) => ({ ...o.raw, replies: [] })),
    [visible],
  );
  return (
    <Box className="-mx-screen-x">
      <SectionTitle title="Comments" action={{ label: count > 0 ? `All ${plural(count, 'comment')}` : 'Write one', onPress: props.onOpen }} />
      <Box className="px-screen-x">
        {props.stale ? <Type step="tag" className="text-text3">Couldn't refresh — showing the last copy</Type> : null}
        {top.length === 0 ? (
          <Pressable onPress={props.onOpen} accessibilityRole="button" accessibilityLabel="No comments yet — be the first to say something." className="justify-center" style={TAP}>
            <Type step="note" className="text-text2">No comments yet — be the first to say something.</Type>
          </Pressable>
        ) : top.map((x) => (
          <CommentRow
            key={x.id}
            c={x}
            serverTime={props.serverTime}
            likeOf={(y) => ({ count: y.likeCount ?? 0, liked: y.likedByMe ?? false })}
            flush
            onSeek={props.onSeek}
            onLike={props.onOpen}
            onMenu={props.onOpen}
          />
        ))}
      </Box>
    </Box>
  );
}
