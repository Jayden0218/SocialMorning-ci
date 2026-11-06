// One profile request shared by everything that reads a profile (Me's counts, the profile page, stickers, chat).
/**
 * Spec 039 Q5. `GET /v1/listeners/:id` was asked for twice in a row: Me for its following/followers counts, then the profile page the
 * moment "View profile" was pressed (run 42036329005: the second took 13 s on a slow link). `api.profile` now answers from this cache:
 * an answer in flight is shared, a settled one is reused for `PROFILE_TTL_MS`, a failure is never kept. Anything that changes a
 * profile (follow, unfollow, an edit, a new avatar, signing in or out) calls `forgetProfiles()`, which drops every kept answer in the app.
 */
import type { Profile } from './api';

export const PROFILE_TTL_MS = 20_000;

/** Bumped by `forgetProfiles`; an answer kept under an older epoch is not used. */
let epoch = 0;
export function forgetProfiles(): void { epoch += 1; }

type Kept = { at: number; epoch: number; answer: Promise<Profile> };

export function createProfileCache(now: () => number): (id: string, load: () => Promise<Profile>) => Promise<Profile> {
  const kept = new Map<string, Kept>();
  return (id, load) => {
    const hit = kept.get(id);
    if (hit && hit.epoch === epoch && now() - hit.at <= PROFILE_TTL_MS) return hit.answer;
    const entry: Kept = { at: now(), epoch, answer: load() };
    kept.set(id, entry);
    // A failure must not be served again; an edit that landed while this was in flight is already newer by epoch.
    entry.answer.catch(() => { if (kept.get(id) === entry) kept.delete(id); });
    return entry.answer;
  };
}
