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
