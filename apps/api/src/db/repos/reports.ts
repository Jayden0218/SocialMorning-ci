/**
 * M6 reports (FR-001–FR-005, R7): one row per reporter per target (the UNIQUE key is
 * G3), a copy of the target at report time (G4), hidden for the reporter at once.
 */
import { closeReason, hiddenKey, type TargetKind } from '@socialmorning/social-core';
import type { Db } from '../db.ts';

export type Snapshot = Record<string, unknown>;

/** The target as it is now: what to copy, who wrote it, whether it is already gone. */
export async function snapshotTarget(db: Db, kind: TargetKind, id: string): Promise<{ snapshot: Snapshot; authorId: string | null; gone: boolean }> {
  switch (kind) {
    case 'comment': {
      const [r] = await db.query<{ body: string | null; offset_ms: number | null; author_id: string | null; display_name: string | null; episode_id: string; deleted_at: string | null; removed_at: string | null; title: string }>(
        `SELECT c.body, c.offset_ms, c.author_id, l.display_name, c.episode_id, c.deleted_at, c.removed_at, e.title
         FROM comments c LEFT JOIN listeners l ON l.id = c.author_id JOIN episodes e ON e.id = c.episode_id WHERE c.id = $1`, [id]);
      if (!r || r.deleted_at !== null || r.removed_at !== null) return { snapshot: { kind, id }, authorId: null, gone: true };
      return { snapshot: { kind, id, body: r.body, offsetMs: r.offset_ms, authorId: r.author_id, authorName: r.display_name, episodeId: r.episode_id, episodeTitle: r.title }, authorId: r.author_id, gone: false };
    }
    case 'clip': {
      const [r] = await db.query<{ caption: string; start_ms: number; end_ms: number; author_id: string; display_name: string; episode_id: string; deleted_at: string | null; removed_at: string | null; title: string }>(
        `SELECT c.caption, c.start_ms, c.end_ms, c.author_id, l.display_name, c.episode_id, c.deleted_at, c.removed_at, e.title
         FROM clips c JOIN listeners l ON l.id = c.author_id JOIN episodes e ON e.id = c.episode_id WHERE c.id = $1`, [id]);
      if (!r || r.deleted_at !== null || r.removed_at !== null) return { snapshot: { kind, id }, authorId: null, gone: true };
      return { snapshot: { kind, id, caption: r.caption, startMs: r.start_ms, endMs: r.end_ms, authorId: r.author_id, authorName: r.display_name, episodeId: r.episode_id, episodeTitle: r.title }, authorId: r.author_id, gone: false };
    }
    case 'profile': {
      const [r] = await db.query<{ id: string; display_name: string }>('SELECT id, display_name FROM listeners WHERE id = $1', [id]);
      if (!r) return { snapshot: { kind, id }, authorId: null, gone: true };
      return { snapshot: { kind, id, displayName: r.display_name }, authorId: r.id, gone: false };
    }
    case 'show': {
      const [r] = await db.query<{ show_title: string | null }>('SELECT show_title FROM episodes WHERE feed_url = $1 LIMIT 1', [id]);
      return { snapshot: { kind, id, feedUrl: id, showTitle: r?.show_title ?? null }, authorId: null, gone: false };
    }
  }
}

export type CreateResult = { id: string; duplicate: boolean; closed?: 'already_gone' };

export async function createReport(
  db: Db, r: { kind: TargetKind; targetId: string; reporterId: string; reason: string; note?: string },
): Promise<CreateResult> {
  const { snapshot, gone } = await snapshotTarget(db, r.kind, r.targetId);
  const close = closeReason(gone, false);
  const rows = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO reports (target_kind, target_id, reporter_id, reason, note, snapshot, closed_at, close_reason)
     VALUES ($1, $2, $3, $4, $5, ($6::text)::jsonb, CASE WHEN $7::text = 'open' THEN NULL ELSE now() END, CASE WHEN $7::text = 'open' THEN NULL ELSE $7::text END)
     -- G3 BROKEN ON PURPOSE
     RETURNING id, (xmax = 0) AS inserted`,
    [r.kind, r.targetId, r.reporterId, r.reason, r.note ?? null, JSON.stringify({ kind: r.kind, id: r.targetId }) /* G4 BROKEN ON PURPOSE */, close],
  );
  const row = rows[0]!;
  return { id: row.id, duplicate: !row.inserted, ...(close === 'already_gone' ? { closed: 'already_gone' as const } : {}) };
}

export async function reportsInLastHour(db: Db, reporterId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '1 hour'", [reporterId]);
  return Number(r?.n ?? 0);
}

/** The keys the viewer reported (comment/clip/profile ids, show feed URLs) — hidden for them whatever the owner decides (FR-002). */
export async function hiddenFor(db: Db, viewerId: string): Promise<{ keys: Set<string>; reported: { kind: TargetKind; id: string }[] }> {
  const rows = await db.query<{ target_kind: TargetKind; target_id: string }>('SELECT target_kind, target_id FROM reports WHERE reporter_id = $1', [viewerId]);
  return { keys: new Set(rows.map((r) => hiddenKey(r.target_kind, r.target_id))), reported: rows.map((r) => ({ kind: r.target_kind, id: r.target_id })) };
}

export type QueueRow = {
  id: string; target_kind: TargetKind; target_id: string; reporter_id: string | null; display_name: string | null;
  reason: string; note: string | null; snapshot: unknown; created_at: string; closed_at: string | null; close_reason: string | null;
};

export async function openReports(db: Db): Promise<QueueRow[]> {
  return db.query<QueueRow>(
    `SELECT r.id, r.target_kind, r.target_id, r.reporter_id, l.display_name, r.reason, r.note, r.snapshot, r.created_at, r.closed_at, r.close_reason
     FROM reports r LEFT JOIN listeners l ON l.id = r.reporter_id WHERE r.closed_at IS NULL ORDER BY r.created_at DESC`,
  );
}

export async function closedReports(db: Db, days: number): Promise<QueueRow[]> {
  return db.query<QueueRow>(
    `SELECT r.id, r.target_kind, r.target_id, r.reporter_id, l.display_name, r.reason, r.note, r.snapshot, r.created_at, r.closed_at, r.close_reason
     FROM reports r LEFT JOIN listeners l ON l.id = r.reporter_id
     WHERE r.closed_at IS NOT NULL AND r.closed_at > now() - ($1 || ' days')::interval ORDER BY r.closed_at DESC`, [String(days)],
  );
}

export async function closeReportsFor(db: Db, kind: TargetKind, targetId: string, actionId: string | null, reason: string): Promise<number> {
  const rows = await db.query<{ id: string }>(
    'UPDATE reports SET closed_at = now(), closed_by = $3, close_reason = $4 WHERE target_kind = $1 AND target_id = $2 AND closed_at IS NULL RETURNING id',
    [kind, targetId, actionId, reason],
  );
  return rows.length;
}

/** FR-016: closed reports (and their copies) are kept for `days` days, then deleted. */
export async function purgeClosedOlderThan(db: Db, days: number): Promise<number> {
  const rows = await db.query<{ id: string }>("DELETE FROM reports WHERE closed_at IS NOT NULL AND closed_at < now() - ($1 || ' days')::interval RETURNING id", [String(days)]);
  return rows.length;
}
