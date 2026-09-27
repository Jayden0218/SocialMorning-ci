/**
 * What the app opens after the launch screen (owner, 2026-09-27): the Terms until they
 * are accepted, then — on every launch while signed out — the sign-in page. It keeps its
 * close button, so the app stays usable signed out; it is just offered each time.
 *
 * Found on the phone the same day: the sign-in page opened only once, straight after
 * Agree, so every later launch of a signed-out phone went to the main page.
 */
export function opensSignIn(s: { ready: boolean; accepted: boolean; signedIn: boolean; opened: boolean }): boolean {
  return s.ready && s.accepted && !s.opened;
}
