/**
 * The ways in on the sign-in page (owner, 2026-09-27): email (a code, no password) and
 * two that come later. Each is an icon and its name in one row. Google and Facebook have
 * no backend yet (M11), so until then each says it is not set up rather than doing nothing.
 */
import type { AuthMark } from './AuthShell';

export type OtherMethod = 'google' | 'facebook';

export const OTHER_METHODS: { id: OtherMethod; label: string; mark: AuthMark; ready: boolean }[] = [
  // Google's own multi-colour "G"; Facebook's mark in its own blue (owner, 2026-09-27).
  { id: 'google', label: 'Continue with Google', mark: 'google', ready: false },
  { id: 'facebook', label: 'Continue with Facebook', mark: { icon: 'logo-facebook', tint: 'facebook' }, ready: false },
];

export function notReadyMessage(label: string): string {
  return `${label} is not set up yet.`;
}
