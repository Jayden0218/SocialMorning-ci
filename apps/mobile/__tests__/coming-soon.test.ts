/**
 * M17 guard G-E7 (FR-013, FR-014, FR-015): a feature that is not released yet says so with the
 * Coming soon pop-up — never the old "… is not set up yet." toast. Sign-in's not-ready methods
 * open it (with "Continue with email"), and Me's Wallet opens it while purchases are off (with
 * "Open Wallet", so the Wallet page stays reachable — FR-007). No date, no price.
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

it('G-E7: sign-in opens Coming soon for a not-ready method, with email as the way in', () => {
  const src = read('app/auth/sign-in.tsx');
  expect(src).toMatch(/useComingSoon\(\)/);
  expect(src).toMatch(/if \(!m\.ready\) comingSoon\(/);
  expect(src).toMatch(/label: 'Continue with email'/);
  expect(src).toMatch(/\{comingSoonDialog\}/);
});

it('G-E7: Me opens Coming soon for Wallet while the store is off, and keeps the page one tap on', () => {
  const src = read('app/(tabs)/me.tsx');
  expect(src).toMatch(/readStoreReady\(stores\.settings\) \? undefined : \(\) => comingSoon\(/);
  expect(src).toMatch(/label: 'Open Wallet', onPress: \(\) => router\.push\('\/wallet'\)/);
  expect(src).toMatch(/<MenuRow href="\/wallet"/);
});

it('the pop-up names no date and no price', () => {
  const lines = [read('app/auth/sign-in.tsx'), read('app/(tabs)/me.tsx')].join('\n').match(/line: [`'][^`']+[`']/g) ?? [];
  expect(lines.length).toBeGreaterThanOrEqual(2);
  // `${…}` is a code placeholder, not a dollar price — drop it before looking for prices.
  for (const l of lines.map((x) => x.replace(/\$\{[^}]*\}/g, ''))) {
    expect(l).not.toMatch(/\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]/);
    expect(l).not.toMatch(/[$£€¥]|RM ?\d|\d+\.\d\d/);
  }
});
