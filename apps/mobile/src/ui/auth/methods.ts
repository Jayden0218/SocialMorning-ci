/**
 * The other ways in on the sign-in page (owner, 2026-09-27). The buttons exist now;
 * the backend comes later (M11), so until then each one says it is not set up yet
 * rather than doing nothing. Flip `ready` when its backend lands.
 */
export type OtherMethod = 'code' | 'google' | 'facebook';

export const OTHER_METHODS: { id: OtherMethod; label: string; ready: boolean }[] = [
  { id: 'code', label: 'Sign in with email code', ready: false },
  { id: 'google', label: 'Continue with Google', ready: false },
  { id: 'facebook', label: 'Continue with Facebook', ready: false },
];

export function notReadyMessage(label: string): string {
  return `${label} is not set up yet.`;
}
