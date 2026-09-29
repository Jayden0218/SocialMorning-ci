/**
 * The Studio, end to end, in a real browser (Chromium) against the real API and a real
 * PostgreSQL (ci/workflows/e2e.yml). Stand-ins, and only these: the audio store answers the
 * browser's upload call (the route below) and Apple's catalogue is down. Every step saves a
 * screenshot into the run's artifacts.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const PW = 'e2e-correct-horse';
const OWNER = { email: 'owner@e2e.test', name: 'Owner' };
const LISTENER = { email: 'mei@e2e.test', name: 'Mei' };
const OTHER = { email: 'xu@e2e.test', name: 'Xu' };
const HELPER = { email: 'helper@e2e.test', name: 'Helper' };
const SHOW = 'E2E Morning';

let shot = 0;
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-results/steps/${String(++shot).padStart(2, '0')}-${name}.png`, fullPage: true });

async function signUp(request: APIRequestContext, u: { email: string; name: string }): Promise<string> {
  const r = await request.post('/api/v1/auth/sign-up', { data: { email: u.email, password: PW, displayName: u.name } });
  expect(r.status(), `sign-up ${u.email}`).toBe(200);
  return ((await r.json()) as { token: string }).token;
}
const as = (token: string) => ({ authorization: `Bearer ${token}` });

/** The audio store: answer the browser's `put` (and its CORS preflight) the way Vercel Blob does. */
async function fakeStore(page: Page) {
  await page.route((url) => url.href.startsWith('https://vercel.com/api/blob'), async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'PUT, POST, GET, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const pathname = new URL(route.request().url()).searchParams.get('pathname') ?? 'x';
    const url = `https://e2estore.public.blob.vercel-storage.com/${pathname}`;
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url, downloadUrl: url, pathname, contentType: 'audio/mpeg', contentDisposition: 'inline' }) });
  });
}

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the whole Studio, one creator, from sign-in to sign-out', async ({ page, request, browser }) => {
  const ownerToken = await signUp(request, OWNER);
  void ownerToken;
  const meiToken = await signUp(request, LISTENER);
  const xuToken = await signUp(request, OTHER);
  await signUp(request, HELPER);
  await fakeStore(page);

  // 1 — sign in, no show yet → "Create your show"
  await signIn(page, OWNER.email);
  await expect(page.getByRole('heading', { name: 'Create your show' })).toBeVisible();
  await snap(page, 'no-show');

  // 2 — create a show in one form → New episode
  await page.getByLabel('Show name').fill(SHOW);
  await page.getByLabel('Category').selectOption('Technology');
  await page.getByRole('button', { name: 'Create show' }).click();
  await expect(page).toHaveURL(/\/episodes\/new$/);
  await expect(page.getByText(/Uploading is not switched on yet/)).toHaveCount(0);
  const key = new URL(page.url()).pathname.split('/')[2]!;
  await snap(page, 'new-episode');

  // 3 — upload an MP3 and publish → the episode page
  await page.getByLabel(/Audio file/).setInputFiles({ name: 'first.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(48_000, 1) });
  await expect(page.getByLabel('Title')).toHaveValue('first');
  await page.getByLabel('Title').fill('Episode one');
  await page.getByLabel(/Shownotes/).fill('Hello & welcome');
  await page.getByRole('button', { name: 'Upload and publish' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${key}/episodes/[0-9a-f]+$`));
  await expect(page.getByRole('heading', { name: 'Episode one' })).toBeVisible();
  const episodeId = new URL(page.url()).pathname.split('/').at(-1)!;
  await snap(page, 'episode-published');

  // 4 — the show's RSS feed carries it
  const details = (await (await page.request.get(`/api/v1/studio/shows/${key}/details`)).json()) as { show: { id: string; feedUrl: string } };
  const feedPath = `/api/feeds/${details.show.id}.xml`;
  const xml = await (await request.get(feedPath)).text();
  expect(xml).toContain('<title>Episode one</title>');
  expect(xml).toMatch(/<enclosure url="https:\/\/e2estore\.public\.blob\.vercel-storage\.com\/episodes\/[^"]+\.mp3" length="48000" type="audio\/mpeg"\/>/);

  // 5 — a listener subscribes and comments (as the app does); Home shows it
  expect((await request.put('/api/v1/me/subscriptions', { headers: as(meiToken), data: { items: [{ feedUrl: details.show.feedUrl, createdAt: new Date().toISOString() }] } })).status()).toBe(200);
  const posted = await request.post(`/api/v1/episodes/${episodeId}/comments`, { headers: as(meiToken), data: { body: 'Loved the intro!', offsetMs: 12_000 } });
  expect(posted.status()).toBe(200);
  const commentId = ((await posted.json()) as { comment: { id: string } }).comment.id;
  await page.goto(`/s/${key}/home`);
  await expect(page.getByText('Loved the intro!')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(SHOW);
  await snap(page, 'home');

  // 6 — reload keeps the session (the cookie works on this host)
  await page.reload();
  await expect(page.getByText('Loved the intro!')).toBeVisible();

  // 7 — reply as host → the app sees the Host mark
  await page.goto(`/s/${key}/comments`);
  await page.getByRole('button', { name: 'Reply' }).first().click();
  await page.getByLabel('Your reply').fill('Thanks for listening!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/Reply sent/)).toBeVisible();
  const thread = async (token: string) => ((await (await request.get(`/api/v1/episodes/${episodeId}/social`, { headers: as(token) })).json()) as { comments: { id: string; body: string | null; hiddenByHost?: true; host?: true; replies: { body: string; host?: true }[] }[] }).comments;
  const [top] = await thread(xuToken);
  expect(top!.replies.map((r) => [r.body, r.host])).toEqual([['Thanks for listening!', true]]);
  await snap(page, 'comments-replied');
  // The host's own reply is marked as the team's and offers no Mute.
  await expect(page.getByRole('button', { name: `Mute ${OWNER.name}` })).toHaveCount(0);

  // 8 — hide: others see a placeholder, the author still reads it; un-hide restores
  // Newest first: the host's own reply is now on top, so act inside Mei's comment, not on the first Hide.
  const meis = page.getByRole('article', { name: `Comment by ${LISTENER.name}` }).first();
  await meis.getByRole('button', { name: 'Hide' }).click();
  await page.getByRole('dialog', { name: 'Hide this comment?' }).getByRole('button', { name: 'Hide' }).click();
  await expect(meis.getByText('Hidden by you')).toBeVisible();
  const hiddenForOther = (await thread(xuToken)).find((c) => c.id === commentId)!;
  expect([hiddenForOther.body, hiddenForOther.hiddenByHost]).toEqual([null, true]);
  expect((await thread(meiToken)).find((c) => c.id === commentId)!.body).toBe('Loved the intro!');
  await snap(page, 'comment-hidden');
  await meis.getByRole('button', { name: 'Un-hide' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Un-hide' }).click();
  await expect(page.getByText('Hidden by you')).toHaveCount(0);
  expect((await thread(xuToken)).find((c) => c.id === commentId)!.body).toBe('Loved the intro!');

  // 9 — mute from the comment → the listener cannot comment; unmute from Subscribers → Muted
  await page.getByRole('button', { name: `Mute ${LISTENER.name}` }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Mute' }).click();
  await expect(page.getByText('Muted on your show').first()).toBeVisible();
  await new Promise((r) => setTimeout(r, 5500)); // the app's 5 s comment floor
  const refused = await request.post(`/api/v1/episodes/${episodeId}/comments`, { headers: as(meiToken), data: { body: 'again' } });
  expect([refused.status(), ((await refused.json()) as { error: string }).error]).toEqual([403, 'muted_on_show']);
  await page.goto(`/s/${key}/subscribers/muted`);
  await expect(page.getByText(LISTENER.name)).toBeVisible();
  await snap(page, 'muted');
  await page.getByRole('button', { name: 'Unmute' }).click();
  await expect(page.getByText('Nobody is muted')).toBeVisible();
  expect((await request.post(`/api/v1/episodes/${episodeId}/comments`, { headers: as(meiToken), data: { body: 'sorry!' } })).status()).toBe(200);

  // 10 — the subscriber list shows the name
  await page.goto(`/s/${key}/subscribers/list`);
  await expect(page.getByRole('cell', { name: LISTENER.name })).toBeVisible();
  await page.goto(`/s/${key}/subscribers`);
  await expect(page.getByRole('heading', { name: 'Subscribes and unsubscribes' })).toBeVisible();
  await snap(page, 'subscribers');

  // 11 — an announcement → on the show in the app
  await page.goto(`/s/${key}/announcements`);
  await page.getByLabel('Message').fill('New season on Monday');
  await page.getByRole('button', { name: 'Publish and notify' }).click();
  await expect(page.getByText(/^Published/)).toBeVisible();
  await snap(page, 'announcement');
  const extras = async () => (await (await request.get(`/api/v1/shows/extras?feedUrl=${encodeURIComponent(details.show.feedUrl)}`, { headers: as(meiToken) })).json()) as { announcements: { body: string }[]; polls: { id: string; total: number }[]; overrides: unknown };
  expect((await extras()).announcements.map((a) => a.body)).toEqual(['New season on Monday']);

  // 12 — a poll → a listener votes → the Studio counts it
  await page.goto(`/s/${key}/polls`);
  await page.getByLabel('Question').fill('Next topic?');
  await page.getByLabel('Option 1').fill('Books');
  await page.getByLabel('Option 2').fill('Films');
  await page.getByRole('button', { name: 'Create poll' }).click();
  await expect(page.getByRole('heading', { name: 'Next topic?' })).toBeVisible();
  const pollId = (await extras()).polls[0]!.id;
  expect((await request.post(`/api/v1/polls/${pollId}/vote`, { headers: as(meiToken), data: { optionIdx: 1 } })).status()).toBe(200);
  await page.reload();
  await expect(page.getByText('1 vote', { exact: true })).toBeVisible();
  await snap(page, 'poll');

  // 13 — show details: rename → the feed follows. M14: Save is off until something changes,
  // and leaving with changes asks in the page first.
  await page.goto(`/s/${key}/settings`);
  const saveBtn = page.getByRole('button', { name: 'Save changes' });
  await expect(page.getByLabel('Show name')).toHaveValue(SHOW);
  await expect(saveBtn).toBeDisabled();
  await page.getByLabel('Show name').fill('E2E Morning Talk');
  await expect(saveBtn).toBeEnabled();
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await snap(page, 'leave-guard');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${key}/settings$`));
  await saveBtn.click();
  await expect(page.getByText(/Saved\. Your feed shows it now/)).toBeVisible();
  await expect(saveBtn).toBeDisabled();
  expect(await (await request.get(feedPath)).text()).toContain('<title>E2E Morning Talk</title>');
  await snap(page, 'show-details');

  // 13a — M14 US3: a contact is checked, saved, and reaches the app
  await page.goto(`/s/${key}/settings/contacts`);
  await page.getByRole('button', { name: 'Add a contact' }).click();
  await page.getByLabel('Website').fill('http://not-https.example');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Must start with https://')).toBeVisible();
  await page.getByLabel('Website').fill('https://morning.example');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();
  const ex = (await (await request.get(`/api/v1/shows/extras?feedUrl=${encodeURIComponent(details.show.feedUrl)}`, { headers: as(meiToken) })).json()) as { overrides: { contacts: unknown } };
  expect(ex.overrides.contacts).toEqual([{ type: 'website', value: 'https://morning.example' }]);
  await snap(page, 'contacts');

  // 13b — M14 US2: an invite link, accepted by Mei in her own browser; her comments then carry the Host mark
  await page.goto(`/s/${key}/settings/hosts`);
  await page.getByRole('button', { name: 'Make an invite link' }).click();
  const inviteUrl = (await page.getByRole('status').locator('code').textContent())!;
  await snap(page, 'hosts-invite');
  const meiCtx = await browser.newContext();
  const mp = await meiCtx.newPage();
  await mp.goto(new URL(inviteUrl).pathname);
  await expect(mp).toHaveURL(/\/sign-in\?next=/);
  await mp.getByRole('tab', { name: 'Password' }).click();
  await mp.getByLabel('Email').fill(LISTENER.email);
  await mp.getByLabel('Password').fill(PW);
  await mp.getByRole('button', { name: 'Sign in' }).click();
  await expect(mp.getByRole('heading', { name: 'Join E2E Morning Talk as a host' })).toBeVisible();
  await mp.getByRole('button', { name: 'Accept' }).click();
  await expect(mp.getByRole('heading', { name: 'You are a host of E2E Morning Talk' })).toBeVisible();
  await mp.screenshot({ path: `e2e-results/steps/${String(++shot).padStart(2, '0')}-invite-accepted.png`, fullPage: true });
  await mp.goto(new URL(inviteUrl).pathname);
  await expect(mp.getByText('This invite link was already used.')).toBeVisible();
  await meiCtx.close();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Hosts' }).getByText(LISTENER.name, { exact: true }).first()).toBeVisible();
  const meiNow = (await thread(xuToken)).filter((c) => c.body === 'sorry!') as { host?: true }[];
  expect(meiNow.map((c) => c.host)).toEqual([true]);

  // 13c — M14 US4: a scheduled episode is not in the feed; it is listed apart; Media shows both files in use
  await page.goto(`/s/${key}/episodes/new`);
  await page.getByLabel(/Audio file/).setInputFiles({ name: 'later.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(48_000, 2) });
  await page.getByLabel('Title').fill('Episode two');
  await page.getByLabel('Publish at a time').check();
  const soon = new Date(Date.now() + 2 * 86_400_000);
  await page.getByLabel(/Date and time/).fill(new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Upload and schedule' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${key}/episodes$`));
  const pending = page.getByRole('region', { name: 'Drafts and scheduled' });
  await expect(pending.getByText('Episode two', { exact: true }).first()).toBeVisible();
  await expect(pending.getByText(/^Scheduled for/)).toBeVisible();
  expect(await (await request.get(feedPath)).text()).not.toContain('Episode two');
  await snap(page, 'scheduled');
  await page.goto(`/s/${key}/media`);
  await expect(page.getByText('In use', { exact: true })).toHaveCount(2);
  await snap(page, 'media');
  await page.goto(`/s/${key}/episodes`);
  await pending.getByRole('button', { name: 'Delete Episode two' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(pending).toHaveCount(0);

  // 14 — team: add a helper; the helper sees Comments but not Settings or Tips
  await page.goto(`/s/${key}/settings/team`);
  await page.getByLabel('Their SocialMorning email').fill(HELPER.email);
  await page.getByRole('button', { name: 'Add helper' }).click();
  await expect(page.getByText(HELPER.name, { exact: true })).toBeVisible();
  await snap(page, 'team');
  const helperCtx = await browser.newContext();
  const hp = await helperCtx.newPage();
  await signIn(hp, HELPER.email);
  await expect(hp).toHaveURL(new RegExp(`/s/${key}/home`));
  const nav = hp.getByRole('navigation', { name: 'Sections' });
  await expect(nav.getByRole('link', { name: 'Comments' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Tips' })).toHaveCount(0);
  expect((await hp.request.get(`/api/v1/studio/shows/${key}/tips`)).status()).toBe(403);
  await hp.screenshot({ path: `e2e-results/steps/${String(++shot).padStart(2, '0')}-helper-view.png`, fullPage: true });
  await helperCtx.close();

  // 15 — Data: the numbers page and a CSV download
  await page.goto(`/s/${key}/data`);
  await expect(page.getByRole('heading', { name: 'Every episode' })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).last().click()]);
  expect(download.suggestedFilename()).toMatch(/-episodes\.csv$/);
  await snap(page, 'data');

  // 16 — Tips: empty, no withdraw
  await page.goto(`/s/${key}/tips`);
  await expect(page.getByText('No tips yet')).toBeVisible();

  // 17 — listeners find the show by name
  const found = (await (await request.get(`/api/v1/search?q=${encodeURIComponent('E2E Morning')}`, { headers: as(meiToken) })).json()) as { shows: { feedUrl: string }[] };
  expect(found.shows[0]?.feedUrl).toBe(details.show.feedUrl);

  // 18 — delete the episode → gone from the feed, its audio deleted from the store
  await page.goto(`/s/${key}/episodes/${episodeId}`);
  await page.getByRole('button', { name: 'Delete episode' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${key}/episodes$`));
  expect(await (await request.get(feedPath)).text()).not.toContain('<item>');
  const removed = (await (await request.get('http://localhost:8787/__e2e/removed')).json()) as string[];
  expect(removed).toHaveLength(2); // Episode two's audio (13c), then this one's
  await snap(page, 'episode-deleted');

  // 19 — sign out → back to sign-in, and the Studio refuses the old session
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await page.request.get('/api/v1/studio/me')).status()).toBe(401);
  await snap(page, 'signed-out');
});
