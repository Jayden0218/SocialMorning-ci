// Terms version, title and text pointers; remembers if you agreed.
/**
 * The consent sheet (owner, 2026-09-27): shown after the launch screen; the app is not
 * usable until the listener agrees. Agreeing is remembered on this phone, per version —
 * raise `TERMS_VERSION` when the text changes and everyone is asked again.
 *
 * The wording follows the sheet the owner showed (2026-09-27), in English, for
 * SocialNet. Each numbered point links to the full document in `src/legal/texts.ts`,
 * which is generated from `docs/legal/*.md`. Not legal advice.
 */
import type { SettingsStore } from '@/storage/types';
import { LEGAL_TEXT } from '@/legal/texts';

/** v2 (2026-09-27): the sheet and the three full documents replace the v1 draft.
 *  v3 (2026-09-27, M10b US7): the privacy policy now says the country is shown on profiles — asked again.
 *  v4 (2026-10-08, M25 L1): factual fixes — email sign-in, the minimum age of 14, the 15-day deletion wait,
 *  what is hosted — asked again on a phone that has not signed in. */
export const TERMS_VERSION = '4';
export const TERMS_KEY = 'terms.accepted';

export type LegalDocId = keyof typeof LEGAL_TEXT;

/** Filled in from `docs/legal/placeholders.md` once the owner has the company name. */
/** M12 B1: the operator's registered name is the owner's to give (gate A2); until then, the app's name. */
export const OPERATOR = 'SocialNet';

export const CONSENT_TITLE = 'Service Agreement and Privacy Policy';

export const CONSENT_INTRO =
  `Welcome to SocialNet! SocialNet's products and services are provided to you by ${OPERATOR}. ` +
  "Before you use SocialNet, we want to explain SocialNet's Service Agreement and Privacy Policy. " +
  'Please read them carefully and make your choice:';

export const CONSENT_ITEMS: { doc: LegalDocId; link: string; points: string[] }[] = [
  {
    doc: 'agreement',
    link: 'SocialNet User Agreement',
    points: [
      'Your account is for you alone. You are responsible for everything done with it.',
      'What you post shows your own views. It must follow the law and the Community Guidelines. Breaking the rules can lead to posts being removed or the account being closed.',
      'You keep the rights to what you post, and give SocialNet a free licence to show and share it.',
      'The service is provided as is, and may change or stop.',
    ],
  },
  {
    doc: 'privacy',
    link: 'SocialNet Privacy Policy',
    points: [
      'What personal information we collect, why, and how we use it.',
      'We ask for a phone permission only when you use the feature that needs it, and you can refuse.',
      'We do not share your personal information without your consent, except in the cases the policy lists.',
      'How you can view, change or delete your information, and close your account.',
    ],
  },
  {
    doc: 'community',
    link: 'SocialNet Community Guidelines',
    points: [
      'Respect hosts and listeners. Talk about the issue, not the person.',
      'No illegal content, harassment, spam or doxxing.',
    ],
  },
];

export const CONSENT_OUTRO = 'Tap "Agree" to accept these documents and start using SocialNet.';

/** The second page, after "Disagree" — the last chance before leaving. */
export const REFUSE_TEXT =
  'SocialNet only uses your information to provide the service and improve your experience, ' +
  'and will do its best to keep your information safe. Please agree before you use it. ' +
  'If you do not agree to this Privacy Policy, we are sorry, but we cannot provide the service to you.';

export function hasAccepted(settings: SettingsStore): boolean {
  return settings.get(TERMS_KEY) === TERMS_VERSION;
}

/**
 * Owner, 2026-10-04: the consent page is for a first-time user only. Agreed on this phone before,
 * or signed in (signing in needs the same agreement, ticked on the sign-in page) → not again.
 */
export function consentGiven(settings: SettingsStore, signedIn: boolean): boolean {
  return signedIn || hasAccepted(settings);
}

export function accept(settings: SettingsStore): void {
  settings.set(TERMS_KEY, TERMS_VERSION);
}
