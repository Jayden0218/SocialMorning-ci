// Remembers which category tiles the listener hid on Discover, and brings them back.
/**
 * M21 US7 (FR-061): each category tile on Discover has an ×. The hidden genre ids live in the
 * settings store under `discover.hiddenCategories` as a JSON array of numbers; "Explore more
 * categories" lists them again with a way back. An unreadable value reads as "none hidden".
 */
import type { SettingsStore } from '@/storage/types';

export const HIDDEN_CATEGORIES_KEY = 'discover.hiddenCategories';

export function readHiddenCategories(settings: SettingsStore): number[] {
  const raw = settings.get(HIDDEN_CATEGORIES_KEY);
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)))] : [];
  } catch {
    return [];
  }
}

export function hideCategory(settings: SettingsStore, id: number): number[] {
  const next = [...new Set([...readHiddenCategories(settings), id])];
  settings.set(HIDDEN_CATEGORIES_KEY, JSON.stringify(next));
  return next;
}

export function showCategory(settings: SettingsStore, id: number): number[] {
  const next = readHiddenCategories(settings).filter((x) => x !== id);
  settings.set(HIDDEN_CATEGORIES_KEY, JSON.stringify(next));
  return next;
}

/** The tiles to draw: the first `n` genres that are not hidden (a hidden one makes room for the next). */
export function visibleGenres<G extends { id: number }>(all: readonly G[], hidden: readonly number[], n: number): G[] {
  const off = new Set(hidden);
  return all.filter((g) => !off.has(g.id)).slice(0, n);
}
