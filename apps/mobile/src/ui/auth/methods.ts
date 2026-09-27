/**
 * The ways in on the sign-in page (owner, 2026-09-27): email (a code, no password) and
 * two that come later. Each is an icon and its name in one row. Google and Facebook have
 * no backend yet (M11), so until then each says it is not set up rather than doing nothing.
 */
import type { IconName } from '../Icon';

export type OtherMethod = 'google' | 'facebook';

export const OTHER_METHODS: { id: OtherMethod; label: string; icon: IconName; ready: boolean }[] = [
  { id: 'google', label: 'Continue with Google', icon: 'logo-google', ready: false },
  { id: 'facebook', label: 'Continue with Facebook', icon: 'logo-facebook', ready: false },
];

export function notReadyMessage(label: string): string {
  return `${label} is not set up yet.`;
}
