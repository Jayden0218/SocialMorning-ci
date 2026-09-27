/**
 * Terms and Conditions (owner, 2026-09-27): shown after the launch screen; the app is
 * not usable until the listener accepts. Accepting is remembered on this phone, per
 * version — raise `TERMS_VERSION` when the text changes and everyone is asked again.
 *
 * DRAFT text, written from what the app actually does. It is not legal advice; the
 * owner replaces it before release.
 */
import type { SettingsStore } from '../storage/types';

export const TERMS_VERSION = '1';
export const TERMS_KEY = 'terms.accepted';

export const TERMS_TITLE = 'Terms and Conditions';

export const TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: 'Podcasts',
    body: 'SocialMorning does not host audio. Every episode streams or downloads from its publisher, and belongs to them.',
  },
  {
    heading: 'What you post',
    body: 'Comments, reactions and clips you post are public, and show at the moment in the episode where you posted them. You are responsible for what you post. Do not post anything illegal, hateful, or harassing.',
  },
  {
    heading: 'Reports and blocks',
    body: 'You can report a comment or block a person. A reported comment is kept for up to 90 days for review. Accounts that break these terms can be suspended.',
  },
  {
    heading: 'Your data',
    body: 'When you sign in, your subscriptions, listening positions and listening time are saved to your account so they follow you across devices.',
  },
  {
    heading: 'No warranty',
    body: 'The app is provided as is. It may change, or stop, at any time.',
  },
];

export function hasAccepted(settings: SettingsStore): boolean {
  return settings.get(TERMS_KEY) === TERMS_VERSION;
}

export function accept(settings: SettingsStore): void {
  settings.set(TERMS_KEY, TERMS_VERSION);
}
