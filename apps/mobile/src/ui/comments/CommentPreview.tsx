// Two newest comments on the episode page, then "All N comments".
/**
 * The episode page's comments (M12 FR-027): the two newest, then "All N comments", which opens
 * the comments page. The page used to hold the whole conversation (~3000 pt on one episode).
 */
import { useMemo } from 'react';
import { orderComments, plural } from '@socialmorning/social-core';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import type { Comment } from '@/social/api';
import { useSafety } from '@/safety/context';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { CommentRow } from './CommentRow';
import { SectionTitle } from '@/ui/discover/parts';

const TAP = { minHeight: hit.min };

export function CommentPreview(props: { comments: Comment[]; serverTime: string; stale: boolean; onSeek: (ms: number) => void; onOpen: () => void }): React.ReactElement {
  const safety = useSafety();
  const stores = useStores();
  const c = useColours(stores.settings);
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
        {props.stale ? <Text className="text-muted text-xs">Couldn't refresh — showing the last copy</Text> : null}
        {top.length === 0 ? (
          <Pressable onPress={props.onOpen} accessibilityRole="button" className="justify-center" style={TAP}>
            <Text className="text-muted text-sm">No comments yet — be the first to say something.</Text>
          </Pressable>
        ) : top.map((x) => (
          <CommentRow
            key={x.id}
            c={x}
            serverTime={props.serverTime}
            likeOf={(y) => ({ count: y.likeCount ?? 0, liked: y.likedByMe ?? false })}
            iconColour={{ muted: c.muted, accent: c.accent }}
            onSeek={props.onSeek}
            onLike={props.onOpen}
            onMenu={props.onOpen}
          />
        ))}
      </Box>
    </Box>
  );
}
