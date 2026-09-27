/**
 * The Terms gate (owner, 2026-09-27): not accepted until Accept is pressed, remembered
 * after, asked again when the text's version changes. The break that turns the first
 * test red: make `hasAccepted` in `src/ui/terms.ts` return `true`.
 */
import { createMemoryStores } from '../src/storage/memory';
import { TERMS_KEY, TERMS_SECTIONS, TERMS_VERSION, accept, hasAccepted } from '../src/ui/terms';

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

it('the terms have something to read', () => {
  expect(TERMS_SECTIONS.length).toBeGreaterThan(0);
  for (const s of TERMS_SECTIONS) expect(s.body.length).toBeGreaterThan(0);
});
