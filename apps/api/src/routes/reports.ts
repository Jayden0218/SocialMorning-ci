/**
 * M6 reports (contracts/api.md): POST /v1/reports · GET /v1/me/hidden. Own content is
 * refused (FR-004), a repeat is one row (FR-003, G3), a target already gone closes at
 * once, and more than REPORTS_PER_HOUR in an hour is 429 (research R9).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { canReport, REPORT_NOTE_MAX, REPORT_REASONS, REPORTS_PER_HOUR, type TargetKind } from '@socialmorning/social-core';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { createReport, hiddenFor, reportsInLastHour, snapshotTarget } from '../db/repos/reports.ts';
import { listBlocks } from '../db/repos/blocks.ts';
import { hiddenFeedUrls } from '../db/repos/moderation.ts';

const reportBody = z.object({
  targetKind: z.enum(['comment', 'clip', 'profile', 'show']),
  targetId: z.string().min(1).max(2048),
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
});

export const reports = new Hono<AuthEnv>();

reports.post('/', requireAuth, json(reportBody), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('db');
  const me = c.get('listener')!;
  const kind = body.targetKind as TargetKind;
  if (kind !== 'show' && !/^[0-9a-f-]{36}$/i.test(body.targetId)) throw new ApiError('validation', 'targetId must be an id.', { fields: ['targetId'] });
  const target = await snapshotTarget(db, kind, body.targetId);
  const who = kind === 'profile' ? body.targetId : target.authorId;
  if (canReport(me.id, who) === 'own') throw new ApiError('validation', "That's yours — delete it instead.", { fields: ['targetId'], reason: 'own' });
  if ((await reportsInLastHour(db, me.id)) >= REPORTS_PER_HOUR) throw new ApiError('locked', 'Too many reports in an hour.', { retryAfterSeconds: 3600 });
  const r = await createReport(db, { kind, targetId: body.targetId, reporterId: me.id, reason: body.reason, ...(body.note ? { note: body.note } : {}) });
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
