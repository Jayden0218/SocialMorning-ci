/**
 * The Terms gate (owner, 2026-09-27): not accepted until Accept is pressed, remembered
 * after, asked again when the text's version changes. The break that turns the first
 * test red: make `hasAccepted` in `src/ui/shell/terms.ts` return `true`.
 */
import { createMemoryStores } from '@/storage/memory';
import { CONSENT_ITEMS, TERMS_KEY, TERMS_VERSION, accept, hasAccepted } from '@/ui/shell/terms';
import { LEGAL_TEXT } from '@/legal/texts';

it('a fresh install has not accepted', () => {
  const { settings } = createMemoryStores((x) => x);
  expect(hasAccepted(settings)).toBe(false);
});

it('accepting is remembered', () => {
  const { settings } = createMemoryStores((x) => x);
  accept(settings);
  expect(hasAccepted(settings)).toBe(true);
});

it('an older version of the terms asks again', () => {
  const { settings } = createMemoryStores((x) => x);
  settings.set(TERMS_KEY, `${TERMS_VERSION}-old`);
  expect(hasAccepted(settings)).toBe(false);
});

it('every point on the sheet links to a full document that has text', () => {
  expect(CONSENT_ITEMS.map((i) => i.doc)).toEqual(['agreement', 'privacy', 'community']);
  for (const i of CONSENT_ITEMS) {
    expect(i.points.length).toBeGreaterThan(0);
    expect(LEGAL_TEXT[i.doc].length).toBeGreaterThan(1000);
  }
});

it('the documents are SocialNet\'s, with no 小宇宙 name or contact left in them', () => {
  for (const text of Object.values(LEGAL_TEXT)) {
    expect(text).toContain('SocialNet');
    expect(text).not.toMatch(/小宇宙|Xiaoyuzhou|iftech|okjike|Shanghai/);
  }
});
