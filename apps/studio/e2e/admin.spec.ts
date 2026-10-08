// Checks in a real browser that the owner can use every Admin page.
/**
 * M15 T040 — Admin in a real browser against the real API and PostgreSQL (ci/workflows/e2e.yml).
 * The owner is `E2E_MOD_EMAIL` (scripts/e2e-server.ts makes that account at start and passes it
 * as OWNER_LISTENER_ID, so it is seeded as the first admin). Stand-ins as in studio.spec.ts: the
 * image store answers the browser's upload; Apple's catalogue is down, so a pick is saved with a
 * warning (it does not resolve) — which is itself acceptance scenario US2-4.
 */
import { expect, test, type Page } from '@playwright/test';

const PW = 'e2e-correct-horse';
const OWNER = process.env['E2E_MOD_EMAIL'] ?? 'mod@journey.test';
const STRANGER = { email: 'stranger@e2e.test', name: 'Stranger' };
const TAG = Date.now().toString(36);

let shot = 0;
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-results/admin/${String(++shot).padStart(2, '0')}-${name}.png`, fullPage: true });

async function signIn(page: Page, email: string, path = '/admin') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** The image store: answer the browser's `put` (and its CORS preflight) the way Vercel Blob does. */
async function fakeStore(page: Page) {
  await page.route((url) => url.href.startsWith('https://vercel.com/api/blob'), async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'PUT, POST, GET, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const pathname = new URL(route.request().url()).searchParams.get('pathname') ?? 'x';
    const url = `https://e2estore.public.blob.vercel-storage.com/${pathname}`;
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url, downloadUrl: url, pathname, contentType: 'image/png', contentDisposition: 'inline' }) });
  });
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

test('Admin, as the owner: record, picks, accounts + act as, curator, Discover, launch, users, reports', async ({ page }) => {
  await fakeStore(page);
  await signIn(page, OWNER);

  // US1 — the owner lands in Admin (next=/admin is honoured). M18: Dashboard opens first, with
  // its headline numbers counted on the live server; then Activity, one link away.
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Headline' }).getByText('Accounts')).toBeVisible();
  for (const h of ['Users', 'Listening', 'Library', 'Social', 'For You', 'Safety', 'Money', 'Creators']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible();
  }
  await snap(page, 'dashboard');
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Activity' }).click();
  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await snap(page, 'activity-empty');

  // US2 — picks for tomorrow (saved through the API from this signed-in page; the episode search
  // needs Apple, which is down here). The calendar marks the day; the record lists the save.
  const day = tomorrow();
  const cur = (await (await page.request.get(`/api/v1/admin/picks/${day}`)).json()) as { version: number };
  const saved = await page.request.put(`/api/v1/admin/picks/${day}`, {
    headers: { 'x-studio': '1' },
    data: { version: cur.version, items: [{ feedUrl: 'https://feeds.example.com/e2e.xml', why: `E2E pick ${TAG}` }] },
  });
  expect(saved.status()).toBe(200);
  expect(((await saved.json()) as { warnings: string[] }).warnings).toHaveLength(1);
  const stale = await page.request.put(`/api/v1/admin/picks/${day}`, { headers: { 'x-studio': '1' }, data: { version: cur.version, items: [] } });
  expect(stale.status(), 'a save on the old version is refused').toBe(409);
  await page.getByRole('link', { name: 'Picks' }).click();
  if (day.slice(0, 7) !== new Date().toISOString().slice(0, 7)) await page.getByRole('button', { name: 'Next month' }).click();
  const cell = page.getByRole('button', { name: new RegExp(`1 pick, set in Admin`) });
  await expect(cell.first()).toBeVisible();
  await cell.first().click();
  await expect(page.getByLabel('Quote').first()).toHaveValue(`E2E pick ${TAG}`);
  await expect(page.getByText('Did not resolve')).toBeVisible();
  await snap(page, 'picks');
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('cell', { name: day })).toBeVisible();

  // US4 — three accounts from a list; act as one; create a show as it; switch back.
  await page.getByRole('link', { name: 'Accounts' }).click();
  const names = ['Ana', 'Ben', 'Cai'].map((n) => `${n} ${TAG}`);
  await page.getByLabel(/One per line/).fill(names.join('\n'));
  await page.getByRole('button', { name: 'Create 3 accounts' }).click();
  await expect(page.getByRole('list', { name: 'Results' }).getByText('created')).toHaveCount(3);
  await snap(page, 'accounts-bulk');
  await page.getByRole('button', { name: `Act as ${names[2]}` }).click();
  await expect(page.getByText(`Acting as ${names[2]}`)).toBeVisible();
  await page.getByLabel('Show name').fill(`Shared Show ${TAG}`);
  await page.getByRole('button', { name: 'Create show' }).click();
  await expect(page).toHaveURL(/\/episodes\/new$/);
  await expect(page.getByText(/Acting as/)).toBeVisible();
  await snap(page, 'acting');
  await page.getByRole('button', { name: 'Switch back' }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
  await expect(page.getByText(/Acting as/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByText(`as ${names[2]}`).first()).toBeVisible();

  // US4 — curator on an external show.
  await page.getByRole('link', { name: 'Accounts' }).click();
  await page.getByLabel('Feed URL').fill(`https://feeds.example.com/${TAG}.xml`);
  await page.getByLabel('Account', { exact: true }).selectOption({ label: names[0]! });
  await page.getByRole('button', { name: 'Set curator' }).click();
  await expect(page.getByText(`Shared by ${names[0]}`)).toBeVisible();

  // US5 — hide a section and save.
  await page.getByRole('link', { name: 'Discover' }).click();
  await page.getByRole('checkbox', { name: 'What listeners said' }).uncheck(); // M25 A5: the phone's own words
  await page.getByRole('button', { name: 'Save Discover' }).click();
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await snap(page, 'discover');

  // US3 — a 2 MB image is refused naming 1 MB; a small one makes a live promotion.
  await page.getByRole('link', { name: 'Launch' }).click();
  await page.getByLabel(/Drop the image here/).setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024, 1) });
  await expect(page.getByText(/the limit is 1 MB/)).toBeVisible();
  await page.getByLabel(/Drop the image here/).setInputFiles({ name: 'small.png', mimeType: 'image/png', buffer: Buffer.alloc(40_000, 1) });
  await page.getByRole('button', { name: 'Save promotion' }).click();
  await expect(page.getByText('Live').first()).toBeVisible();
  await expect(page.getByText('0 shown · 0 taps').first()).toBeVisible();
  await snap(page, 'launch');

  // US6 — find an account, suspend, restore; the moderation record has both.
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Name or email').fill(names[1]!);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: `Suspend ${names[1]}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText('Suspended').first()).toBeVisible();
  await page.getByRole('button', { name: `Restore ${names[1]}` }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('button', { name: `Suspend ${names[1]}` })).toBeVisible();
  await page.getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: /Recent actions/ })).toBeVisible();
  await expect(page.getByText('unsuspend').first()).toBeVisible();
  await snap(page, 'reports');
});

test('Admin, as anyone else: no link, a refusal on the page, 403 from every admin call', async ({ page, request }) => {
  const r = await request.post('/api/v1/auth/sign-up', { data: { email: STRANGER.email, password: PW, displayName: STRANGER.name } });
  expect([200, 409]).toContain(r.status());
  await signIn(page, STRANGER.email);
  await expect(page.getByText('Admin is for the owner only')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
  expect((await page.request.get('/api/v1/admin/audit')).status()).toBe(403);
  expect((await page.request.put('/api/v1/admin/discover', { headers: { 'x-studio': '1' }, data: { version: 0, order: [], hidden: [], pins: [], hides: [] } })).status()).toBe(403);
  await snap(page, 'refused');
});
