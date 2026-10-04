// Checks that the legal pages show no "[placeholder]" text except known pending facts.
/**
 * M12 guard G-B1 (B1, found on the iPhone 2026-09-29): the legal pages showed "[DATE]",
 * "[SocialNet Privacy Policy]" and "[COMPANY LEGAL NAME]". Answers now come from
 * docs/legal/placeholders.md through scripts/legal-sync.mjs. The only brackets allowed are the
 * facts still waiting on the owner (gate A2) — each one must be listed here, by name.
 *
 * The break that turns it red: put "[DATE]" back into src/legal/texts.ts, or bracket a
 * document name again.
 */
import { LEGAL_TEXT } from '@/legal/texts';
import { OPERATOR, CONSENT_INTRO } from '@/ui/shell/consent';

/** Owner-only facts (gate A2, 2026-09-29): company, address, law and contacts, and the SDK tables. */
const WAITING_ON_OWNER = new Set([
  '[COMPANY LEGAL NAME]', '[REGISTERED ADDRESS]', '[COUNTRY]', '[CITY / DISTRICT]', '[CITY / DISTRICT, COUNTRY]',
  '[APPLICABLE LAW, e.g. the laws on online information services in COUNTRY]',
  '[CONTACT EMAIL]', '[PRIVACY OFFICER EMAIL]', '[REPORT EMAIL]',
  '[SDK NAME]', '[COMPANY]', '[URL]', '[DATA]', '[PURPOSE]', '[NAME]',
]);

it('no placeholder shows except the facts waiting on the owner', () => {
  const found = Object.values(LEGAL_TEXT).flatMap((t) => t.match(/\[[A-Z][A-Za-z ,/.]{2,}\]/g) ?? []);
  expect([...new Set(found)].filter((p) => !WAITING_ON_OWNER.has(p))).toEqual([]);
});

it('the answered facts and the document names read as text', () => {
  const all = Object.values(LEGAL_TEXT).join('\n');
  expect(all).toContain('29 September 2026');
  expect(all).toContain('socialmorning-studio.vercel.app');
  expect(all).not.toMatch(/\[SocialNet (Privacy Policy|Community Guidelines)\]/);
});

it('the consent screen names an operator, never a placeholder', () => {
  expect(OPERATOR).not.toMatch(/\[/);
  expect(CONSENT_INTRO).not.toMatch(/\[[A-Z]/);
});
