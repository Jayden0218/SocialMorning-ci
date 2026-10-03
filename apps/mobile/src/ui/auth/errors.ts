// Turns a sign-in error into a short message for the user.
/** How the sign-in and sign-up pages word a failure. The 409/429 messages come from the server verbatim. */
import { ApiError } from '@/social/api';

export function describe(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'locked' && e.retryAfterSeconds !== undefined) return `Too many attempts — try again in ${e.retryAfterSeconds} s.`;
    return e.message;
  }
  return 'Something went wrong. Try again.';
}

export const errorText = 'text-accent text-sm';
