/**
 * Search history (M10, owner 2026-09-27): the terms this phone searched for, newest
 * first, at most 12, one copy each. Kept in the settings table — on this phone only,
 * never sent to the server — and cleared by the ✕ on the search page.
 */
import type { SettingsStore } from '../storage/types';
import { recordChange } from '../sync/library';

export const HISTORY_KEY = 'search.history';
export const HISTORY_MAX = 12;

export function readHistory(settings: SettingsStore): string[] {
  try {
    const v: unknown = JSON.parse(settings.get(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Adds a term to the front; the same term (any case) is not kept twice. Blank terms and pasted feed URLs are not history. */
export function addHistory(settings: SettingsStore, term: string): string[] {
  const t = term.trim();
  if (t === '' || /^https?:\/\//i.test(t)) return readHistory(settings);
  const next = [t, ...readHistory(settings).filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, HISTORY_MAX);
  settings.set(HISTORY_KEY, JSON.stringify(next));
  recordChange(settings, 'search', t.toLowerCase(), { term: t }, Date.now()); // M10b: follows the account
  return next;
}

/** M12 FR-073: how many terms the search page lists under "Recent". */
export const RECENT_MAX = 10;

/** The search page's "Recent" list: the newest RECENT_MAX terms, newest first. */
export function recentSearches(history: readonly string[]): string[] {
  return history.slice(0, RECENT_MAX);
}

export function clearHistory(settings: SettingsStore): void {
  const now = Date.now();
  for (const h of readHistory(settings)) recordChange(settings, 'search', h.toLowerCase(), undefined, now);
  settings.set(HISTORY_KEY, '[]');
}
