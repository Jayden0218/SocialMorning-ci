// Decides if streaming is allowed on mobile data.
/**
 * M10b US4 (FR-014): may an episode stream now? Only "mobile data + the switch off" says no.
 * Offline is not this switch's business — the player reports that itself. Wired into the
 * runtime's `mayStream` in `src/ui/shell/providers.tsx` with the last network reading.
 */
import type { SettingsStore } from '@/storage/types';
import { getPref } from './prefs';

export type NetworkKind = 'wifi' | 'cellular' | 'none' | 'other';

export function canStream(s: Pick<SettingsStore, 'get'>, network: NetworkKind | string): boolean {
  return !(network === 'cellular' && !getPref(s, 'mobilePlayback'));
}

/**
 * M22 US17 (T073): "Allow this time" on the mobile-data prompt (src/ui/player/DataPrompt.tsx)
 * lets streams on mobile data through until the app is closed; "Always allow" turns the
 * switch itself on. Only the prompt sets it.
 */
let allowedThisSession = false;

export function allowMobileThisSession(): void {
  allowedThisSession = true;
}

/** `canStream`, or the listener said "Allow this time" since the app started. */
export function mayStreamNow(s: Pick<SettingsStore, 'get'>, network: NetworkKind | string): boolean {
  return canStream(s, network) || allowedThisSession;
}

/** M22 US17 (T072): "±5 min on the lock screen" — off (the default) keeps the 10 s skip. */
export const LOCK_SKIP_KEY = 'pref.lockSkipFiveMin';

export function lockSkipSeconds(s: Pick<SettingsStore, 'get'>): 10 | 300 {
  return s.get(LOCK_SKIP_KEY) === '1' ? 300 : 10;
}
