// Comments: create, list as threads, delete, and shape them for each viewer.
import { hostsOfEpisode } from '../studio/creator.ts';
import { applyBlocks, hiddenKey } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { blockedIdsFor } from '../safety/blocks.ts';
import { hiddenFor } from '../safety/reports.ts';
import { initialsOf, type LikeState } from './comment-likes.ts';
import { viaStore } from '../../backend.ts';
import { mutedIdsFor } from './mutes.ts';
import { heldForAuthor } from '../studio/comment-policy.ts';

export type CommentRow = {
  id: string;
  episode_id: string;
  author_id: string | null;
  display_name: string | null;
  /** M19 US1: the author's photo, when set. */
  avatar_url?: string | null;
  parent_id: string | null;
  body: string | null;
  offset_ms: number | null;
  created_at: Date | string;
  deleted_at: Date | string | null;
  removed_at: Date | string | null;
  /** M11: hidden by the show's host in the Studio — gone for everyone but its author. */
  host_hidden_at?: Date | string | null;
  /** M19 US5/US6: pinned by a host; a voice recording instead of (or with) text. */
  pinned_at?: Date | string | null;
  /** M22 US10: pinned to the bottom by a host — last under every order. */
  pinned_bottom_at?: Date | string | null;
  voice_url?: string | null;
  voice_ms?: number | null;
  /** M20 US3: the text of a voice comment, as its author checked it. */
  transcript?: string | null;
  /** M20 US9: one image (constitution v3.2.0), in the R2 store. */
  image_url?: string | null;
  image_path?: string | null;
  image_w?: number | null;
  image_h?: number | null;
  /** M21 US6: the region the server saw at post time (two letters), and the author's badge inputs. */
  country?: string | null;
  author_listened_ms?: number | string | null;
  author_hide_badge?: boolean | null;
  /** M22 US11: the author asked to delete their account and is hidden during the 15-day wait. */
  author_hidden_at?: Date | string | null;
};

/** M21 US6: the listening badge — 100 h, 500 h or 1000 h of total listening; none below 100 h. */
export type Badge = 100 | 500 | 1000;
const HOUR_MS = 3_600_000;
export function badgeFor(listenedMs: number | string | null | undefined, hidden: boolean | null | undefined): Badge | null {
  if (hidden) return null;
  const hours = Number(listenedMs ?? 0) / HOUR_MS;
  return hours >= 1000 ? 1000 : hours >= 500 ? 500 : hours >= 100 ? 100 : null;
}

export type PublicComment = {
  id: string;
  authorId: string | null;
  displayName: string | null;
  body: string | null;
  offsetMs: number | null;
  parentId: string | null;
  createdAt: string;
  deleted: boolean;
  /** M6: taken down by moderation — a placeholder for everyone; the author sees why. */
  removed?: boolean;
  /** M6: a reply by a listener the viewer blocked — a placeholder so the thread keeps its shape (G2). */
  blocked?: boolean;
  /** M6 (FR-002): the VIEWER reported this; it reads "You reported this" for them and nobody else. */
  reported?: boolean;
  mine?: boolean;
  replies?: PublicComment[];
  /** M10b US8: written by the show's proven creator. */
  host?: true;
  /** M11 (FR-016): the host hid it. Others get a placeholder; the author still reads it, marked. */
  hiddenByHost?: true;
  /** M12 (FR-023): the author's avatar letter — first letter or digit of the name, upper-cased; null for a placeholder. */
  initials: string | null;
  /** M19 US1: the author's photo; absent for a placeholder or an author without one. */
  avatarUrl?: string;
  /** M12 (FR-023): how many listeners liked it. */
  likeCount: number;
  /** M12 (FR-023): present only when signed in — whether the viewer is one of them. */
  likedByMe?: boolean;
  /** M19 US5: pinned by the show's host — first under every order. */
  pinned?: true;
  /** M22 US10 (FR-030, G-M22-11): pinned to the bottom by the show's host — last under every order. */
  pinnedBottom?: true;
  /** M19 US5: marked unfriendly by 5 or more listeners — folded behind "show"; never says by whom. */
  folded?: true;
  /** M19 US5: how many replies it has (the Smart sort and the "n replies" link). */
  replyCount?: number;
  /** M19 US6: a voice comment — its recording and length; M20 US3: its text, when there is one. */
  voice?: { url: string; ms: number; text?: string };
  /** M20 US9: its image, when there is one. */
  image?: { url: string; w: number; h: number };
  /** M21 US6: the region it was posted from (two letters), null when unknown or a placeholder. */
  country: string | null;
  /** M21 US6: the author's listening badge; null below 100 h, when hidden, or for a placeholder. */
  badge: Badge | null;
  /** M24 US8: waiting for the host's review — only its author is ever given it. */
  held?: true;
};

export function toPublic(r: CommentRow, viewerId?: string): PublicComment {
  const removed = r.removed_at !== null;
  // M11 guard G-H1: a host-hidden comment is a placeholder for everyone except its author.
  const hostHidden = r.host_hidden_at != null && !removed && r.deleted_at === null;
  const authorSees = hostHidden && viewerId !== undefined && r.author_id === viewerId;
  const deleted = r.deleted_at !== null || removed || (hostHidden && !authorSees);
  return {
    id: r.id,
    authorId: deleted ? null : r.author_id,
    displayName: deleted ? null : r.display_name,
    body: deleted ? null : r.body,
    offsetMs: deleted ? null : r.offset_ms,
    parentId: r.parent_id,
    createdAt: new Date(r.created_at).toISOString(),
    deleted,
    initials: deleted ? null : initialsOf(r.display_name),
    ...(!deleted && r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
    ...(!deleted && r.pinned_at ? { pinned: true as const } : {}),
    ...(!deleted && r.pinned_bottom_at ? { pinnedBottom: true as const } : {}),
    ...(!deleted && r.voice_url && r.voice_ms ? { voice: { url: r.voice_url, ms: Number(r.voice_ms), ...(r.transcript ? { text: r.transcript } : {}) } } : {}),
    ...(!deleted && r.image_url && r.image_w && r.image_h ? { image: { url: r.image_url, w: Number(r.image_w), h: Number(r.image_h) } } : {}),
    likeCount: 0,
    country: deleted ? null : (r.country?.trim() || null),
    badge: deleted ? null : badgeFor(r.author_listened_ms, r.author_hide_badge),
    ...(viewerId !== undefined ? { likedByMe: false } : {}),
    ...(removed ? { removed: true } : {}),
    ...(hostHidden ? { hiddenByHost: true } : {}),
    ...((r as CommentRow & { blocked?: true }).blocked ? { blocked: true } : {}),
    ...((r as CommentRow & { reported?: true }).reported ? { reported: true } : {}),
    ...(viewerId !== undefined ? { mine: (!deleted || removed || authorSees) && r.author_id === viewerId } : {}),
  };
}

/**
 * The episode's comments (oldest first, every row) shaped for one viewer: hidden accounts, mutes, blocks and
 * reports applied, Host marks, like counts, folds, held comments, threads and the two pins. Called by the
 * DynamoDB body of `listComments` (ddb/comments.ts).
 */
export async function buildThreads(
  db: Db, fetchedAll: CommentRow[], episodeId: string, viewerId: string | undefined, opts: { dir?: 'asc' | 'desc' },
  likes: Map<string, LikeState>, folded: Set<string>,
): Promise<PublicComment[]> {
  // M22 US11 (G-M22-8): an account waiting to be deleted is hidden from everyone else — its comments
  // and the replies under them, the way a mute hides them; Keep brings them all back.
  const fetched = fetchedAll.filter((r) => r.author_hidden_at == null || (viewerId !== undefined && r.author_id === viewerId));
  // M21 US6 (G-M21-6): the viewer's muted listeners are gone from the viewer's reads only — their
  // comments and their replies. A reply under a muted listener's comment goes with it.
  const all = viewerId === undefined ? fetched : await withoutMuted(db, fetched, viewerId);
  // M6 (R1, G1): a signed-in viewer never sees a blocked listener's comments or what they reported.
  const rows = viewerId === undefined ? all : await filterForViewer(db, all, viewerId);
  const byId = new Map<string, PublicComment>();
  const top: PublicComment[] = [];
  // M10b US8 + M14: the show's proven creator's and invited hosts' comments carry a Host mark.
  const hosts = new Set(await hostsOfEpisode(db, episodeId));
  for (const r of rows) {
    const plain = toPublic(r, viewerId);
    const l = likes.get(r.id);
    const base = l ? { ...plain, likeCount: l.likeCount, ...(viewerId !== undefined ? { likedByMe: l.likedByMe } : {}) } : plain;
    const hosted = base.authorId !== null && hosts.has(base.authorId) ? { ...base, host: true as const } : base;
    const c = folded.has(r.id) && !hosted.deleted ? { ...hosted, folded: true as const } : hosted;
    byId.set(c.id, c);
    if (c.parentId === null) top.push({ ...c, replies: [] });
  }
  // M24 US8 (G-M24-1): the viewer's own comments held for review, marked `held`; nobody else gets them.
  const held = viewerId === undefined ? [] : await heldForAuthor(db, episodeId, viewerId);
  if (held.some((h) => h.parentId === null)) {
    for (const h of held) if (h.parentId === null) top.push({ ...h, replies: [] });
    top.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const topById = new Map(top.map((c) => [c.id, c]));
  for (const r of rows) {
    if (r.parent_id === null) continue;
    topById.get(r.parent_id)?.replies!.push(byId.get(r.id)!);
  }
  for (const h of held) if (h.parentId !== null) topById.get(h.parentId)?.replies!.push(h);
  const ordered = opts.dir === 'asc' ? top : top.reverse();
  // M22 US10 (G-M22-11): the bottom pin is last whichever way the list reads.
  const bottom = ordered.filter((c) => c.pinnedBottom === true);
  if (bottom.length > 0) ordered.splice(0, ordered.length, ...ordered.filter((c) => c.pinnedBottom !== true), ...bottom);
  return ordered.map((c) => ({ ...c, replyCount: c.replies!.length }));
}

/** M21 US6 (G-M21-6): drop what the viewer's muted listeners wrote. */
async function withoutMuted(db: Db, rows: CommentRow[], viewerId: string): Promise<CommentRow[]> {
  const muted = await mutedIdsFor(db, viewerId);
  if (muted.size === 0) return rows;
  return rows.filter((r) => r.author_id === null || !muted.has(r.author_id));
}

/** Blocked authors and reported ids out; a blocked reply under a kept parent stays as a placeholder row. */
async function filterForViewer(db: Db, rows: CommentRow[], viewerId: string): Promise<CommentRow[]> {
  const [blocked, hidden] = await Promise.all([blockedIdsFor(db, viewerId), hiddenFor(db, viewerId)]);
  if (blocked.size === 0 && hidden.keys.size === 0) return rows;
  const named = rows.map((r) => ({ id: r.id, authorId: r.author_id, parentId: r.parent_id, key: hiddenKey('comment', r.id), row: r }));
  return applyBlocks(named, blocked, hidden.keys).map((i) => {
    if (!('placeholder' in i)) return i.row;
    const original = rows.find((r) => r.id === i.id)!;
    const bare = { ...original, author_id: null, display_name: null, body: null, offset_ms: null, deleted_at: new Date(0), removed_at: null, voice_url: null, voice_ms: null, transcript: null, image_url: null, image_path: null, image_w: null, image_h: null, pinned_at: null, pinned_bottom_at: null };
    return (i.placeholder === 'reported'
      ? { ...bare, reported: true }
      : { ...bare, blocked: true }) as CommentRow & { blocked?: true; reported?: true };
  });
}

/** M19 US5 (FR-041): a comment folds once this many listeners marked it unfriendly. */
export const UNFRIENDLY_FOLD_AT = 5;

// Bodies in ddb/comments.ts (src/db/backend.ts).
export const createComment = viaStore<typeof import('./ddb/comments.ts').createComment>('sc/comments', 'createComment');
export const getComment = viaStore<typeof import('./ddb/comments.ts').getComment>('sc/comments', 'getComment');
export const placeholderComments = viaStore<typeof import('./ddb/comments.ts').placeholderComments>('sc/comments', 'placeholderComments');
export const deleteComment = viaStore<typeof import('./ddb/comments.ts').deleteComment>('sc/comments', 'deleteComment');
export const listComments = viaStore<typeof import('./ddb/comments.ts').listComments>('sc/comments', 'listComments');
export const requireRulesAccepted = viaStore<typeof import('./ddb/comments.ts').requireRulesAccepted>('sc/comments', 'requireRulesAccepted');
export const foldedOnEpisode = viaStore<typeof import('./ddb/comments.ts').foldedOnEpisode>('sc/comments', 'foldedOnEpisode');
export const setCommentRemoved = viaStore<typeof import('./ddb/comments.ts').setCommentRemoved>('sc/comments', 'setCommentRemoved');
export const setCommentHostHidden = viaStore<typeof import('./ddb/comments.ts').setCommentHostHidden>('sc/comments', 'setCommentHostHidden');
