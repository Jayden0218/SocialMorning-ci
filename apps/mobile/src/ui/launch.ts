/**
 * What the app opens after the launch screen (owner, 2026-09-27): the Terms until they
 * are accepted, then — on every launch while signed out — the sign-in page. It keeps its
 * close button, so the app stays usable signed out; it is just offered each time.
 *
 * Found on the phone the same day: the sign-in page opened only once, straight after
 * Agree, so every later launch of a signed-out phone went to the main page.
 */
export function opensSignIn(s: { ready: boolean; accepted: boolean; signedIn: boolean; opened: boolean }): boolean {
  return s.ready && s.accepted && !s.signedIn && !s.opened;
}

/**
 * The launch screen stays up while starting, and — after Accept or at launch while signed
 * out — until the sign-in page is on top, so the home page never shows in between.
 */
export function coverLaunch(s: { ready: boolean; wantSignIn: boolean; handoff: boolean }): boolean {
  return !s.ready || s.wantSignIn || s.handoff;
}

/** The longest the cover waits for the sign-in page before it lifts anyway. */
export const HANDOFF_MAX_MS = 1500;

/**
 * Owner, 2026-09-27, while debugging: show the Terms on every launch even after they
 * were accepted. `__DEV__` is true only in Debug builds (the ones served by Metro), so a
 * Release build still asks once. Set to `false` to test the real "ask once" in Debug.
 */
export const ALWAYS_SHOW_TERMS: boolean = __DEV__;
