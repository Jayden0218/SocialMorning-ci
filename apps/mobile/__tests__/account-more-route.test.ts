// Tests that "More account options" is its own page, so Back works right.
/**
 * M17 guard G-AM1 (phone walk 2026-10-02, M16a Tier B row "Settings → Account → More" FAILED:
 * both ← and the edge swipe skipped "Account and security" and landed on Settings).
 *
 * Cause: "More account options" was a sub-view toggled by `useState` inside
 * `app/settings/account.tsx`. The stack held one page where the listener saw two, so any back —
 * button or swipe — popped that one route. The fix makes More a real route
 * (`app/settings/account-more.tsx`) pushed on top of Account and security.
 *
 * A source scan, like no-native-ui: which page is on the stack is a navigator fact a renderer
 * test cannot see. The phone row is the real evidence.
 *
 * The break that turns it red: in app/settings/account.tsx change the More row's
 * `onPress={() => router.push('/settings/account-more')}` back to a sub-view toggle
 * (`onPress={() => setMore(true)}` with `const [more, setMore] = useState(false)`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(__dirname, '..', 'app');
const account = readFileSync(join(APP, 'settings', 'account.tsx'), 'utf8');
const morePath = join(APP, 'settings', 'account-more.tsx');

it('the More row pushes its own route', () => {
  expect(account).toMatch(/accessibilityLabel="More account options"/);
  expect(account).toMatch(/router\.push\('\/settings\/account-more'\)/);
});

it('Account and security keeps no sub-view: no state, one fixed title, no deletion flow', () => {
  expect(account).not.toMatch(/useState/);
  expect(account).toMatch(/<PageHeader title="Account and security" \/>/);
  expect(account).not.toMatch(/Delete my account/);
});

it('the More page is a route with the app\'s own bar and the deletion flow', () => {
  expect(existsSync(morePath)).toBe(true);
  const more = readFileSync(morePath, 'utf8');
  expect(more).toMatch(/export default function/);
  expect(more).toMatch(/<PageHeader title="More" \/>/);
  expect(more).toMatch(/accessibilityLabel="Delete my account"/);
  expect(more).toMatch(/deleteAccountWithCode/);
});
