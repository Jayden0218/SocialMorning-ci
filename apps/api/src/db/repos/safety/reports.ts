// Stores reports with a copy of the reported item, hidden for the reporter.
/**
 * M6 reports (FR-001–FR-005, R7): one row per reporter per target (the UNIQUE key is
 * G3), a copy of the target at report time (G4), hidden for the reporter at once.
 */
import { closeReason, hiddenKey, type TargetKind } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';

export type Snapshot = Record<string, unknown>;

/** M21 US2: the listener's correction of one transcript line (contracts/api.md). */
export type TranscriptDetail = { episodeId: string; offsetMs: number; original: string; suggested: string };

/** A transcript report's target id: one line of one episode, so the one-report-per-reporter key holds per line. */
export const transcriptTargetId = (episodeId: string, offsetMs: number): string => `${episodeId}#${offsetMs}`;

/** The target as it is now: what to copy, who wrote it, whether it is already gone. */
export async function snapshotTarget(db: Db, kind: TargetKind, id: string, detail?: TranscriptDetail): Promise<{ snapshot: Snapshot; authorId: string | null; gone: boolean }> {
  switch (kind) {
    // M21 US2: an episode, or one line of its transcript — the copy names the episode and its show.
    case 'episode':
    case 'transcript': {
      const episodeId = kind === 'episode' ? id : (detail?.episodeId ?? id.split('#')[0]!);
      const [r] = await db.query<{ title: string; show_title: string | null; feed_url: string }>('SELECT title, show_title, feed_url FROM episodes WHERE id = $1', [episodeId]);
      if (!r) return { snapshot: { kind, id }, authorId: null, gone: true };
      const base = { kind, id, episodeId, episodeTitle: r.title, showTitle: r.show_title, feedUrl: r.feed_url };
      return { snapshot: detail ? { ...base, offsetMs: detail.offsetMs, original: detail.original, suggested: detail.suggested } : base, authorId: null, gone: false };
    }
    case 'comment': {
      const [r] = await db.query<{ body: string | null; offset_ms: number | null; author_id: string | null; display_name: string | null; episode_id: string; deleted_at: string | null; removed_at: string | null; title: string; voice_url: string | null; transcript: string | null; image_url: string | null }>(
        `SELECT c.body, c.offset_ms, c.author_id, l.display_name, c.episode_id, c.deleted_at, c.removed_at, e.title, c.voice_url, c.transcript, c.image_url
         FROM comments c LEFT JOIN listeners l ON l.id = c.author_id JOIN episodes e ON e.id = c.episode_id WHERE c.id = $1`, [id]);
      if (!r || r.deleted_at !== null || r.removed_at !== null) return { snapshot: { kind, id }, authorId: null, gone: true };
      // M20 US3 (FR-010): a voice comment's recording and its text go into the copy the moderator reads.
      return { snapshot: { kind, id, body: r.body, offsetMs: r.offset_ms, authorId: r.author_id, authorName: r.display_name, episodeId: r.episode_id, episodeTitle: r.title, ...(r.voice_url ? { voiceUrl: r.voice_url } : {}), ...(r.transcript ? { voiceText: r.transcript } : {}), ...(r.image_url ? { imageUrl: r.image_url } : {}) }, authorId: r.author_id, gone: false };
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
    // M24 US1: a live status (voice or text), with its words and recording.
    case 'status': {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return { snapshot: { kind, id }, authorId: null, gone: true };
      const [r] = await db.query<{ listener_id: string; display_name: string; body: string | null; blob_url: string | null; transcript: string | null; live: boolean }>(
        `SELECT v.listener_id, l.display_name, v.body, v.blob_url, v.transcript, v.expires_at > now() AS live
           FROM voice_posts v JOIN listeners l ON l.id = v.listener_id WHERE v.id = $1`, [id]);
      if (!r || !r.live) return { snapshot: { kind, id }, authorId: null, gone: true };
      return { snapshot: { kind, id, authorId: r.listener_id, authorName: r.display_name, ...(r.body ? { body: r.body } : {}), ...(r.blob_url ? { voiceUrl: r.blob_url } : {}), ...(r.transcript ? { voiceText: r.transcript } : {}) }, authorId: r.listener_id, gone: false };
    }
    // M24 US1: one chat message, with up to CHAT_CONTEXT messages before it in the same conversation.
    case 'chat_message': {
      if (!/^\d{1,18}$/.test(id)) return { snapshot: { kind, id }, authorId: null, gone: true };
      const [r] = await db.query<{ sender_id: string; recipient_id: string; body: string; display_name: string; recipient_name: string; removed_at: string | null; created_at: Date | string }>(
        `SELECT m.sender_id, m.recipient_id, m.body, s.display_name, r.display_name AS recipient_name, m.removed_at, m.created_at
           FROM chat_messages m JOIN listeners s ON s.id = m.sender_id JOIN listeners r ON r.id = m.recipient_id WHERE m.id = $1::bigint`, [id]);
      if (!r || r.removed_at !== null) return { snapshot: { kind, id }, authorId: null, gone: true };
      const before = await db.query<{ sender_id: string; body: string; created_at: Date | string }>(
        `SELECT sender_id, body, created_at FROM chat_messages
          WHERE ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)) AND id < $3::bigint AND removed_at IS NULL
          ORDER BY id DESC LIMIT ${CHAT_CONTEXT}`, [r.sender_id, r.recipient_id, id]);
      const name = (who: string) => (who === r.sender_id ? r.display_name : r.recipient_name);
      return {
        snapshot: {
          kind, id, body: r.body, authorId: r.sender_id, authorName: r.display_name, recipientId: r.recipient_id, recipientName: r.recipient_name,
          context: before.reverse().map((m) => ({ from: name(m.sender_id), body: m.body, at: new Date(m.created_at).toISOString() })),
        },
        authorId: r.sender_id, gone: false,
      };
    }
    // M24 US1: a shared list — its title and how many shows it holds.
    case 'list': {
      if (!/^[A-Za-z0-9]{10}$/.test(id)) return { snapshot: { kind, id }, authorId: null, gone: true };
      const [r] = await db.query<{ owner_id: string; display_name: string; title: string; n: number; removed_at: string | null }>(
        'SELECT s.owner_id, l.display_name, s.title, cardinality(s.feed_urls) AS n, s.removed_at FROM shared_lists s JOIN listeners l ON l.id = s.owner_id WHERE s.id = $1', [id]);
      if (!r || r.removed_at !== null) return { snapshot: { kind, id }, authorId: null, gone: true };
      return { snapshot: { kind, id, title: r.title, showCount: Number(r.n), authorId: r.owner_id, authorName: r.display_name }, authorId: r.owner_id, gone: false };
    }
  }
}

/** M24 US1: how many earlier messages a chat-message report keeps, so the admin reads it in context. */
export const CHAT_CONTEXT = 5;

export type CreateResult = { id: string; duplicate: boolean; closed?: 'already_gone' };

export async function createReport(
  db: Db, r: { kind: TargetKind; targetId: string; reporterId: string; reason: string; note?: string; detail?: TranscriptDetail },
): Promise<CreateResult> {
  const { snapshot, gone } = await snapshotTarget(db, r.kind, r.targetId, r.detail);
  const close = closeReason(gone, false);
  const rows = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO reports (target_kind, target_id, reporter_id, reason, note, snapshot, closed_at, close_reason, detail)
     VALUES ($1, $2, $3, $4, $5, ($6::text)::jsonb, CASE WHEN $7::text = 'open' THEN NULL ELSE now() END, CASE WHEN $7::text = 'open' THEN NULL ELSE $7::text END, ($8::text)::jsonb)
     ON CONFLICT (target_kind, target_id, reporter_id) DO UPDATE SET reason = reports.reason
     RETURNING id, (xmax = 0) AS inserted`,
    [r.kind, r.targetId, r.reporterId, r.reason, r.note ?? null, JSON.stringify(snapshot), close, r.detail ? JSON.stringify(r.detail) : null],
  );
  const row = rows[0]!;
  return { id: row.id, duplicate: !row.inserted, ...(close === 'already_gone' ? { closed: 'already_gone' as const } : {}) };
}

export async function reportsInLastHour(db: Db, reporterId: string): Promise<number> {
  const [r] = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '1 hour'", [reporterId]);
  return Number(r?.n ?? 0);
}

/**
 * The keys the viewer reported (comment/clip/profile ids, show feed URLs) — hidden for them whatever the owner decides (FR-002).
 * M21 US2: a transcript correction hides nothing, so it is left out.
 */
export async function hiddenFor(db: Db, viewerId: string): Promise<{ keys: Set<string>; reported: { kind: TargetKind; id: string }[] }> {
  const rows = await db.query<{ target_kind: TargetKind; target_id: string }>("SELECT target_kind, target_id FROM reports WHERE reporter_id = $1 AND target_kind <> 'transcript'", [viewerId]);
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

/** M21 US2 (FR: a report reaches the show's host): one row of the Studio's transcript-reports list. */
export type TranscriptReport = { id: string; episodeId: string; episodeTitle: string; offsetMs: number; original: string; suggested: string; createdAt: string; status: 'open' | 'done' };

/** Every transcript report on this feed's episodes, open first, newest first within each. */
export async function transcriptReportsForFeed(db: Db, feedUrl: string): Promise<TranscriptReport[]> {
  const rows = await db.query<{ id: string; detail: TranscriptDetail; title: string; created_at: string; closed_at: string | null }>(
    `SELECT r.id, r.detail, e.title, r.created_at, r.closed_at
       FROM reports r JOIN episodes e ON e.id = r.detail->>'episodeId'
      WHERE r.target_kind = 'transcript' AND e.feed_url = $1
      ORDER BY (r.closed_at IS NULL) DESC, r.created_at DESC LIMIT 500`,
    [feedUrl],
  );
  return rows.map((r) => ({
    id: r.id, episodeId: r.detail.episodeId, episodeTitle: r.title, offsetMs: Number(r.detail.offsetMs),
    original: r.detail.original, suggested: r.detail.suggested,
    createdAt: new Date(r.created_at).toISOString(), status: r.closed_at === null ? 'open' : 'done',
  }));
}

/** The feed a transcript report belongs to (to check the caller hosts it), or null. */
export async function transcriptReportFeed(db: Db, id: string): Promise<string | null> {
  const [r] = await db.query<{ feed_url: string }>(
    `SELECT e.feed_url FROM reports r JOIN episodes e ON e.id = r.detail->>'episodeId' WHERE r.id = $1 AND r.target_kind = 'transcript'`, [id],
  );
  return r?.feed_url ?? null;
}

/** The host marks a transcript report done: it closes like any report, with the reason 'done'. */
export async function markTranscriptReportDone(db: Db, id: string): Promise<void> {
  await db.query("UPDATE reports SET closed_at = now(), close_reason = 'done' WHERE id = $1 AND target_kind = 'transcript' AND closed_at IS NULL", [id]);
}
