// Tests helpers for academy articles, money labels, friend names and OPML guides.
/**
 * M12 US10 helpers. Guards:
 *   G-A2 (FR-103, FR-110): academy articles are SocialNet's own — no Chinese text at all (so no
 *        小宇宙 text can slip in), unique slugs, every article has sections. Break: add a CJK line.
 *   G-W1b (FR-105/106): an amount with no value is empty, never "0.00". Break: default null to 0.
 *   OPML (FR-095): at least five apps named; an app with no export says so instead of steps.
 */
import { ARTICLES, articleBySlug } from '@/settings/academy';
import { moneyLabel } from '@/me/money';
import { whoListened } from '@/social/who';
import { EXPORT_STEPS } from '@/settings/export-steps';

const CJK = /[　-鿿＀-￯]/;

it('academy: 5 articles of our own, reachable by slug', () => {
  expect(ARTICLES).toHaveLength(5);
  expect(new Set(ARTICLES.map((a) => a.slug)).size).toBe(5);
  for (const a of ARTICLES) {
    expect(articleBySlug(a.slug)).toBe(a);
    expect(a.sections.length).toBeGreaterThan(0);
    expect(CJK.test(JSON.stringify(a))).toBe(false);
  }
});

it('money: micros to a label; no amount is empty', () => {
  expect(moneyLabel(null, 'USD')).toBe('');
  expect(moneyLabel(2_990_000, null)).toBe('2.99');
  expect(moneyLabel(2_990_000, 'USD')).toMatch(/2\.99/);
});

it('friends: names read naturally', () => {
  expect(whoListened(['Ana'])).toBe('Ana');
  expect(whoListened(['Ana', 'Bo'])).toBe('Ana and Bo');
  expect(whoListened(['Ana', 'Bo', 'Cy'])).toBe('Ana, Bo and 1 other');
  expect(whoListened(['Ana', 'Bo', 'Cy', 'Di'])).toBe('Ana, Bo and 2 others');
});

it('OPML: five or more apps; each has steps or says why not', () => {
  expect(EXPORT_STEPS.length).toBeGreaterThanOrEqual(5);
  for (const a of EXPORT_STEPS) expect(a.steps.length > 0 || (a.note ?? '').length > 0).toBe(true);
});
