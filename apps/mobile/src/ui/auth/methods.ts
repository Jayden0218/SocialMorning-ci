/**
 * The ways in on the sign-in page (owner, 2026-09-27): email (a code, no password) and
 * two that come later. Each is an icon and its name in one row. Google and Facebook have
 * no backend yet (M11), so until then each says it is not set up rather than doing nothing.
 */
import type { IconName } from '../Icon';
import type { AuthMark } from './AuthShell';

export type OtherMethod = 'google' | 'facebook';

/**
 * `mark` is what the sign-in button draws: Google's own multi-colour "G", Facebook's mark
 * in its own blue (owner, 2026-09-27). `icon` is the plain font icon for lists (Settings).
 */
export const OTHER_METHODS: { id: OtherMethod; label: string; short: string; icon: IconName; mark: AuthMark; ready: boolean }[] = [
  { id: 'google', label: 'Continue with Google', short: 'Google', icon: 'logo-google', mark: 'google', ready: false },
  { id: 'facebook', label: 'Continue with Facebook', short: 'Facebook', icon: 'logo-facebook', mark: { icon: 'logo-facebook', tint: 'facebook' }, ready: false },
];

export function notReadyMessage(label: string): string {
  return `${label} is not set up yet.`;
}
