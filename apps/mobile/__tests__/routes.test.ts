/**
 * Guard G3 — every path M1–M6 deep-links to still resolves after the tab group landed.
 *
 * The tab group is a **route group**: `app/(tabs)/index.tsx` answers `/`, not
 * `/(tabs)`. That is the whole reason the change was safe, and it is exactly the kind
 * of thing that is true until someone renames a folder. M4's clip links and M6's
 * empty-state actions are `socialmorning://…` strings that live in the app, on the
 * server, and in a share sheet already sent to other people — a path that stops
 * resolving is a link someone else cannot open.
 *
 * The break that turns it red: move `app/inbox.tsx` out of the app directory.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(__dirname, '..', 'app');

/** Route groups — `(tabs)` — are invisible in the URL. Everything else is a segment. */
function resolves(path: string): boolean {
  const segments = path.split('/').filter((s) => s.length > 0);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      if (existsSync(join(dir, 'index.tsx')) || existsSync(join(dir, 'index.ts'))) return true;
      // `/` is `app/(tabs)/index.tsx` now: a group is invisible in the URL at any depth,
      // including the root.
      return readdirSync(dir).some((e) => e.startsWith('(') && walk(join(dir, e), rest));
    }
    const [head, ...tail] = rest as [string, ...string[]];
    // A literal file or directory.
    for (const candidate of [`${head}.tsx`, `${head}.ts`]) {
      if (tail.length === 0 && existsSync(join(dir, candidate))) return true;
    }
    if (existsSync(join(dir, head)) && statSync(join(dir, head)).isDirectory()) {
      if (walk(join(dir, head), tail)) return true;
    }
    // A dynamic segment, e.g. `[id].tsx` or `[feedUrl]/`.
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith('[')) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (walk(full, tail)) return true;
      } else if (tail.length === 0 && /^\[[^\]]+\]\.tsx?$/.test(entry)) {
        return true;
      }
    }
    // A group directory is invisible in the URL: try inside every one.
    for (const entry of readdirSync(dir)) {
      if (!entry.startsWith('(')) continue;
      if (walk(join(dir, entry), rest)) return true;
    }
    return false;
  };
  return walk(APP, segments);
}

/** Every path the app links to, or answers a `socialmorning://` link on, M1 through M6. */
const PATHS = [
  '/', '/discover', '/following',
  '/inbox', '/queue', '/downloads', '/account', '/search',
  '/show/https%3A%2F%2Ff%2Fx.xml', '/episode/e1', '/player',
  '/profile/l1', '/profile/l1/followers', '/profile/l1/following',
  '/clip/new', '/clip/c1',
  '/auth/sign-in', '/auth/sign-up',
];

it('G3: every path M1–M6 deep-links to still resolves', () => {
  expect(PATHS.filter((p) => !resolves(p))).toEqual([]);
});

it('a path that does not exist is reported as not resolving — otherwise the test above proves nothing', () => {
  expect(resolves('/no-such-screen')).toBe(false);
  expect(resolves('/profile/l1/blocked')).toBe(false);
});

it('the three tabs live in the group, and the group is invisible in the URL', () => {
  for (const f of ['index.tsx', 'discover.tsx', 'following.tsx', '_layout.tsx']) {
    expect(existsSync(join(APP, '(tabs)', f))).toBe(true);
  }
  // The old locations are gone — two files answering `/discover` is a silent conflict.
  expect(existsSync(join(APP, 'index.tsx'))).toBe(false);
  expect(existsSync(join(APP, 'discover.tsx'))).toBe(false);
  expect(existsSync(join(APP, 'following.tsx'))).toBe(false);
});
