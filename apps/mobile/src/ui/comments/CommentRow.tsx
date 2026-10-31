// One comment card on the thread: avatar, name, age, words, voice or picture, like, reply, replies link, more.
/**
 * M31 W2-B (T032; `design-pulse2/social.html` `cmt`, `index.html#comments--screen`). A comment is a raise card (radius
 * 18, padding 12, 7 between its parts) 56 from the node's left edge on the spine; a reply steps in 30 more and is a card
 * of its own. Top row: a 24 avatar, the name (Geist 600 14; "You" on your own), the light HOST tag, the age in mono 11
 * (text3) — "5h", with the commenter's country after it when the server sent one. Then the words (Body 15/22), the voice
 * block or the picture, and the action row: heart (+ count in mono), "Reply", "n replies ›" in hot text, the ⋯ at the
 * right. A pinned comment starts with a mono 11 hot-text line; a folded one is a dashed card; a held one carries "Only
 * you". The moment is not in the card any more: it is the chip on the spine above it (CommentThread).
 *
 * What stayed (the action replay): a tap or long-press on the words opens the menu, the same menu as ⋯; the heart likes
 * (not on your own); "Reply" opens the composer for the comment; "n replies ›" opens the reply page; the name opens the
 * profile; "Show" unfolds a hidden comment; "More" / "Less" folds long text. The card's spoken name is one line — name,
 * age, "Play from m:ss", the words — which the iOS journey reads (`.maestro/journey.yaml`).
 *
 * Earlier (kept in the code below): M12 US2 (FR-022/024/025) public likes, "Show N more"; M17/M19/M21/M22 pins, folds,
 * voice, pictures, badges and the region.
 */
import { useState } from 'react';
import { Link } from '@/design/tailwind';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { Avatar } from '@/ui/kit/Avatar';
import { plural } from '@socialmorning/social-core';
import { compactCount, mmss, pluralCompact, relativeTime } from '@/ui/kit/format';
import { Placeholder, placeholderFor } from './Placeholder';
import { colour } from '@/design';
import type { Comment } from '@/social/api';
import { countryName } from '@/ui/me/country';
import { badgeLabel, extrasOf, m21Of, replyCountOf } from '@/social/comment-extras-api';
import { VoiceComment, type PlayVoice } from './VoiceComment';
import { CommentImage } from './CommentImage';
import { COMMENTS, cardLeft } from './measures';
import { drawnType } from '@/design/type-px';

/** The avatar's letter: what the server sent, else the name's first letter or digit. */
export function initialsFor(c: Pick<Comment, 'initials' | 'displayName'>): string {
  if (c.initials) return c.initials;
  const m = /[\p{L}\p{N}]/u.exec(c.displayName ?? '');
  return m ? m[0].toUpperCase() : '·';
}

export type LikeView = { count: number; liked: boolean };

/** How many replies show under a comment before "n replies ›" (the rest are on the reply page). */
export const REPLY_PREVIEW = 2;

/**
 * The commenter's IP location, as a country name. M21 US6: the server sends `country` on each
 * comment — the two letters it saw when the comment was posted; nothing when unknown.
 */
export function placeOf(c: Comment): string | undefined {
  const code = m21Of(c).country;
  return code ? countryName(code) : undefined;
}

/** "3 min ago · Malaysia", or just the time. */
export function timeAndPlace(createdAt: string, serverTime: string, place: string | undefined): string {
  const when = relativeTime(createdAt, serverTime);
  return place ? `${when} · ${place}` : when;
}

/** The drawing's age: "now", "5m", "4h", "3d" (from the SERVER clock, never negative). */
export function shortAgo(createdAt: string, serverTime: string): string {
  const s = Math.max(0, Math.round((new Date(serverTime).getTime() - new Date(createdAt).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/** "5h", or "5h · Malaysia" — what sits after the name in mono 11. */
export function agoAndPlace(createdAt: string, serverTime: string, place: string | undefined): string {
  const when = shortAgo(createdAt, serverTime);
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
  return total > 0 ? `${pluralCompact(total, 'reply', 'replies')} ›` : undefined;
}

/**
 * The 48 pt tap a 16 pt glyph row needs: 8 above (the 7 between the parts), 24 below (12 of padding, the 10 between
 * cards, 2 into the next) and 8 to each side (half the 16 between actions).
 */
const ACTION_SLOP = { top: 8, bottom: 24, left: 8, right: 8 };
const ROW = { gap: COMMENTS.actionGap };
/** Drawn `line-height: 1` lines: the pin words 13, the action row's words 16 (the row is the 16 heart), so the card is not taller than drawn. */
const LINE_PIN = { lineHeight: COMMENTS.pinLine };
const LINE_ACTION = { lineHeight: COMMENTS.heart };
/** M31 F13 (widths W6): after a long name the age keeps room for "2h" and ellipsizes instead of being cut to "2". */
const AGE = { flexShrink: 1, minWidth: 24 } as const;

export function CommentRow(props: {
  c: Comment;
  serverTime: string;
  /** The like state to show — the page's instant (optimistic) copy, falling back to the server's. */
  likeOf: (c: Comment) => LikeView;
  /** Kept so older callers compile; the card takes its colours from the tokens. */
  iconColour?: { muted: string; accent: string };
  onSeek: (offsetMs: number) => void;
  onLike: (c: Comment) => void;
  onMenu: (c: Comment) => void;
  isReply?: boolean;
  /** Shows "Reply" on a top-level card; it opens the composer for this comment. */
  onReply?: (c: Comment) => void;
  /** M19 FR-043: opens the reply page; without it (the reply page itself) no replies are drawn under the card. */
  onOpenThread?: (c: Comment) => void;
  /** M19 FR-044: plays a voice comment (`playVoice` from the playback adapter, passed by the page). */
  playVoice?: PlayVoice;
  /** M20 US9: teen mode ("hide explicit") — comment pictures start hidden behind "Tap to show". */
  teenMode?: boolean;
  /** How far in the card sits: 0 on the spine, 1 for a reply (30 more). The replies page draws every card at 0. */
  level?: number;
  /** The card is the one being answered (the reply sheet is open): a 1.5 hot ring. */
  ringed?: boolean;
  /** No spine: the card starts at the page's edge (the episode page's two newest comments). */
  flush?: boolean;
}): React.ReactElement {
  const { c } = props;
  const like = props.likeOf(c);
  const [open, setOpen] = useState(false);
  const [unfold, setUnfold] = useState(false);
  const reply = props.isReply === true;
  const level = props.level ?? (reply ? 1 : 0);
  const left = { marginLeft: props.flush === true ? 0 : cardLeft(level) };
  const kind = placeholderFor(c, c.reported);
  if (kind !== undefined) {
    return <Box className="bg-raise" style={[left, CARD]}><Placeholder kind={kind} /></Box>;
  }
  const extra = extrasOf(c);
  // FR-041: folded for everyone at 5 "unfriendly" marks — one dashed card that opens it.
  if (extra.folded && !unfold) {
    return (
      <Pressable onPress={() => setUnfold(true)} accessibilityRole="button" accessibilityLabel="Show hidden comment" className="border border-line" style={[left, CARD, DASHED]}>
        <Type step="caption" className="text-text3">Hidden for being unfriendly — <Type step="caption" className="text-hotText font-bold">Show</Type></Type>
      </Pressable>
    );
  }

  const replies = c.replies ?? [];
  const shownReplies = replies.slice(0, REPLY_PREVIEW);
  const total = replyCountOf(c);
  const link = !reply && props.onOpenThread ? repliesLink(total) : undefined;
  const name = c.displayName ?? 'Deleted account';
  const shownName = c.mine ? 'You' : name;
  const badge = m21Of(c).badge;
  const serverTime = props.serverTime;
  const age = agoAndPlace(c.createdAt, serverTime, placeOf(c));
  const spoken = [name, relativeTime(c.createdAt, serverTime), c.offsetMs !== null ? `Play from ${mmss(c.offsetMs)}` : undefined, c.body ?? undefined].filter((x): x is string => x !== undefined && x !== '').join(', ');
  const pinned = !reply && (extra.pinned || (c as Comment & { pinnedBottom?: true }).pinnedBottom === true);

  const heart = (
    <>
      <Icon name={like.liked ? 'heart' : 'heart-outline'} size={COMMENTS.heart} color={like.liked ? colour.hotText : colour.text2} />
      {like.count > 0 ? <Type step="mono" className={like.liked ? 'text-hotText' : 'text-text2'} style={LINE_ACTION}>{compactCount(like.count)}</Type> : null}
    </>
  );

  const card = (
    <Box className="bg-raise" style={[left, CARD, props.ringed ? RING : null]} testID="comment-card">
      {extra.pinned ? (
        <Box className="flex-row items-center" style={PIN_ROW} accessible accessibilityLabel="Pinned by the host">
          <Icon name="pin" size={13} color={colour.hotText} />
          <Type step="tag" className="text-hotText font-semibold" style={PIN_WORDS}>PINNED BY THE HOST</Type>
        </Box>
      ) : null}
      {/* M22 US10: the bottom pin says so too (it sits last under every order). */}
      {!extra.pinned && pinned ? (
        <Box className="flex-row items-center" style={PIN_ROW} accessible accessibilityLabel="Pinned to the bottom by the host">
          <Icon name="pin" size={13} color={colour.hotText} />
          <Type step="tag" className="text-hotText font-semibold" style={PIN_WORDS}>PINNED BY THE HOST</Type>
        </Box>
      ) : null}
      <Pressable
        onPress={() => props.onMenu(c)}
        onLongPress={() => props.onMenu(c)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Opens reply, share, save, copy, mute and report"
        accessibilityActions={[{ name: 'longpress', label: 'More actions' }]}
        onAccessibilityAction={() => props.onMenu(c)}
        style={BODY}
      >
        <Box className="flex-row items-center" style={HEAD}>
          {/* M19 T014: the author's photo when they set one; the coloured letter disc otherwise. */}
          <Avatar size={COMMENTS.avatar} url={c.avatarUrl} name={c.displayName} />
          {c.authorId !== null ? (
            <Link href={{ pathname: '/profile/[id]', params: { id: c.authorId } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={name} className="flex-shrink min-w-0"><Type step="compact" className="text-text" numberOfLines={1}>{shownName}</Type></Pressable>
            </Link>
          ) : <Type step="compact" className="text-text flex-shrink" numberOfLines={1}>{shownName}</Type>}
          {c.host ? <Type step="badge" className="bg-text text-void" style={HOST} numberOfLines={1} accessibilityLabel="Host of this show">HOST</Type> : null}
          {badge ? <Type step="badge" className="bg-hotSoft text-hotText" style={HOST} numberOfLines={1} accessibilityLabel={`Has listened ${badge} hours or more`}>{badgeLabel(badge)}</Type> : null}
          <Type step="tag" className="text-text3 flex-shrink" style={AGE} numberOfLines={1}>{age}</Type>
          {c.held ? <Type step="tag" className="text-hotText">Only you</Type> : null}
        </Box>
        {/* iPhone walk 2026-10-06: a voice comment has no words — draw no empty line (it left a gap). */}
        {c.body ? <Type step="body" className="text-text" numberOfLines={open ? undefined : 8}>{c.body}</Type> : null}
        {extra.voice && props.playVoice ? <VoiceComment voice={extra.voice} play={props.playVoice} /> : null}
        {extra.image ? <CommentImage image={extra.image} teen={props.teenMode === true} by={{ name: shownName, offsetMs: c.offsetMs }} /> : null}
        {(c.body ?? '').length > 320 ? (
          <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={open ? 'Less' : 'More'} hitSlop={SLOP_MORE} className="self-start">
            <Type step="caption" className="text-hotText font-semibold">{open ? 'Less' : 'More'}</Type>
          </Pressable>
        ) : null}
        {c.hiddenByHost ? <Type step="caption" className="text-text3 italic">Hidden by the host — only you can see it</Type> : null}
      </Pressable>
      <Box className="flex-row items-center" style={ROW}>
        {c.mine ? (
          like.count > 0 ? <Box className="flex-row items-center" style={HEART}>{heart}</Box> : null
        ) : (
          <Pressable
            onPress={() => props.onLike(c)}
            accessibilityRole="button"
            accessibilityState={{ selected: like.liked }}
            accessibilityLabel={`${like.liked ? 'Unlike' : 'Like'}. ${plural(like.count, 'like')}`}
            hitSlop={ACTION_SLOP}
            className="flex-row items-center"
            style={HEART}
          >
            {heart}
          </Pressable>
        )}
        {!reply && props.onReply ? (
          <Pressable onPress={() => props.onReply?.(c)} accessibilityRole="button" accessibilityLabel="Reply" hitSlop={ACTION_SLOP}>
            <Type step="caption" className="text-text2" style={LINE_ACTION}>Reply</Type>
          </Pressable>
        ) : null}
        {link ? (
          <Pressable onPress={() => props.onOpenThread?.(c)} accessibilityRole="link" accessibilityLabel={`${link.replace(' ›', '')}. Open the replies`} hitSlop={ACTION_SLOP}>
            <Type step="caption" className="text-hotText" style={LINE_ACTION}>{link}</Type>
          </Pressable>
        ) : null}
        <Box className="flex-1" />
        <Pressable onPress={() => props.onMenu(c)} accessibilityRole="button" accessibilityLabel="More for this comment" hitSlop={ACTION_SLOP}>
          <Icon name="ellipsis-horizontal" size={COMMENTS.heart} color={colour.text2} />
        </Pressable>
      </Box>
    </Box>
  );
  if (reply || !props.onOpenThread || shownReplies.length === 0) return card;
  return (
    <Box style={NODE}>
      {card}
      {shownReplies.map((r) => <CommentRow key={r.id} {...props} c={r} isReply />)}
    </Box>
  );
}

const CARD = { borderRadius: COMMENTS.cardRadius, padding: COMMENTS.cardPad, gap: COMMENTS.cardGap };
const DASHED = { borderStyle: 'dashed' as const };
const RING = { borderWidth: 1.5, borderColor: colour.hot };
const BODY = { gap: COMMENTS.cardGap };
const HEAD = { gap: 8 };
const HEART = { gap: 5 };
const PIN_ROW = { gap: 6 };
const PIN_WORDS = { ...drawnType.trackPin, ...LINE_PIN };
const HOST = { flexShrink: 0, minHeight: COMMENTS.hostTag.height, paddingHorizontal: COMMENTS.hostTag.pad, borderRadius: COMMENTS.hostTag.radius, overflow: 'hidden' as const, textAlignVertical: 'center' as const };
const NODE = { gap: COMMENTS.nodeInner };
const SLOP_MORE = { top: 12, bottom: 12, left: 8, right: 8 };
