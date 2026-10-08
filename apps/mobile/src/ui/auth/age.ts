// The minimum age to make an account, and the record that the new listener confirmed it.
/**
 * M25 L3e (security audit #24): the app has comments, messages and voice, and nothing stopped a
 * child making an account. A new account (the email page's name step) now asks the listener to
 * confirm they are at least `MIN_AGE` — the age the privacy policy states (docs/legal/
 * privacy-policy.md section 6). No birth date is asked or kept (constitution 3.1.0: age and gender
 * stay optional profile fields). "I am under 14" ends the sign-up with a plain line.
 *
 * The confirmation is recorded with the terms consent, which lives on this phone
 * (`terms.accepted`, src/ui/shell/consent.ts): `age.confirmed` = "<MIN_AGE>@<ISO time>". No
 * server route stores consent today, so neither does this (apps/api is not touched in M25 LS).
 */
import type { SettingsStore } from '@/storage/types';

export const MIN_AGE = 14;
export const AGE_KEY = 'age.confirmed';

export const AGE_LINE = `I am ${MIN_AGE} or older`;
export const UNDER_AGE_TEXT = `SocialNet is for people aged ${MIN_AGE} and over, so we cannot make an account for you. You have not been signed up, and nothing was kept.`;

/** "Create account" works once a name is typed and the age is confirmed. */
export function canCreate(name: string, ageConfirmed: boolean): boolean {
  return name.trim().length > 0 && ageConfirmed;
}

/** Keeps the confirmation next to the terms consent. */
export function recordAgeConfirmed(settings: Pick<SettingsStore, 'set'>, now: Date = new Date()): void {
  settings.set(AGE_KEY, `${MIN_AGE}@${now.toISOString()}`);
}

/** The minimum age this phone's listener confirmed, or undefined. */
export function confirmedAge(settings: Pick<SettingsStore, 'get'>): number | undefined {
  const m = /^(\d+)@/.exec(settings.get(AGE_KEY) ?? '');
  return m ? Number(m[1]) : undefined;
}
