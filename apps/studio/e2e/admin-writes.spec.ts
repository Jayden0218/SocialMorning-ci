// One real-browser flow per Admin write action (review F3, T062): each ends on a result the page or the API shows.
/**
 * Runs in the same harness as admin.spec.ts (ci/workflows/e2e.yml): the owner is E2E_MOD_EMAIL, the
 * listeners are made through the test server's /__e2e/account, and every flow is independent —
 * its own accounts, words and codes carry a per-run TAG. Flows:
 *   1 report → suspend the author → the suspended listener appeals → Accept → the account works again
 *   2 redeem codes: make one, a listener redeems it, it reads "Used up"; switch another off
 *   3 maintenance: on → the app answers 503 "maintenance" and Admin still works → off
 *   4 blocked words: add → a write with it is refused → remove → the write passes
 *   5 system notice: send → the listener's System page has it → delete → gone
 *   6 app settings: save search hints → the phone's config answers them → back to default
 */
import { expect, type Page } from '@playwright/test';
import { API, asListener, makeAccount, TAG, test } from './admin-helpers';

let shot = 0;
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-results/admin-writes/${String(++shot).padStart(2, '0')}-${name}.png`, fullPage: true });

test('Reports: a report → suspend the author → the listener appeals → Accept restores the account', async ({ owner: page, request }) => {
  const offender = await makeAccount(request, 'Offender');
  const reporter = await makeAccount(request, 'Reporter');
  const rep = await asListener(request, reporter).send('POST', '/v1/reports', { targetKind: 'profile', targetId: offender.id, reason: 'spam', note: `e2e ${TAG}` });
  expect(rep.status()).toBe(201);

  await page.getByRole('link', { name: 'Reports' }).click();
  const item = page.getByRole('region', { name: 'Open reports' }).getByRole('listitem').filter({ hasText: offender.id });
  await expect(item.getByText(`Profile: ${offender.name}`)).toBeVisible();
  await item.getByRole('button', { name: new RegExp(`Suspend the author — profile ${offender.id}`) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Suspend the author' }).click();
  await expect(item).toHaveCount(0); // closed on the queue
  await expect(page.getByRole('heading', { name: /Recent actions/ })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: offender.id }).getByText('suspend', { exact: true })).toBeVisible(); // in Recent actions
  await snap(page, 'report-suspended');
  // The server agrees: the suspended session is refused on an ordinary call.
  expect((await asListener(request, offender).get('/v1/me')).status()).toBe(403);

  // The suspended listener may still appeal (one per action).
  const appealable = (await (await asListener(request, offender).get('/v1/appeals')).json()) as { items: { actionId?: string; id?: string }[] };
  const actionId = appealable.items[0]?.actionId ?? appealable.items[0]?.id;
  expect(actionId, 'the suspension is appealable').toBeTruthy();
  const text = `Please look again ${TAG}`;
  expect((await asListener(request, offender).send('POST', '/v1/appeals', { actionId, text })).status()).toBe(201);

  await page.getByRole('link', { name: 'Appeals' }).click();
  const appeal = page.getByRole('listitem').filter({ hasText: text });
  await expect(appeal).toBeVisible();
  await expect(appeal.getByText('Suspended', { exact: true })).toBeVisible();
  await snap(page, 'appeal-open');
  await appeal.getByRole('button', { name: /Accept/ }).click();
  await expect(page.getByRole('dialog').getByText('The account works again at once.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Accept' }).click();
  await expect(appeal).toHaveCount(0);
  await page.getByRole('tab', { name: 'Decided' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: text }).getByText('accepted', { exact: true })).toBeVisible();
  await snap(page, 'appeal-accepted');
  expect((await asListener(request, offender).get('/v1/me')).status(), 'accepting the appeal restored the account').toBe(200);
});

test('Redeem codes: make a code, a listener redeems it, it is used up; another is switched off', async ({ owner: page, request }) => {
  const listener = await makeAccount(request, 'Redeemer');
  await page.getByRole('link', { name: 'Redeem codes' }).click();

  await page.getByLabel('Days of PLUS').fill('7');
  await page.getByLabel(/^Note, only you see it/).fill(`e2e use ${TAG}`);
  await page.getByRole('button', { name: 'Make code' }).click();
  const made = page.getByRole('list', { name: 'New codes' }).locator('code');
  await expect(made).toHaveCount(1);
  const code = ((await made.textContent()) ?? '').replace(/-/g, '');
  expect(code).toMatch(/^[A-Z0-9]{8,}$/);
  const row = page.getByRole('row').filter({ hasText: `e2e use ${TAG}` });
  await expect(row.getByText('PLUS, 7 days')).toBeVisible();
  await expect(row.getByText('0 / 1')).toBeVisible();
  await expect(row.getByText('Open', { exact: true })).toBeVisible();
  await snap(page, 'redeem-made');

  const r = await asListener(request, listener).send('POST', '/v1/me/redeem', { code });
  expect(r.status()).toBe(200);
  await page.reload();
  const used = page.getByRole('row').filter({ hasText: `e2e use ${TAG}` });
  await expect(used.getByText('1 / 1')).toBeVisible();
  await expect(used.getByText('Used up')).toBeVisible();
  expect((await asListener(request, listener).send('POST', '/v1/me/redeem', { code })).status(), 'a second use is refused').toBeGreaterThanOrEqual(400);

  // Switch a second code off: it reads Off, and the listener cannot redeem it.
  await page.getByLabel('Days of PLUS').fill('3');
  await page.getByLabel(/^Note, only you see it/).fill(`e2e off ${TAG}`);
  await page.getByRole('button', { name: 'Make code' }).click();
  const code2 = ((await page.getByRole('list', { name: 'New codes' }).locator('code').textContent()) ?? '').replace(/-/g, '');
  const row2 = page.getByRole('row').filter({ hasText: `e2e off ${TAG}` });
  await row2.getByRole('button', { name: /Switch off/ }).click();
  await expect(row2.getByText('Off', { exact: true })).toBeVisible();
  await expect(row2.getByRole('button', { name: /Switch off/ })).toHaveCount(0);
  const other = await makeAccount(request, 'Redeemer2');
  expect((await asListener(request, other).send('POST', '/v1/me/redeem', { code: code2 })).status(), 'a switched-off code is refused').toBeGreaterThanOrEqual(400);
  await snap(page, 'redeem-off');
});

test('Maintenance: on → the app answers "maintenance" and Admin still works → off', async ({ owner: page, request }) => {
  const listener = await makeAccount(request, 'Maint');
  await page.getByRole('link', { name: 'Safety' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'The app works as usual.' })).toBeVisible();
  try {
    const msg = `Back soon ${TAG}`;
    const ends = new Date(Date.now() + 3_600_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    await page.getByLabel('Message').fill(msg);
    await page.getByLabel('Ends at').fill(`${ends.getFullYear()}-${pad(ends.getMonth() + 1)}-${pad(ends.getDate())}T${pad(ends.getHours())}:${pad(ends.getMinutes())}`);
    await page.getByRole('button', { name: 'Turn on' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('status').filter({ hasText: msg })).toBeVisible();
    await expect(page.getByRole('status').getByText('On', { exact: true })).toBeVisible();
    await snap(page, 'maintenance-on');

    const blocked = await asListener(request, listener).get('/v1/me');
    expect(blocked.status()).toBe(503);
    const body = (await blocked.json()) as { error: string; maintenance: { message: string } };
    expect(body.error).toBe('maintenance');
    expect(body.maintenance.message).toBe(msg);
    expect(((await (await request.get(`${API}/v1/health`)).json()) as { maintenance?: unknown }).maintenance, 'health carries the news').toBeTruthy();
    // Admin keeps working: reload the page and it still loads, with the switch On.
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: msg })).toBeVisible();
  } finally {
    // Never leave the shared API in maintenance, whatever failed above.
    const off = page.getByRole('button', { name: 'Turn off' });
    if (await off.isVisible().catch(() => false)) {
      await off.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    } else {
      await page.request.put('/api/v1/admin/maintenance', { headers: { 'x-studio': '1' }, data: { on: false } });
    }
  }
  await expect(page.getByRole('status').filter({ hasText: 'The app works as usual.' })).toBeVisible();
  expect((await asListener(request, listener).get('/v1/me')).status(), 'the app works again').toBe(200);
  await snap(page, 'maintenance-off');
});

test('Blocked words: add → a write with the word is refused → remove → it passes', async ({ owner: page, request }) => {
  const listener = await makeAccount(request, 'Wordy');
  const word = `zorbquux${TAG.replace(/[^a-z0-9]/g, '')}`;
  const rename = (name: string) => asListener(request, listener).send('PATCH', '/v1/me', { displayName: name });
  expect((await rename(`ok ${word}`)).status(), 'allowed before the word is blocked').toBe(200);

  await page.getByRole('link', { name: 'Safety' }).click();
  await page.getByLabel('Words to block, one per line or comma').fill(word);
  await page.getByRole('button', { name: 'Block' }).click();
  const row = page.getByRole('listitem').filter({ hasText: word });
  await expect(row).toBeVisible();
  await snap(page, 'word-added');
  const refused = await rename(`bad ${word}`);
  expect(refused.status()).toBe(422);
  expect(((await refused.json()) as { error: string }).error).toBe('blocked_word');

  await row.getByRole('button', { name: new RegExp(`Remove ${word}`) }).click();
  await expect(row).toHaveCount(0);
  expect((await rename(`fine ${word}`)).status(), 'allowed again once removed').toBe(200);
  await snap(page, 'word-removed');
});

test('Notices: send one → the listener sees it on System → delete → gone', async ({ owner: page, request }) => {
  const listener = await makeAccount(request, 'Noticed');
  const title = `E2E notice ${TAG}`;
  await page.getByRole('link', { name: 'Notices' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Text', { exact: true }).fill('Hello from the e2e owner.');
  await page.getByLabel('Button label (optional)').fill('Open inbox');
  await page.getByLabel(/^Button opens/).fill('/inbox');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sent.' })).toBeVisible();
  const sent = page.getByRole('listitem').filter({ hasText: title });
  await expect(sent.getByText('button “Open inbox” → /inbox')).toBeVisible();
  await snap(page, 'notice-sent');

  const system = async () => ((await (await asListener(request, listener).get('/v1/me/notifications/system')).json()) as { items: { title: string }[] }).items.map((i) => i.title);
  expect(await system()).toContain(title);

  await sent.getByRole('button', { name: new RegExp(`Delete ${title}`) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(sent).toHaveCount(0);
  expect(await system()).not.toContain(title);
  await snap(page, 'notice-deleted');
});

test('App settings: save search hints → the phone config answers them → back to default', async ({ owner: page, request }) => {
  const hint = `hint-${TAG}`;
  await page.getByRole('link', { name: 'App settings' }).click();
  const card = page.getByRole('region', { name: /Search hints/ });
  await expect(card.getByText('Default', { exact: true })).toBeVisible();
  await card.getByLabel(/^Hints, one per line/).fill(`${hint}\nsecond-${TAG}`);
  await card.getByRole('button', { name: /^Save search hints/ }).click();
  await expect(card.getByRole('status')).toContainText('Saved');
  await expect(card.getByText('Changed', { exact: true })).toBeVisible();
  await snap(page, 'settings-saved');

  const listener = await makeAccount(request, 'Settings');
  const hintsNow = async () => JSON.stringify((await (await asListener(request, listener).get('/v1/config')).json()));
  expect(await hintsNow()).toContain(hint);

  await card.getByRole('button', { name: 'Back to default' }).click();
  await expect(page.getByRole('region', { name: /Search hints/ }).getByText('Default', { exact: true })).toBeVisible();
  expect(await hintsNow()).not.toContain(hint);
});
