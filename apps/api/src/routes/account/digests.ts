// Weekly digest route: my Monday catch-ups from the last 4 weeks.
/**
 * M22 US15 (FR-045, FR-046; contracts/api.md "Weekly digest") — GET /v1/me/digests →
 * `{ items: { isoWeek, episodes, sentAt }[] }`. The digests are made by the internal step `digest`
 * (src/db/repos/account/digest.ts); the time zone they follow is set with PUT /v1/me/tz (me.ts).
 */
import { Hono } from 'hono';
import type { AuthEnv } from '../../auth/session.ts';
import { requireAuth } from '../../auth/session.ts';
import { listDigests } from '../../db/repos/account/digest.ts';

export const digests = new Hono<AuthEnv>();

digests.get('/', requireAuth, async (c) => c.json(await listDigests(c.get('db'), c.get('listener')!.id)));
