// Studio transcript reports: a show's listener corrections, and marking one done.
/**
 * M21 US2 (contracts/api.md): a listener's "Report a mistake" on a transcript line reaches the
 * show's host here. `GET /shows/:show/transcript-reports` sits behind the show-role wall in
 * `index.ts`; `PATCH /transcript-reports/:id` has no show in its path, so it looks up the
 * report's feed and checks the caller's role on it the same way (`roleFor`).
 */
import { z } from 'zod';
import type { Hono } from 'hono';
import type { StudioEnv } from '../../auth/studio-session.ts';
import { ApiError } from '../../errors.ts';
import { json } from '../../validate.ts';
import { roleFor, showKey } from '../../db/repos/studio/studio-roles.ts';
import { markTranscriptReportDone, transcriptReportFeed, transcriptReportsForFeed } from '../../db/repos/safety/reports.ts';

const UUID = /^[0-9a-f-]{36}$/i;

/** The list (behind the show wall) — register after the `/shows/:show/*` role check. */
export function registerTranscriptReports(studio: Hono<StudioEnv>): void {
  studio.get('/shows/:show/transcript-reports', async (c) =>
    c.json({ items: await transcriptReportsForFeed(c.get('db'), c.get('show').feedUrl) }));
}

/** Marking one done (its own role check) — register anywhere after the session wall. */
export function registerTranscriptReportDone(studio: Hono<StudioEnv>): void {
  studio.patch('/transcript-reports/:id', json(z.object({ status: z.literal('done') })), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const feed = UUID.test(id) ? await transcriptReportFeed(db, id) : null;
    if (!feed) throw new ApiError('not_found', 'No such transcript report.');
    if (!(await roleFor(db, c.get('listener')!.id, showKey(feed)))) throw new ApiError('no_role', 'You do not manage this show.');
    await markTranscriptReportDone(db, id);
    return c.json({ id, status: 'done' as const });
  });
}
