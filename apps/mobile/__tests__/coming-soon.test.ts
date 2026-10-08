// Checks that unreleased features show a "Coming soon" pop-up with no date or price.
/**
 * M17 guard G-E7 (FR-013, FR-014, FR-015): a feature that is not released yet says so with the
 * Coming soon pop-up — never the old "… is not set up yet." toast. Me's Wallet opens it while
 * purchases are off (with "Open Wallet", so the Wallet page stays reachable — FR-007). No date,
 * no price. M25 L3c: sign-in's not-ready methods are no longer drawn at all (App Review 2.1) —
 * see __tests__/m25-store.test.tsx — so sign-in opens no Coming soon.
 *
 * The break that turns it red: put `toast(\`${m.label} is not set up yet.\`)` back in
 * app/auth/sign-in.tsx.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

it('G-E7: no "not set up yet" toast is left', () => {
  const hits = [...files(join(ROOT, 'app')), ...files(join(ROOT, 'src'))].filter((f) => /is not set up yet|notReadyMessage\(/.test(readFileSync(f, 'utf8')));
  expect(hits.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
});

it('M25 L3c: sign-in draws no not-ready method, so it has no Coming soon of its own', () => {
  const src = read('app/auth/sign-in.tsx');
  expect(src).not.toMatch(/useComingSoon\(\)/);
  expect(src).toMatch(/<OtherWays /);
});

it('G-E7: Me opens Coming soon for Wallet while the store is off, and keeps the page one tap on', () => {
  const src = read('app/(tabs)/me.tsx');
  expect(src).toMatch(/readStoreReady\(stores\.settings\) \? undefined : \(\) => comingSoon\(/);
  expect(src).toMatch(/label: 'Open Wallet', onPress: \(\) => router\.push\('\/wallet'\)/);
  expect(src).toMatch(/<MenuRow href="\/wallet"/);
});

it('G-E7: Coming soon is the B bottom sheet — a mark tile, never the old centred card', () => {
  const src = read('src/ui/kit/ComingSoon.tsx');
  expect(src).toMatch(/<Actionsheet /);
  expect(src).not.toMatch(/AlertDialog/);
  expect(src).toMatch(/mark: IconName \| 'google'/);
  expect(read('app/(tabs)/me.tsx')).toMatch(/mark: 'wallet-outline'/);
});

it('the pop-up names no date and no price', () => {
  const lines = read('app/(tabs)/me.tsx').match(/line: [`'][^`']+[`']/g) ?? [];
  expect(lines.length).toBeGreaterThanOrEqual(1);
  // `${…}` is a code placeholder, not a dollar price — drop it before looking for prices.
  for (const l of lines.map((x) => x.replace(/\$\{[^}]*\}/g, ''))) {
    expect(l).not.toMatch(/\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]/);
    expect(l).not.toMatch(/[$£€¥]|RM ?\d|\d+\.\d\d/);
  }
});
