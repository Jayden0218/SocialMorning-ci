// The other sign-in ways (Google, Facebook): listed here, shown only once they are built.
/**
 * The ways in on the sign-in page (owner, 2026-09-27): email (a code, no password) and
 * two that come later. Each is an icon and its name in one row. Google and Facebook have
 * no backend yet (M11).
 *
 * M25 L3c (App Review 2.1; security audit #22): a way in that is not built is NOT drawn — no
 * button, no Coming soon, no "Not set up yet" card. Only `readyMethods()` reaches a screen.
 * When one is built, App Review 4.8 also asks for Sign in with Apple on iPhone.
 */
import type { IconName } from '@/ui/kit/Icon';
import type { AuthMark } from './AuthShell';

export type OtherMethod = 'google' | 'facebook';

export type MethodInfo = { id: OtherMethod; label: string; short: string; icon: IconName; mark: AuthMark; ready: boolean };

/**
 * `mark` is what the sign-in button draws: Google's own multi-colour "G", Facebook's mark
 * in its own blue (owner, 2026-09-27). `icon` is the plain font icon for lists (Settings).
 */
export const OTHER_METHODS: MethodInfo[] = [
  { id: 'google', label: 'Continue with Google', short: 'Google', icon: 'logo-google', mark: 'google', ready: false },
  { id: 'facebook', label: 'Continue with Facebook', short: 'Facebook', icon: 'logo-facebook', mark: { icon: 'logo-facebook', tint: 'facebook' }, ready: false },
];

/** The ways in a screen may draw: only the ready ones (none today). */
export function readyMethods(methods: readonly MethodInfo[] = OTHER_METHODS): MethodInfo[] {
  return methods.filter((m) => m.ready);
}
