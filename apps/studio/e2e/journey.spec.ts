// Checks a listener's comment reaches the Studio, the public page and moderation.
/**
 * The listener journey's website half (specs/015-e2e-journey). Runs after
 * `apps/api/scripts/journey.ts seed` and `… listener` have filled the server: 50 listeners, a host's
 * show, listener-01's comment at 0:20 with the host's reply, 3 reported comments. In a real browser:
 *   the host's Studio shows listener-01 and the comment at its moment → the public episode page →
 *   the moderator removes a reported comment on /mod → listeners see it removed.
 * Fails when the seed has not run (JOURNEY_OUT missing) or named no moderator (M25 G10: no silent skips).
 */
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const OUT = process.env['JOURNEY_OUT'] ?? '../api/journey.json';
const API = (process.env['E2E_API'] ?? 'http://localhost:8787').replace(/\/$/, '');
const PW = 'e2e-correct-horse';
type Journey = {
  show: { key: string; title: string };
  episodes: { episodeId: string; title: string }[];
  host: { email: string };
  moderator: { email: string } | null;
  listeners: { email: string; name: string }[];
  reportedCommentIds: string[];
};

let shot = 0;
const snap = (page: Page, name: string) => page.screenshot({ path: `e2e-results/journey/${String(++shot).padStart(2, '0')}-${name}.png`, fullPage: true });

test('the listener journey, seen from the website: Studio, public page, moderation', async ({ page, request }) => {
  // M25 G10: a missing seed FAILS. It used to skip, so a broken seed step turned this into a silent pass.
  expect(existsSync(OUT), `no ${OUT}: the seed step (apps/api/scripts/journey.ts seed + listener) did not write it`).toBe(true);
  const j = JSON.parse(readFileSync(OUT, 'utf8')) as Journey;
  const ep = j.episodes[0]!;
  const me = j.listeners[0]!;

  // 1 — the host signs in to the Studio
  await page.goto('/');
  await page.getByRole('tab', { name: 'Password' }).click();
  await page.getByLabel('Email').fill(j.host.email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${j.show.key}/`));
  await snap(page, 'host-home');

  // 2 — listener-01, who subscribed on the "phone", is in the subscriber list (46 = 45 seeded + 1)
  await page.goto(`/s/${j.show.key}/subscribers/list`);
  await expect(page.getByText(me.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/46/).first()).toBeVisible();
  await snap(page, 'subscribers');

  // 3 — the comment made at 0:20 is in the Studio with its moment and the host's reply
  await page.goto(`/s/${j.show.key}/comments`);
  await expect(page.getByText('Journey: the tone changes nothing, and I love it')).toBeVisible();
  await expect(page.getByText('0:20').first()).toBeVisible();
  await snap(page, 'comments');

  // 4 — the public episode page anyone can open
  await page.goto(`${API}/e/${ep.episodeId}`);
  await expect(page.getByText(ep.title).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Open in SocialNet/ })).toBeVisible();
  await snap(page, 'public-episode-page');

  // 5 — the moderator's queue has the 3 reports; removing one takes it away for listeners
  expect(j.moderator, 'no moderator in the seed (E2E_MOD_EMAIL unset) — this step must run, not skip').not.toBeNull();
  await page.goto(`${API}/mod`);
  await page.getByLabel('Email').fill(j.moderator!.email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Moderation queue' })).toBeVisible();
  const target = j.reportedCommentIds[0]!;
  const item = page.locator('section', { hasText: target });
  await expect(item).toBeVisible();
  for (const id of j.reportedCommentIds) await expect(page.locator('section', { hasText: id })).toBeVisible();
  await snap(page, 'mod-queue');
  await item.getByRole('button', { name: 'Remove the content' }).click();
  await expect(page.locator('section', { hasText: target })).toHaveCount(0);
  await snap(page, 'mod-removed');

  const social = (await (await request.get(`${API}/v1/episodes/${ep.episodeId}/social`)).json()) as { comments: { id: string; removed?: boolean; body: string | null }[] };
  const removed = social.comments.find((c) => c.id === target);
  expect(removed?.removed, 'a removed comment is a placeholder for listeners').toBe(true);
  expect(removed?.body ?? null).toBeNull();
});
