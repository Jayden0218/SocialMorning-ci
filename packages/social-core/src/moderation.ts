/** M6 moderation queue rules: grouping, the actions a kind allows, how an item closes. */
import type { TargetKind } from './safety';

export const RETENTION_DAYS = 90;
export const REPORTS_PER_HOUR = 20;

export type ReportRow = {
  targetKind: TargetKind;
  targetId: string;
  reporterId: string | null;
  reporterName: string | null;
  reason: string;
  note: string | null;
  snapshot: unknown;
  createdAt: number;
};

export type QueueItem = {
  targetKind: TargetKind;
  targetId: string;
  count: number;
  firstAt: number;
  latestAt: number;
  reasons: string[];
  reporters: string[];
  notes: string[];
  snapshot: unknown;
};

export const DELETED_REPORTER = 'a deleted account';

/** One item per target, newest report first; the snapshot is the first report's (the earliest copy). */
export function groupReports(rows: readonly ReportRow[]): QueueItem[] {
  const byKey = new Map<string, QueueItem>();
  const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
  for (const r of sorted) {
    const key = `${r.targetKind}\u0001${r.targetId}`;
    const item = byKey.get(key);
    const reporter = r.reporterName ?? DELETED_REPORTER;
    if (!item) {
      byKey.set(key, {
        targetKind: r.targetKind, targetId: r.targetId, count: 1, firstAt: r.createdAt, latestAt: r.createdAt,
        reasons: [r.reason], reporters: [reporter], notes: r.note ? [r.note] : [], snapshot: r.snapshot,
      });
      continue;
    }
    item.count += 1;
    item.latestAt = Math.max(item.latestAt, r.createdAt);
    if (!item.reasons.includes(r.reason)) item.reasons.push(r.reason);
    item.reporters.push(reporter);
    if (r.note) item.notes.push(r.note);
  }
  return [...byKey.values()].sort((a, b) => b.latestAt - a.latestAt);
}

export type Action = 'dismiss' | 'remove' | 'hide_show' | 'suspend' | 'unsuspend' | 'unhide_show';

/** What the owner may do to an item of this kind. */
export function actionsFor(kind: TargetKind): Action[] {
  switch (kind) {
    case 'comment':
    case 'clip':
      return ['dismiss', 'remove', 'suspend'];
    case 'profile':
      return ['dismiss', 'suspend'];
    case 'show':
      return ['dismiss', 'hide_show'];
  }
}

/** How a report closes without the owner: the target already gone, or its author gone. */
export function closeReason(targetGone: boolean, authorGone: boolean): 'already_gone' | 'author_deleted' | 'open' {
  if (targetGone) return 'already_gone';
  if (authorGone) return 'author_deleted';
  return 'open';
}
