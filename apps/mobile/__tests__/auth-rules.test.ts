/**
 * The sign-in consent rule (owner's reference screenshots, 2026-09-27). The break that
 * turns the first test red: return 'submit' without checking `agreed` in
 * `src/ui/auth/rules.ts`.
 */
import { looksLikeEmail, submitAction } from '@/ui/auth/rules';

it('not ticked: the button asks instead of signing in', () => {
  expect(submitAction({ valid: true, agreed: false, busy: false })).toBe('ask');
});

it('ticked and valid: signs in', () => {
  expect(submitAction({ valid: true, agreed: true, busy: false })).toBe('submit');
});

it('an invalid form or a request in flight: the button is off, ticked or not', () => {
  for (const agreed of [true, false]) {
    expect(submitAction({ valid: false, agreed, busy: false })).toBe('disabled');
    expect(submitAction({ valid: true, agreed, busy: true })).toBe('disabled');
  }
});

it('email shape', () => {
  expect(looksLikeEmail(' a@b.co ')).toBe(true);
  for (const bad of ['', 'a@b', 'a b@c.d', '@b.co', 'a@.co x']) expect(looksLikeEmail(bad)).toBe(false);
});
