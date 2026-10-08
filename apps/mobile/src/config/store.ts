// Holds the app settings in use now (the admin's, or the built-in defaults) and tells screens when they change.
/**
 * M25 A7. Starts at the built-in defaults — today's app — so a screen drawn before anything loads
 * looks exactly as it did before M25. `applyConfig` takes a checked config (src/config/load.ts),
 * applies the category settings to `GENRES` and wakes every `useAppConfig` user.
 */
import { useSyncExternalStore } from 'react';
import { CONFIG_DEFAULTS, DISCOVER_SECTION_TITLES, type AppConfig, type ListSizeKey } from '@socialmorning/social-core';
import { applyGenreSettings } from '@/discover/genres';

let current: AppConfig = CONFIG_DEFAULTS;
const listeners = new Set<() => void>();

export function getAppConfig(): AppConfig {
  return current;
}

export function applyConfig(next: AppConfig): void {
  current = next;
  applyGenreSettings(next.genres);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useAppConfig(): AppConfig {
  return useSyncExternalStore(subscribe, getAppConfig, getAppConfig);
}

/** A Discover section's title: the admin's, when one is set for this default title; else the title itself. */
export function sectionTitle(title: string): string {
  return (DISCOVER_SECTION_TITLES as readonly string[]).includes(title) ? current.sectionTitles[title as keyof AppConfig['sectionTitles']] ?? title : title;
}

export const listSize = (k: ListSizeKey): number => current.listSizes[k];

/** `sectionTitle`, redrawn when the settings change. */
export function useSectionTitle(title: string): string {
  useAppConfig();
  return sectionTitle(title);
}
