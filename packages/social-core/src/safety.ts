/**
 * M6 report / block rules (specs/006-m6-fit-to-ship/data-model.md "Pure rules").
 * The server runs `applyBlocks` over every per-viewer answer and the phone runs it over
 * its cached copies with the same sets — the two cannot disagree (plan, Complexity).
 */
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'illegal', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_NOTE_MAX = 500;

export type TargetKind = 'comment' | 'clip' | 'profile' | 'show';
export const TARGET_KINDS: readonly TargetKind[] = ['comment', 'clip', 'profile', 'show'];

/** Who may report: nobody signed out; never one's own content (delete it instead). */
export function canReport(viewerId: string | undefined, authorId: string | null): 'ok' | 'sign_in' | 'own' {
  if (viewerId === undefined) return 'sign_in';
  if (authorId !== null && authorId === viewerId) return 'own';
  return 'ok';
}

/** Who may block: nobody signed out; not yourself; not the owner (the moderator must stay reachable). */
export function canBlock(viewerId: string | undefined, targetId: string, ownerId: string | undefined): 'ok' | 'sign_in' | 'self' | 'owner' {
  if (viewerId === undefined) return 'sign_in';
  if (targetId === viewerId) return 'self';
  if (ownerId !== undefined && targetId === ownerId) return 'owner';
  return 'ok';
}

export function hiddenKey(kind: TargetKind, id: string): string {
  return `${kind}\u0001${id}`;
}

export type BlockedPlaceholder = { placeholder: 'blocked'; id: string; parentId: string };
export type Named = { id: string; authorId: string | null; parentId?: string | null; key?: string };

/**
 * Drops items whose author the viewer blocked or whose key the viewer reported. A reply
 * whose parent stays visible becomes a placeholder so the thread keeps its shape (G2);
 * a top-level item, or a reply whose parent is gone too, is dropped.
 */
export function applyBlocks<T extends Named>(
  items: readonly T[],
  blocked: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
): (T | BlockedPlaceholder)[] {
  const gone = (i: T): boolean => (i.authorId !== null && blocked.has(i.authorId)) || (i.key !== undefined && hidden.has(i.key));
  const keptIds = new Set(items.filter((i) => !gone(i)).map((i) => i.id));
  const out: (T | BlockedPlaceholder)[] = [];
  for (const i of items) {
    if (!gone(i)) { out.push(i); continue; }
    const parentId = i.parentId ?? null;
    if (parentId !== null && keptIds.has(parentId) && i.authorId !== null && blocked.has(i.authorId)) {
      // G2 BROKEN ON PURPOSE: dropped
    }
  }
  return out;
}
