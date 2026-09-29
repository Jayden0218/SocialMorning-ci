/**
 * One comment on the comments page (M12 US2, FR-022/024/025). An avatar (initials when there is
 * no picture), the name, how long ago, the moment as a chip that plays from there, the text
 * folded after 8 lines, and the like count on the right. Reply, Copy, Save and Report/Delete
 * live behind a long-press (the "Reply ☆ Report" row under every comment is gone). Up to two
 * replies are previewed in a tinted box; the rest open with "View all N replies".
 */
import { useState } from 'react';
import { Link } from '../design/tailwind';
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Icon } from './Icon';
import { plural } from '@socialmorning/social-core';
import { mmss, relativeTime } from './format';
import { Placeholder, placeholderFor } from './Placeholder';
import { hit } from '../design';
import type { Comment } from '../social/api';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const AVATAR = { width: 32, height: 32 };
const REPLY_AVATAR = { width: 24, height: 24 };

/** The avatar's letter: what the server sent, else the name's first letter or digit. */
export function initialsFor(c: Pick<Comment, 'initials' | 'displayName'>): string {
  if (c.initials) return c.initials;
  const m = /[\p{L}\p{N}]/u.exec(c.displayName ?? '');
  return m ? m[0].toUpperCase() : '·';
}

export type LikeView = { count: number; liked: boolean };

export function CommentRow(props: {
  c: Comment;
  serverTime: string;
  /** The like state to show — the page's instant (optimistic) copy, falling back to the server's. */
  likeOf: (c: Comment) => LikeView;
  iconColour: { muted: string; accent: string };
  onSeek: (offsetMs: number) => void;
  onLike: (c: Comment) => void;
  onMenu: (c: Comment) => void;
  isReply?: boolean;
}): React.ReactElement {
  const { c } = props;
  const like = props.likeOf(c);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const kind = placeholderFor(c, c.reported);
  if (kind !== undefined) return <Box className="py-row"><Placeholder kind={kind} /></Box>;

  const replies = c.replies ?? [];
  const shownReplies = expanded ? replies : replies.slice(0, 2);
  const avatar = props.isReply ? REPLY_AVATAR : AVATAR;
  const name = c.displayName ?? 'Deleted account';

  return (
    <Box className={props.isReply ? 'py-2' : 'py-row border-b-hairline border-separator'}>
      <Pressable
        onLongPress={() => props.onMenu(c)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityHint="Long-press for reply, copy, save and report"
        accessibilityActions={[{ name: 'longpress', label: 'More actions' }]}
        onAccessibilityAction={() => props.onMenu(c)}
        className="flex-row gap-row"
      >
        <Box className="rounded-pill bg-surface items-center justify-center" style={avatar} accessible={false}>
          <Text className="text-muted text-xs font-bold">{initialsFor(c)}</Text>
        </Box>
        <Box className="flex-1 gap-1">
          <Box className="flex-row items-center gap-2 flex-wrap">
            {c.authorId !== null ? (
              <Link href={{ pathname: '/profile/[id]', params: { id: c.authorId } }} asChild>
                <Pressable accessibilityRole="link"><Text className="text-muted text-xs font-semibold">{name}</Text></Pressable>
              </Link>
            ) : <Text className="text-muted text-xs font-semibold">{name}</Text>}
            {c.host ? <Text className="bg-accentTint text-accent rounded-pill px-2 text-xs font-bold" accessibilityLabel="Host of this show">Host</Text> : null}
            <Text className="text-muted text-xs">{relativeTime(c.createdAt, props.serverTime)}</Text>
          </Box>
          <Text className="text-text text-sm leading-[24px]" numberOfLines={open ? undefined : 8}>
            {c.offsetMs !== null ? (
              <Text className="text-accent font-semibold" accessibilityRole="button" accessibilityLabel={`Play from ${mmss(c.offsetMs)}`} onPress={() => props.onSeek(c.offsetMs!)}>
                {`${mmss(c.offsetMs)}  `}
              </Text>
            ) : null}
            {c.body}
          </Text>
          {(c.body ?? '').length > 320 ? (
            <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" className="self-start justify-center" style={{ minHeight: 32 }}>
              <Text className="text-accent text-xs font-semibold">{open ? 'Less' : 'More'}</Text>
            </Pressable>
          ) : null}
          {c.hiddenByHost ? <Text className="text-muted text-xs italic">Hidden by the host — only you can see it</Text> : null}
        </Box>
        {c.mine ? <Box style={TAP} /> : (
          <Pressable
            onPress={() => props.onLike(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: like.liked }}
            accessibilityLabel={`${like.liked ? 'Unlike' : 'Like'}. ${plural(like.count, 'like')}`}
            className="items-center justify-start pt-1"
            style={TAP}
          >
            <Icon name={like.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={18} color={like.liked ? props.iconColour.accent : props.iconColour.muted} />
            {like.count > 0 ? <Text className={like.liked ? 'text-accent text-xs' : 'text-muted text-xs'}>{like.count}</Text> : null}
          </Pressable>
        )}
      </Pressable>
      {!props.isReply && replies.length > 0 ? (
        <Box className="ml-10 mt-2 bg-surface rounded-row px-row py-1">
          {shownReplies.map((r) => (
            <CommentRow key={r.id} {...props} c={r} isReply />
          ))}
          {replies.length > 2 ? (
            <Pressable onPress={() => setExpanded((e) => !e)} accessibilityRole="button" className="justify-center" style={{ minHeight: 40 }}>
              <Text className="text-accent text-xs font-semibold">{expanded ? 'Show fewer replies' : `View all ${plural(replies.length, 'reply', 'replies')}`}</Text>
            </Pressable>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
