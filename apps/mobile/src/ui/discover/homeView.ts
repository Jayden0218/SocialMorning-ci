// Which view Home shows — Moments or Discover — and whether the Moments feed is the screen in front.
/**
 * M31 T025 (design-pulse2 `home--moments`, `discover--screen`): Home has two views behind one
 * switch. The choice is kept in the settings store (`home.view`) so the app opens on the view the
 * listener left; the first time it opens on Moments (the headline of the redesign).
 *
 * `momentsOnScreen()` is the one fact the layout needs: the now bar is hidden on the Moments feed
 * (`nowBarMode({ moments })` in the kit) because the feed has its own Play circle. Home sets it
 * while the Moments view is chosen AND Home is the screen in front; the layout reads it with
 * `useMomentsOnScreen()`.
 */
import { useSyncExternalStore } from 'react';
import type { SettingsStore } from '@/storage/types';

export type HomeView = 'moments' | 'discover';
export const HOME_VIEW_KEY = 'home.view';
export const DEFAULT_HOME_VIEW: HomeView = 'moments';

/** The saved view; anything unreadable is the default. */
export function readHomeView(settings: Pick<SettingsStore, 'get'>): HomeView {
  const v = settings.get(HOME_VIEW_KEY);
  return v === 'moments' || v === 'discover' ? v : DEFAULT_HOME_VIEW;
}

export function saveHomeView(settings: Pick<SettingsStore, 'set'>, view: HomeView): void {
  settings.set(HOME_VIEW_KEY, view);
}

let view: HomeView | undefined;
let focused = false;
const listeners = new Set<() => void>();
const emit = (): void => { for (const l of listeners) l(); };
const subscribe = (l: () => void): (() => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The chosen view; `settings` is read once, the first time. */
export function currentHomeView(settings: Pick<SettingsStore, 'get'>): HomeView {
  if (view === undefined) view = readHomeView(settings);
  return view;
}

export function chooseHomeView(settings: Pick<SettingsStore, 'set'>, next: HomeView): void {
  if (view === next) return;
  view = next;
  saveHomeView(settings, next);
  emit();
}

/** Home calls this as it comes to the front (true) and leaves it (false). */
export function setHomeFocused(on: boolean): void {
  if (focused === on) return;
  focused = on;
  emit();
}

/** The Moments feed is the screen in front (read by the layout to hide the now bar). */
export function momentsOnScreen(): boolean {
  return focused && view === 'moments';
}

export function useHomeView(settings: Pick<SettingsStore, 'get'>): HomeView {
  return useSyncExternalStore(subscribe, () => currentHomeView(settings), () => DEFAULT_HOME_VIEW);
}

export function useMomentsOnScreen(): boolean {
  return useSyncExternalStore(subscribe, momentsOnScreen, () => false);
}

/** For tests. */
export function resetHomeViewForTest(): void {
  view = undefined;
  focused = false;
  emit();
}
