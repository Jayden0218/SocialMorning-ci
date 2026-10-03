/**
 * A small list kept as JSON in the settings table — on this phone only. Used for
 * favourites and saved moments (M10, owner 2026-09-27). A broken stored value reads as
 * empty rather than crashing the screen that shows it.
 */
import type { SettingsStore } from '@/storage/types';

export function readList<T>(settings: SettingsStore, key: string, ok: (x: unknown) => x is T): T[] {
  try {
    const v: unknown = JSON.parse(settings.get(key) ?? '[]');
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}

export function writeList<T>(settings: SettingsStore, key: string, items: readonly T[]): void {
  settings.set(key, JSON.stringify(items));
}
