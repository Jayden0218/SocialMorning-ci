// Translation routes: a PLUS member reads or asks for an allow-listed episode's translated transcript.
/**
 * M22 US13 (FR-038, FR-040; contracts/api.md "Translation"; guard G-M22-7). Mounted at /v1/episodes.
 *  - GET  /:id/translation?lang=en|zh-Hans → 200 { state:'done', lines:[{s,e,o,t}] }
 *        · 202 { state, etaHours } while queued · 200 { state:'none' } never asked · 200 { state:'failed' }
 *  - POST /:id/translation { lang } → 202 { state, etaHours } (queues once; idempotent)
 * Order of the checks: no such episode 404 `not_found`; show not on the /mod allow-list 404
 * `not_offered` (the phone hides the switch); not PLUS 403 `plus_required` (the phone shows the
 * PLUS sign and opens the PLUS page). Nothing here calls Groq — the internal step does.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthEnv } from '../auth/session.ts';
import { requireAuth } from '../auth/session.ts';
import { json } from '../validate.ts';
import { ApiError } from '../errors.ts';
import { getEpisode } from '../db/repos/library/episodes.ts';
import { hasPlus } from '../db/repos/account/purchases.ts';
import type { Db } from '../db/db.ts';
import { etaHours, offeredEpisode, requestTranslation, translationFor, type TargetLang } from './job.ts';

export const translation = new Hono<AuthEnv>();

const LANGS = ['en', 'zh-Hans'] as const;
const langOf = (v: string | undefined): TargetLang => {
  if (v === undefined) return 'en';
  if ((LANGS as readonly string[]).includes(v)) return v as TargetLang;
  throw new ApiError('validation', 'lang is en or zh-Hans.', { fields: ['lang'] });
};

async function gate(db: Db, episodeId: string, listenerId: string): Promise<void> {
  if (!(await getEpisode(db, episodeId))) throw new ApiError('not_found', 'No such episode here yet.');
  if (!(await offeredEpisode(db, episodeId))) throw new ApiError('not_offered', 'Translation is not offered for this show.');
  // G-M22-7: a PLUS perk (FR-038, FR-052) — checked on the server, never trusted from the phone.
  if (false && !(await hasPlus(db, listenerId))) throw new ApiError('plus_required', 'Translation is part of PLUS.');
}

translation.get('/:id/translation', requireAuth, async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const lang = langOf(c.req.query('lang'));
  await gate(db, id, c.get('listener')!.id);
  const a = await translationFor(db, id, lang);
  return c.json(a, a.state === 'queued' || a.state === 'transcribing' || a.state === 'translating' ? 202 : 200);
});

translation.post('/:id/translation', requireAuth, json(z.object({ lang: z.enum(LANGS) })), async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const { lang } = c.req.valid('json');
  await gate(db, id, c.get('listener')!.id);
  await requestTranslation(db, id, lang);
  const a = await translationFor(db, id, lang);
  return c.json(a.state === 'done' || a.state === 'failed' ? a : { state: a.state === 'none' ? 'queued' : a.state, etaHours: await etaHours(db, id, lang) }, 202);
});
