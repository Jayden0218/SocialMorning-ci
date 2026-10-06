// One comment card: picture, name, time, moment chip, text, likes, replies.
/**
 * One comment on the comments page (M12 US2, FR-022/024/025). An avatar (initials when there is
 * no picture), the name, how long ago, the moment as a chip that plays from there, the text
 * folded after 8 lines, and the like count on the right. Reply, Copy, Save and Report/Delete
 * live behind a long-press (the "Reply ☆ Report" row under every comment is gone). Up to two
 * replies are previewed in a tinted box; the rest open with "Show N more".
 *
 * Owner, 2026-10-01 (the 小宇宙 comments page): the name on its own line, then "time · place"
 * (place = the commenter's IP location when the server sends one), the like count on the
 * right; replies in a grey box under the parent, the first 2 shown and "Show N more" for the rest.
 *
 * M17 (`Comments-B`): each top-level comment is a white card. Avatar 36 and the name in bold,
 * "time · place" under it; the moment as its own tinted chip (▶ 14:32) that plays from there;
 * the text in the serif (display-m) so the words lead; replies in a warm box inside the card;
 * then a footer with the like on the left and a ⋯ button on the right that opens the same
 * menu as the long-press (which still works). The Host badge is the yellow pill.
 *
 * M19 US5/US6 (FR-040…FR-044): a pinned comment carries a small accent "Pinned by the host" line;
 * a comment folded for being unfriendly is one muted row, "Hidden for being unfriendly — Show",
 * that opens it on tap; a voice comment plays inline (VoiceComment). Under a parent the first 2
 * replies still show, and "N replies ›" opens the reply page (`onOpenThread`) in place of the
 * old inline "Show N more" — the reply page has every reply and its own reply box.
 */
import { useState } from 'react';
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { plural } from '@socialmorning/social-core';
import { mmss, relativeTime } from '@/ui/kit/format';
import { Placeholder, placeholderFor } from './Placeholder';
import { hit } from '@/design';
import type { Comment } from '@/social/api';
import { countryName } from '@/ui/me/country';
import { Avatar } from '@/ui/kit/Avatar';
import { extrasOf, replyCountOf } from '@/social/comment-extras-api';
import { VoiceComment, type PlayVoice } from './VoiceComment';
import { CommentImage } from './CommentImage';

const TAP = { minHeight: hit.min, minWidth: hit.min };
const AVATAR = { width: 36, height: 36 };

/** The avatar's letter: what the server sent, else the name's first letter or digit. */
export function initialsFor(c: Pick<Comment, 'initials' | 'displayName'>): string {
  if (c.initials) return c.initials;
  const m = /[\p{L}\p{N}]/u.exec(c.displayName ?? '');
  return m ? m[0].toUpperCase() : '·';
}

export type LikeView = { count: number; liked: boolean };

/** How many replies show before "Show N more". */
export const REPLY_PREVIEW = 2;

/**
 * The commenter's IP location, as a country name. The `Comment` type has no such field yet —
 * profiles carry `country` (M10b US7) but comments do not — so this reads it only if the
 * server starts sending `country` on a comment, and is empty until then.
 */
export function placeOf(c: Comment): string | undefined {
  const code = (c as Comment & { country?: string | null }).country;
  return typeof code === 'string' && /^[A-Za-z]{2}$/.test(code) ? countryName(code.toUpperCase()) : undefined;
}

/** "3 min ago · Malaysia", or just the time. */
export function timeAndPlace(createdAt: string, serverTime: string, place: string | undefined): string {
  const when = relativeTime(createdAt, serverTime);
  return place ? `${when} · ${place}` : when;
}

/**
 * The old fold under a parent's replies: "Show 3 more", or "Show fewer replies" once open.
 * M19 US5 replaced it on the card with `repliesLink` (the reply page); kept for its test.
 */
export function moreRepliesLabel(total: number, expanded: boolean): string | undefined {
  if (total <= REPLY_PREVIEW) return undefined;
  return expanded ? 'Show fewer replies' : `Show ${total - REPLY_PREVIEW} more`;
}

/** M19 FR-043: the link under a parent to its reply page — "1 reply ›", "5 replies ›". */
export function repliesLink(total: number): string | undefined {
  return total > 0 ? `${plural(total, 'reply', 'replies')} ›` : undefined;
}

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
  /** M19 FR-043: opens the reply page; without it (the reply page itself) no replies box is drawn. */
  onOpenThread?: (c: Comment) => void;
  /** M19 FR-044: plays a voice comment (`playVoice` from the playback adapter, passed by the page). */
  playVoice?: PlayVoice;
  /** M20 US9: teen mode ("hide explicit") — comment pictures start hidden behind "Tap to show". */
  teenMode?: boolean;
}): React.ReactElement {
  const { c } = props;
  const like = props.likeOf(c);
  const [open, setOpen] = useState(false);
  const [unfold, setUnfold] = useState(false);
  const kind = placeholderFor(c, c.reported);
  if (kind !== undefined) {
    return props.isReply
      ? <Box className="py-2"><Placeholder kind={kind} /></Box>
      : <Box className="bg-surface border border-border rounded-row p-row"><Placeholder kind={kind} /></Box>;
  }
  const extra = extrasOf(c);
  // FR-041: folded for everyone at 5 "unfriendly" marks — one muted row that opens it.
  if (extra.folded && !unfold) {
    return (
      <Pressable
        onPress={() => setUnfold(true)}
        accessibilityRole="button"
        accessibilityLabel="Show hidden comment"
        className={props.isReply ? 'py-1 justify-center' : 'bg-surface border border-border rounded-row px-row justify-center'}
        style={TAP}
      >
        <Text className="text-muted text-xs">Hidden for being unfriendly — <Text className="text-accent text-xs font-bold">Show</Text></Text>
      </Pressable>
    );
  }

  const replies = c.replies ?? [];
  const shownReplies = replies.slice(0, REPLY_PREVIEW);
  const link = props.onOpenThread ? repliesLink(replyCountOf(c)) : undefined;
  const name = c.displayName ?? 'Deleted account';
  const reply = props.isReply === true;

  const likeButton = c.mine ? null : (
    <Pressable
      onPress={() => props.onLike(c)}
      accessibilityRole="button"
      accessibilityState={{ selected: like.liked }}
      accessibilityLabel={`${like.liked ? 'Unlike' : 'Like'}. ${plural(like.count, 'like')}`}
      className={reply ? 'items-center justify-start pt-1' : 'flex-row items-center gap-1.5 pr-2'}
      style={TAP}
    >
      <Icon name={like.liked ? 'thumbs-up' : 'thumbs-up-outline'} size={reply ? 14 : 16} color={like.liked ? props.iconColour.accent : props.iconColour.muted} />
      {like.count > 0 ? <Text className={like.liked ? 'text-accent text-xs font-semibold' : 'text-muted text-xs font-semibold'}>{like.count}</Text> : null}
    </Pressable>
  );

  return (
    <Box className={reply ? 'py-1 flex-row gap-2' : 'bg-surface border border-border rounded-row px-row pt-row'}>
      {/* FR-040: the host's pinned comment says so, above the name. */}
      {!reply && extra.pinned ? (
        <Box className="flex-row items-center gap-1 pb-2" accessible accessibilityLabel="Pinned by the host">
          <Icon name="pin" size={12} color={props.iconColour.accent} />
          <Text className="text-accent text-xs font-bold">Pinned by the host</Text>
        </Box>
      ) : null}
      <Pressable
        onLongPress={() => props.onMenu(c)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityHint="Long-press for reply, copy, save and report"
        accessibilityActions={[{ name: 'longpress', label: 'More actions' }]}
        onAccessibilityAction={() => props.onMenu(c)}
        className={reply ? 'flex-1 gap-0.5' : 'gap-2'}
      >
        <Box className="flex-row items-center gap-2.5">
          {reply ? null : (
            // M19 T014: the author's photo when they set one; the letter disc otherwise.
            <Avatar size={AVATAR.width} url={c.avatarUrl} name={c.displayName} initials={initialsFor(c)} />
          )}
          <Box className="flex-1">
            <Box className="flex-row items-center gap-1.5 flex-wrap">
              {c.authorId !== null ? (
                <Link href={{ pathname: '/profile/[id]', params: { id: c.authorId } }} asChild>
                  <Pressable accessibilityRole="link"><Text className={reply ? 'text-text text-meta font-bold' : 'text-text text-body font-bold'}>{name}</Text></Pressable>
                </Link>
              ) : <Text className={reply ? 'text-text text-meta font-bold' : 'text-text text-body font-bold'}>{name}</Text>}
              {c.host ? <Text className="bg-primary text-onPrimary rounded-pill px-1.5 text-micro font-bold" accessibilityLabel="Host of this show">Host</Text> : null}
            </Box>
            {reply ? null : <Text className="text-muted text-xs">{timeAndPlace(c.createdAt, props.serverTime, placeOf(c))}</Text>}
          </Box>
        </Box>
        {!reply && c.offsetMs !== null ? (
          <Pressable onPress={() => props.onSeek(c.offsetMs!)} accessibilityRole="button" accessibilityLabel={`Play from ${mmss(c.offsetMs)}`} className="self-start justify-center" style={TAP}>
            <Box className="flex-row items-center gap-1 bg-accentTint rounded-pill px-2.5 py-1">
              <Icon name="play" size={10} color={props.iconColour.accent} />
              <Text className="text-accent text-xs font-bold">{mmss(c.offsetMs)}</Text>
            </Box>
          </Pressable>
        ) : null}
        {/* iPhone walk 2026-10-06: a voice comment has no words — draw no empty line (it left a gap). */}
        {c.body ? (
          <Text className={reply ? 'text-text text-meta leading-[20px]' : 'text-text text-title font-display-semibold leading-[24px]'} numberOfLines={open ? undefined : 8}>
            {reply && c.offsetMs !== null ? (
              <Text className="text-accent font-semibold" accessibilityRole="button" accessibilityLabel={`Play from ${mmss(c.offsetMs)}`} onPress={() => props.onSeek(c.offsetMs!)}>
                {`${mmss(c.offsetMs)}  `}
              </Text>
            ) : null}
            {c.body}
          </Text>
        ) : null}
        {extra.voice && props.playVoice ? <VoiceComment voice={extra.voice} play={props.playVoice} /> : null}
        {extra.image ? <CommentImage image={extra.image} teen={props.teenMode === true} /> : null}
        {(c.body ?? '').length > 320 ? (
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" className="self-start justify-center" style={TAP}>
            <Text className="text-accent text-xs font-semibold">{open ? 'Less' : 'More'}</Text>
          </Pressable>
        ) : null}
        {c.hiddenByHost ? <Text className="text-muted text-xs italic">Hidden by the host — only you can see it</Text> : null}
      </Pressable>
      {reply ? (likeButton ?? <Box style={TAP} />) : null}
      {!reply && link ? (
        <Box className="mt-2.5 bg-background rounded-row px-row py-2">
          {shownReplies.map((r) => (
            <CommentRow key={r.id} {...props} c={r} isReply />
          ))}
          {link ? (
            <Pressable onPress={() => props.onOpenThread?.(c)} accessibilityRole="link" accessibilityLabel={`${link.replace(' ›', '')}. Open the replies`} className="justify-center" style={TAP}>
              <Text className="text-accent text-xs font-bold">{link}</Text>
            </Pressable>
          ) : null}
        </Box>
      ) : null}
      {reply ? null : (
        <Box className="flex-row items-center justify-between">
          {likeButton ?? <Box style={TAP} />}
          <Pressable onPress={() => props.onMenu(c)} accessibilityRole="button" accessibilityLabel="More for this comment" className="items-center justify-center" style={TAP}>
            <Icon name="ellipsis-horizontal" size={18} color={props.iconColour.muted} />
          </Pressable>
        </Box>
      )}
    </Box>
  );
}
