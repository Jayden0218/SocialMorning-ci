/**
 * M8 guard G-W1 — **a module nothing constructs is not a feature.**
 *
 * `createSubscriptionSync` was written at T017, had ten passing tests, and was never
 * called. The suite was green, the cloud gate was green, and the server had **zero**
 * subscription rows for weeks' worth of work. It was found on the phone on 2026-09-26 by
 * querying the database rather than by trusting a screen.
 *
 * The lesson is not "write more unit tests" — the unit tests were fine and they were
 * testing something real. It is that a factory can be perfect and unreachable at the same
 * time, and nothing in a normal suite notices. This guard notices.
 *
 * It is deliberately crude: it reads the source. A cleverer version that imported and
 * rendered `AppProviders` would need the whole native surface mocked, and would be the
 * kind of test that gets deleted the first time it breaks for an unrelated reason.
 *
 * The break that turns it red: delete the `createSubscriptionSync` call from
 * `src/ui/providers.tsx`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))];
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

/** Every `export function createXxx(...)` that is meant to be wired into the running app. */
const FACTORY = /export function (create[A-Za-z0-9]*(?:Sync|Outbox|Manager|Poll))\s*\(/g;

it('G-W1: every sync, outbox and manager factory is actually constructed somewhere in the app', () => {
  const unwired: string[] = [];

  for (const [file, src] of sources) {
    for (const m of src.matchAll(FACTORY)) {
      const name = m[1]!;
      const callers = [...sources.entries()].filter(([other, body]) => other !== file && body.includes(`${name}(`));
      if (callers.length === 0) unwired.push(`${file.slice(ROOT.length + 1)} exports ${name}, and nothing calls it`);
    }
  }

  expect(unwired).toEqual([]);
});

it('G-W1: the subscription sync specifically reaches both of the places US1 needs it', () => {
  const providers = sources.get(join(ROOT, 'src/ui/providers.tsx'))!;
  const show = sources.get(join(ROOT, 'app/show/[feedUrl].tsx'))!;

  // At launch: something must construct it and reconcile.
  expect(providers).toContain('createSubscriptionSync(');
  expect(providers).toMatch(/subscriptionSync[\s\S]{0,400}reconcile\(\)/);

  // On a subscribe or unsubscribe: something must push.
  expect(show).toContain('subscriptionSync.push()');
});
