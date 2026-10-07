// Test setup: registers an episode the way a feed refresh would, without a session.
/**
 * M23 US1: `PUT /v1/episodes/:id` now needs a session and only fills empty fields. Tests that
 * only need an episode to exist use this instead, so they do not create extra listeners or
 * sessions (which would change counts in the admin and metrics tests). It runs the route's own
 * transaction in its old, overwriting mode (heat rebuild included).
 */
import { registerEpisode, episodeBody } from '../src/routes/library/episodes.ts';
import type { TestDb } from './harness.ts';

export async function putEpisode(t: Pick<TestDb, 'db'>, id: string, body: unknown): Promise<{ status: number }> {
  await registerEpisode(t.db, id, episodeBody.parse(body), 'authoritative');
  return { status: 200 };
}
