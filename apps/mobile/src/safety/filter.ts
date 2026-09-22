/**
 * M6 (R1): the same `applyBlocks` the server runs, over the phone's cached payloads
 * with the phone's own sets — so a report or block hides its target on the screen that
 * is open right now, and offline.
 */
import { applyBlocks, hiddenKey } from '@socialmorning/social-core';
import type { Clip, ClipAuthor, Comment, FeedItem } from '../social/api';

export type Sets = { blocked: ReadonlySet<string>; hidden: ReadonlySet<string> };

/** Comments: blocked authors and reported ids out; a blocked reply under a kept parent becomes a placeholder. */
export function filterComments(comments: readonly Comment[], sets: Sets): Comment[] {
  if (sets.blocked.size === 0 && sets.hidden.size === 0) return [...comments];
  const flat: (Comment & { key: string })[] = [];
  for (const c of comments) {
    flat.push({ ...c, replies: undefined, key: hiddenKey('comment', c.id) });
    for (const r of c.replies ?? []) flat.push({ ...r, key: hiddenKey('comment', r.id) });
  }
  const kept = applyBlocks(flat, sets.blocked, sets.hidden);
  const byId = new Map<string, Comment>();
  const top: Comment[] = [];
  for (const k of kept) {
    const c: Comment = 'placeholder' in k
      ? { id: k.id, parentId: k.parentId, authorId: null, displayName: null, body: null, offsetMs: null, createdAt: flat.find((f) => f.id === k.id)!.createdAt, deleted: true, blocked: true }
      : (({ key: _k, ...rest }) => rest)(k);
    byId.set(c.id, c);
    if (c.parentId === null) top.push({ ...c, replies: [] });
  }
  const topById = new Map(top.map((c) => [c.id, c]));
  for (const c of byId.values()) if (c.parentId !== null) topById.get(c.parentId)?.replies!.push(c);
  return top;
}

export function filterClips(clips: readonly Clip[], sets: Sets): Clip[] {
  return clips.filter((c) => !sets.blocked.has(c.author.id) && !sets.hidden.has(hiddenKey('clip', c.id)));
}

export function filterFeed(items: readonly FeedItem[], sets: Sets): FeedItem[] {
  return items.filter((i) => !sets.blocked.has(i.actor.id));
}

export function filterListeners(list: readonly ClipAuthor[], sets: Sets): ClipAuthor[] {
  return list.filter((l) => !sets.blocked.has(l.id) && !sets.hidden.has(hiddenKey('profile', l.id)));
}
