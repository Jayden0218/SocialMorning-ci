// Groups an ordered list of comments into the nodes of the spine, and finds the node nearest a moment.
/**
 * M31 W2-B (`social.html` `node`; `index.html#comments--screen` notes "Orders"). In "By moment" the spine groups top-level
 * comments under one moment chip — those within the same second share a node, in the order they come — with "n reacted"
 * beside it; in the other orders every comment is its own node and carries its own chip. A comment with no moment gets a node
 * with no chip. "n reacted" counts what listeners did at that moment: the comments, their likes and their replies — the app
 * has no per-moment reaction count (the heat curve is normalised 0–1), so this is the nearest true number.
 * Pure: tested without a phone.
 */
import type { Comment } from '@/social/api';
import { replyCountOf } from '@/social/comment-extras-api';

export type Node = {
  key: string;
  /** The chip's moment in ms, or null (no moment). */
  momentMs: number | null;
  /** "41 reacted" — only in By moment. */
  reacted?: number;
  comments: Comment[];
};

/** What listeners did at a moment: each comment, its likes and its replies. */
export function reactedCount(comments: readonly Comment[], likeOf: (c: Comment) => number = (c) => c.likeCount ?? 0): number {
  return comments.reduce((n, c) => n + (c.deleted ? 0 : 1 + likeOf(c) + replyCountOf(c)), 0);
}

export function buildNodes(ordered: readonly Comment[], byMoment: boolean, likeOf?: (c: Comment) => number): Node[] {
  const out: Node[] = [];
  for (const c of ordered) {
    const sec = c.offsetMs === null ? null : Math.floor(c.offsetMs / 1000);
    const last = out[out.length - 1];
    if (byMoment && last && last.momentMs !== null && sec !== null && Math.floor(last.momentMs / 1000) === sec) {
      last.comments.push(c);
      last.reacted = reactedCount(last.comments, likeOf);
      continue;
    }
    out.push({ key: c.id, momentMs: c.offsetMs, ...(byMoment && c.offsetMs !== null ? { reacted: reactedCount([c], likeOf) } : {}), comments: [c] });
  }
  return out;
}

/** The index of the node whose moment is nearest `ms` (nodes with no moment are skipped); -1 when none has one. */
export function nearestNode(nodes: readonly Node[], ms: number): number {
  let best = -1;
  let gap = Infinity;
  nodes.forEach((n, i) => {
    if (n.momentMs === null) return;
    const d = Math.abs(n.momentMs - ms);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}
