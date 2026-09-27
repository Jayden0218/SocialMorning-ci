/**
 * The sign-in page is offered on every launch while signed out. The break that turns the
 * first test red: drop `!s.signedIn` from `opensSignIn` in `src/ui/launch.ts`.
 */
import { coverLaunch, opensSignIn } from '../src/ui/launch';

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
