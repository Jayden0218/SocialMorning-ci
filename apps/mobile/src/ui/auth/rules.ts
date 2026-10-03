// Rules for the sign-in button and checking an email looks right.
/**
 * The sign-in consent rule (owner's reference screenshots, 2026-09-27): the form's
 * button works once the form is valid; if the consent box is not ticked, tapping it
 * asks first ("Please read and agree…") instead of signing in.
 */
export type SubmitAction = 'disabled' | 'ask' | 'submit';

export function submitAction(s: { valid: boolean; agreed: boolean; busy: boolean }): SubmitAction {
  if (!s.valid || s.busy) return 'disabled';
  return s.agreed ? 'submit' : 'ask';
}

/** An email the server will accept the shape of: something@something.something. */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
