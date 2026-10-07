// Remembers the categories picked on first open, and decides when to ask (once more after a skip, a week later).
/**
 * M22 US5 (FR-017). Kept in settings so the page decides with no network; a signed-in listener's
 * choice is also saved to the account (`PUT /v1/me/interests`) and read back on a new phone.
 *   - picked ≥ 2 → never asked again;
 *   - never answered → asked on first open;
 *   - skipped once → asked once more, 7 days after the skip; skipped twice → never again.
 */
import type { SettingsStore } from '@/storage/types';

export const INTERESTS_MIN = 2;
export const ASK_AGAIN_MS = 7 * 86_400_000;
export const KEY_PICKED = 'interests.genreIds';
export const KEY_SKIPPED = 'interests.skippedAt';
export const KEY_ASKED_AGAIN = 'interests.askedAgain';
/** Set when a save to the account failed (offline); the next open sends it again. */
export const KEY_UNSENT = 'interests.unsent';

export function pickedInterests(settings: SettingsStore): number[] {
  try {
    const v = JSON.parse(settings.get(KEY_PICKED) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export function interestsDue(s: { picked: readonly number[]; skippedAt?: number; askedAgain: boolean; now: number }): boolean {
  if (s.picked.length >= INTERESTS_MIN) return false;
  if (s.skippedAt === undefined) return true;
  if (s.askedAgain) return false;
  return s.now - s.skippedAt >= ASK_AGAIN_MS;
}

export function interestsDueFrom(settings: SettingsStore, now: number): boolean {
  const skipped = Number(settings.get(KEY_SKIPPED));
  return interestsDue({
    picked: pickedInterests(settings),
    ...(Number.isFinite(skipped) && skipped > 0 ? { skippedAt: skipped } : {}),
    askedAgain: settings.get(KEY_ASKED_AGAIN) === '1',
    now,
  });
}

export function savePicked(settings: SettingsStore, genreIds: readonly number[]): void {
  settings.set(KEY_PICKED, JSON.stringify([...genreIds]));
}

/** A skip: the first is remembered with its time; the second means "don't ask again". */
export function saveSkip(settings: SettingsStore, now: number): void {
  if (Number(settings.get(KEY_SKIPPED)) > 0) settings.set(KEY_ASKED_AGAIN, '1');
  settings.set(KEY_SKIPPED, String(now));
}

/** Tap a tile: add it or take it out. */
export function toggleGenre(picked: readonly number[], id: number): number[] {
  return picked.includes(id) ? picked.filter((g) => g !== id) : [...picked, id];
}
