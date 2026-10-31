// Shared by the Admin write-action specs: owner sign-in, throw-away accounts, API calls as a listener.
import { expect, test as base, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const PW = 'e2e-correct-horse';
export const OWNER = process.env['E2E_MOD_EMAIL'] ?? 'mod@journey.test';
export const API = 'http://localhost:8787';
/** Unique per run, so a re-run on the same API never meets the last run's rows. */
export const TAG = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** The owner signs in with the password, then the code the test server's inbox holds (M25 SB). */
export async function signInOwner(page: Page, path = '/admin') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByLabel('Email').fill(OWNER);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'We emailed' })).toBeVisible();
  const r = await page.request.get(`${API}/__e2e/code?email=${encodeURIComponent(OWNER)}`);
  const { code } = (await r.json()) as { code: string };
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the code' })).toHaveCount(0);
}

export type Account = { id: string; token: string; name: string };

/** A listener with a session, made through the test server's own route. */
export async function makeAccount(request: APIRequestContext, label: string): Promise<Account> {
  const name = `${label} ${TAG}`;
  const r = await request.post(`${API}/__e2e/account`, { data: { email: `${label.toLowerCase()}-${TAG}@e2e.test`, password: PW, displayName: name } });
  expect(r.status()).toBe(200);
  const b = (await r.json()) as { token: string; listener: { id: string } };
  return { id: b.listener.id, token: b.token, name };
}

/** An API call as a listener (a Bearer session), straight at the API. */
export const asListener = (request: APIRequestContext, a: Pick<Account, 'token'>) => ({
  get: (path: string) => request.get(`${API}${path}`, { headers: { authorization: `Bearer ${a.token}` } }),
  send: (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: unknown) =>
    request.fetch(`${API}${path}`, { method, headers: { authorization: `Bearer ${a.token}` }, ...(data === undefined ? {} : { data }) }),
});

/**
 * The owner signs in ONCE per worker (each password sign-in emails a code, and the API rate-limits
 * those); every test then gets its own page, in a fresh context carrying that session. Tests stay
 * independent: nothing else is shared.
 */
let ownerState: Promise<Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>> | undefined;
async function ownerSession(browser: Browser, baseURL: string | undefined) {
  ownerState ??= (async () => {
    const ctx = await browser.newContext(baseURL ? { baseURL } : {});
    try { await signInOwner(await ctx.newPage()); return await ctx.storageState(); } finally { await ctx.close(); }
  })();
  return ownerState;
}

export const test = base.extend<{ owner: Page }>({
  owner: async ({ browser, baseURL }, use) => {
    const ctx = await browser.newContext({ storageState: await ownerSession(browser, baseURL), viewport: { width: 1280, height: 860 }, ...(baseURL ? { baseURL } : {}) });
    const page = await ctx.newPage();
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await use(page);
    await ctx.close();
  },
});
