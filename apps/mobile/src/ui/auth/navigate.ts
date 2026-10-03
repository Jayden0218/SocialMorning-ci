// Where you go after signing in or out.
/**
 * Where an account change lands (owner, 2026-09-27). Signing in is required, so leaving an
 * account goes to the sign-in page with no old stack underneath, and signing in goes to
 * the app with no sign-in pages left behind to swipe back to.
 */
import { router } from 'expo-router';

export function toSignIn(): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/auth/sign-in');
}

export function toApp(): void {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
