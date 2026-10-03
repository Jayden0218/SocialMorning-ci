// Tests that a signed-out launch opens sign-in once, after the Terms.
/**
 * The sign-in page is offered on every launch while signed out. The break that turns the
 * first test red: drop `!s.signedIn` from `opensSignIn` in `src/ui/shell/launch.ts`.
 */
import { coverLaunch, keepTerms, opensSignIn } from '@/ui/shell/launch';

const base = { ready: true, accepted: true, signedIn: false, opened: false };

it('a signed-in listener goes straight to the app', () => {
  expect(opensSignIn({ ...base, signedIn: true })).toBe(false);
});

it('a signed-out launch opens sign-in, once', () => {
  expect(opensSignIn(base)).toBe(true);
  expect(opensSignIn({ ...base, opened: true })).toBe(false);
});

it('not before the launch screen lifts, and not before the Terms are accepted', () => {
  expect(opensSignIn({ ...base, ready: false })).toBe(false);
  expect(opensSignIn({ ...base, accepted: false })).toBe(false);
});

it('the launch screen covers the home page until sign-in is on top (owner, 2026-09-27)', () => {
  const idle = { ready: true, wantSignIn: false, handoff: false };
  expect(coverLaunch({ ...idle, ready: false })).toBe(true);
  // The render right after Accept: the push has not happened yet, the cover is already up.
  expect(coverLaunch({ ...idle, wantSignIn: true })).toBe(true);
  // Pushed, not yet on top.
  expect(coverLaunch({ ...idle, handoff: true })).toBe(true);
  // Signed in, or sign-in is on top: nothing covers the app.
  expect(coverLaunch(idle)).toBe(false);
});

it('after Agree the Terms stay up until sign-in is whole — no splash in between (owner, 2026-09-29)', () => {
  const s = { ready: true, accepted: true, launched: true, cover: true };
  // Agreed, the sign-in page is not whole yet: the Terms page is what covers the app.
  expect(keepTerms(s)).toBe(true);
  // Sign-in is on top and whole: the Terms go.
  expect(keepTerms({ ...s, cover: false })).toBe(false);
  // Not agreed: always the Terms.
  expect(keepTerms({ ...s, accepted: false, cover: false })).toBe(true);
  // At launch, already agreed, signed out: the native launch screen covers, not the Terms.
  expect(keepTerms({ ...s, launched: false })).toBe(false);
  // Nothing before startup is done.
  expect(keepTerms({ ...s, ready: false, accepted: false })).toBe(false);
});
