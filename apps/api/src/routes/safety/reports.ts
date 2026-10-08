// Report routes: report content, rate-limited, and list what I have hidden.
/**
 * M6 reports (contracts/api.md): POST /v1/reports · GET /v1/me/hidden. Own content is
 * refused (FR-004), a repeat is one row (FR-003, G3), a target already gone closes at
 * once, and more than REPORTS_PER_HOUR in an hour is 429 (research R9).
 *
 * M21 US2: `episode` (target = the episode id) and `transcript` (one wrong line; `detail`
 * carries the listener's correction; the target id is stored as `<episodeId>#<offsetMs>`
 * whether the phone sends that or the bare episode id).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { canReport, REPORT_NOTE_MAX, REPORT_REASONS, REPORTS_PER_HOUR, type TargetKind } from '@socialmorning/social-core';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { json } from '../../validate.ts';
import { ApiError } from '../../errors.ts';
import { createReport, hiddenFor, reportsInLastHour, snapshotTarget, transcriptTargetId, type TranscriptDetail } from '../../db/repos/safety/reports.ts';
import { listBlocks } from '../../db/repos/safety/blocks.ts';
import { hiddenFeedUrls } from '../../db/repos/safety/moderation.ts';

/** An episode id (fnv1a64 hex, or a hosted episode's id) — never a slash or a `#`. */
const EPISODE_ID = /^[0-9A-Za-z_-]{1,64}$/;
const TRANSCRIPT_TEXT_MAX = 500;

const transcriptDetail = z.object({
  offsetMs: z.number().int().min(0).max(24 * 3_600_000),
  original: z.string().trim().max(TRANSCRIPT_TEXT_MAX),
  suggested: z.string().trim().min(1).max(TRANSCRIPT_TEXT_MAX),
  episodeId: z.string().regex(EPISODE_ID).optional(),
});

const reportBody = z.object({
  targetKind: z.enum(['comment', 'clip', 'profile', 'show', 'episode', 'transcript']),
  targetId: z.string().min(1).max(2048),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
  detail: transcriptDetail.optional(),
});

/** The episode a transcript report is about, from `<episodeId>#<offsetMs>` or a bare episode id. */
function transcriptTarget(targetId: string, d: z.infer<typeof transcriptDetail> | undefined): { targetId: string; detail: TranscriptDetail } {
  if (!d) throw new ApiError('validation', 'A transcript report needs the line and the right words.', { fields: ['detail'] });
  const [episodeId, at] = targetId.split('#');
  if (!episodeId || !EPISODE_ID.test(episodeId) || (at !== undefined && at !== String(d.offsetMs)) || (d.episodeId !== undefined && d.episodeId !== episodeId)) {
    throw new ApiError('validation', 'targetId must be the episode id, or <episodeId>#<offsetMs>.', { fields: ['targetId'] });
  }
  return { targetId: transcriptTargetId(episodeId, d.offsetMs), detail: { episodeId, offsetMs: d.offsetMs, original: d.original, suggested: d.suggested } };
}

export const reports = new Hono<AuthEnv>();

reports.post('/', requireAuth, json(reportBody), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('db');
  const me = c.get('listener')!;
  const kind = body.targetKind as TargetKind;
  const t = kind === 'transcript' ? transcriptTarget(body.targetId, body.detail) : { targetId: body.targetId, detail: undefined };
  if (kind === 'episode' && !EPISODE_ID.test(body.targetId)) throw new ApiError('validation', 'targetId must be an episode id.', { fields: ['targetId'] });
  if (kind !== 'show' && kind !== 'episode' && kind !== 'transcript' && !/^[0-9a-f-]{36}$/i.test(body.targetId)) throw new ApiError('validation', 'targetId must be an id.', { fields: ['targetId'] });
  const target = await snapshotTarget(db, kind, t.targetId, t.detail);
  const who = kind === 'profile' ? body.targetId : target.authorId;
  if (canReport(me.id, who) === 'own') throw new ApiError('validation', "That's yours — delete it instead.", { fields: ['targetId'], reason: 'own' });
  if ((await reportsInLastHour(db, me.id)) >= REPORTS_PER_HOUR) throw new ApiError('locked', 'Too many reports in an hour.', { retryAfterSeconds: 3600 });
  const r = await createReport(db, { kind, targetId: t.targetId, reporterId: me.id, reason: body.reason, ...(body.note ? { note: body.note } : {}), ...(t.detail ? { detail: t.detail } : {}) });
  return c.json({ id: r.id, duplicate: r.duplicate, ...(r.closed ? { closed: r.closed } : {}) }, r.duplicate ? 200 : 201);
});

/** Mounted at /v1/me/hidden — everything the viewer hid, to refill the phone at sign-in. */
export const hidden = new Hono<AuthEnv>();

hidden.get('/', requireAuth, async (c) => {
  const db = c.get('db');
  const me = c.get('listener')!;
  const [h, blocked, feeds] = await Promise.all([hiddenFor(db, me.id), listBlocks(db, me.id), hiddenFeedUrls(db)]);
  return c.json({ reported: h.reported, blocked: blocked.map((b) => ({ id: b.id, displayName: b.displayName })), hiddenFeeds: [...feeds] });
});
