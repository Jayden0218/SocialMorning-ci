// M25 lane AC: app settings (A7) and content pages (A8) — public reads, admin saves, checks, records.
/**
 * - GET /v1/config with nothing saved is exactly the shared defaults (today's app), with an ETag and 304.
 * - An admin save is checked (422 with the reason), version-checked (409 changed), recorded
 *   (area config), and the next public read carries it; a reset puts the default back.
 * - Content: the seeded Academy (5) and Help (9) pages are served in order; an unpublished page is
 *   not; a body holding `<script>` is stored and served as TEXT (the drawing side never makes HTML —
 *   apps/studio/test/m25-content.test.tsx and apps/mobile/__tests__/m25-config.test.tsx).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DEFAULTS } from '@socialmorning/social-core';
import { aCall, adminSetup, auditRows } from './admin-harness.ts';

type Cfg = { config: typeof CONFIG_DEFAULTS; version: number; updatedAt: string | null };

test('A7: nothing saved → the defaults; ETag and 304; public cache header', async () => {
  const { t } = await adminSetup();
  try {
    const r = await t.call('GET', '/v1/config');
    assert.equal(r.status, 200);
    const body = (await r.json()) as Cfg;
    assert.deepEqual(body.config, CONFIG_DEFAULTS);
    assert.equal(body.version, 0);
    assert.equal(body.updatedAt, null);
    assert.match(r.headers.get('cache-control') ?? '', /public/);
    const etag = r.headers.get('etag')!;
    assert.ok(etag);
    assert.equal((await t.call('GET', '/v1/config', undefined, undefined, { 'if-none-match': etag })).status, 304);
  } finally { await t.close(); }
});

test('A7: admin saves a key → checked, versioned, recorded, served; reset brings the default back', async () => {
  const { t, owner, other } = await adminSetup();
  try {
    const first = await t.call('GET', '/v1/config');
    const etag = first.headers.get('etag')!;
    const tiles = [{ id: 'plaza', label: 'Square' }, { id: 'queue', hidden: true }];
    const bad = await aCall(t, 'PUT', '/v1/admin/config/shortcuts', owner, { version: 0, value: [{ id: 'inbox' }] });
    assert.equal(bad.status, 422);
    assert.match(((await bad.json()) as { message: string }).message, /Unknown shortcut inbox/);
    assert.equal((await aCall(t, 'PUT', '/v1/admin/config/nope', owner, { version: 0, value: 1 })).status, 404);
    assert.equal((await aCall(t, 'PUT', '/v1/admin/config/genres', owner, { version: 0, value: [{ id: 999 }] })).status, 422, 'not an Apple genre');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/config/shortcuts', other, { version: 0, value: tiles })).status, 403);

    const put = await aCall(t, 'PUT', '/v1/admin/config/shortcuts', owner, { version: 0, value: tiles });
    assert.equal(put.status, 200, await put.clone().text());
    assert.equal(((await put.json()) as { version: number }).version, 1);
    const stale = await aCall(t, 'PUT', '/v1/admin/config/shortcuts', owner, { version: 0, value: tiles });
    assert.equal(stale.status, 409);

    const after = await t.call('GET', '/v1/config', undefined, undefined, { 'if-none-match': etag });
    assert.equal(after.status, 200, 'a save moves the ETag');
    const body = (await after.json()) as Cfg;
    assert.deepEqual(body.config.shortcuts, tiles);
    assert.deepEqual(body.config.genres, [], 'other keys stay at their default');
    assert.equal(body.version, 1);

    const list = (await (await aCall(t, 'GET', '/v1/admin/config', owner)).json()) as { items: { key: string; saved: boolean; version: number }[]; genres: { id: number; name: string }[] };
    const saved = list.items.find((i) => i.key === 'shortcuts')!;
    assert.equal(saved.saved, true);
    assert.equal(saved.version, 1);
    assert.equal(list.items.find((i) => i.key === 'genres')!.saved, false);
    assert.equal(list.genres.length, 19);
    assert.equal(list.genres[0]!.name, 'Business');

    const reset = await aCall(t, 'DELETE', '/v1/admin/config/shortcuts?version=1', owner);
    assert.equal(reset.status, 200);
    assert.deepEqual(((await (await t.call('GET', '/v1/config')).json()) as Cfg).config.shortcuts, CONFIG_DEFAULTS.shortcuts);

    const rows = (await auditRows(t)).filter((r) => r.area === 'config');
    assert.deepEqual(rows.map((r) => [r.action, r.target]), [['save', 'shortcuts'], ['reset', 'shortcuts']]);
  } finally { await t.close(); }
});

test('A7: a stored value that no longer passes the check is served as the default (degrade per key)', async () => {
  const { t, owner } = await adminSetup();
  try {
    await aCall(t, 'PUT', '/v1/admin/config/searchHints', owner, { version: 0, value: ['jazz'] });
    await t.q(`INSERT INTO app_config (key, value) VALUES ('ratePrompt', '{"delayMs": "soon"}'::jsonb)`);
    // A save elsewhere drops the memo; here a fresh admin save does it.
    await aCall(t, 'PUT', '/v1/admin/config/listSizes', owner, { version: 0, value: { searchCategories: 2 } });
    const body = (await (await t.call('GET', '/v1/config')).json()) as Cfg;
    assert.deepEqual(body.config.searchHints, ['jazz']);
    assert.deepEqual(body.config.ratePrompt, CONFIG_DEFAULTS.ratePrompt);
    assert.equal(body.config.listSizes.searchCategories, 2);
  } finally { await t.close(); }
});

type Page = { slug: string; title: string; summary: string | null; tag: string | null; body: string; position: number };

test('A8: the seeded Academy and Help pages are served in order', async () => {
  const { t } = await adminSetup();
  try {
    const academy = (await (await t.call('GET', '/v1/content/academy')).json()) as { items: Page[] };
    assert.deepEqual(academy.items.map((p) => p.slug), ['claim-your-show', 'read-your-numbers', 'reply-to-comments', 'clips', 'the-studio']);
    assert.match(academy.items[0]!.body, /^## Why claim/);
    assert.match(academy.items[0]!.body, /\n1\. Me › Creator centre\.\n2\. /);
    assert.equal(academy.items[0]!.tag, 'start');
    const faq = (await (await t.call('GET', '/v1/content/faq')).json()) as { items: Page[] };
    assert.equal(faq.items.length, 9);
    assert.equal(faq.items[0]!.title, 'Where does the audio come from?');
    assert.equal(faq.items[0]!.tag, 'Listening');
    assert.equal((await t.call('GET', '/v1/content/other')).status, 404);
    assert.equal((await t.call('GET', '/v1/content/academy/clips')).status, 200);
    assert.equal((await t.call('GET', '/v1/content/academy/none')).status, 404);
  } finally { await t.close(); }
});

test('A8: admin creates, unpublishes, edits, deletes; a <script> body is kept as text', async () => {
  const { t, owner } = await adminSetup();
  try {
    const page = { version: 0, title: 'New one', summary: 'Short', tag: 'grow', body: '## Hi\n\n<script>alert(1)</script>', position: 9, published: false };
    assert.equal((await aCall(t, 'PUT', '/v1/admin/content/academy/New_One', owner, page)).status, 422, 'bad address');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/content/academy/new-one', owner, { ...page, tag: 'other' })).status, 422, 'bad tab');
    assert.equal((await aCall(t, 'PUT', '/v1/admin/content/academy/new-one', owner, { ...page, body: '' })).status, 422);
    const put = await aCall(t, 'PUT', '/v1/admin/content/academy/new-one', owner, page);
    assert.equal(put.status, 200, await put.clone().text());

    const pub = async () => ((await (await t.call('GET', '/v1/content/academy')).json()) as { items: Page[] }).items;
    assert.equal((await pub()).some((p) => p.slug === 'new-one'), false, 'unpublished is not served');
    assert.equal((await t.call('GET', '/v1/content/academy/new-one')).status, 404);
    const all = (await (await aCall(t, 'GET', '/v1/admin/content?kind=academy', owner)).json()) as { items: (Page & { published: boolean; version: number })[] };
    assert.equal(all.items.find((p) => p.slug === 'new-one')?.published, false);

    assert.equal((await aCall(t, 'PUT', '/v1/admin/content/academy/new-one', owner, { ...page, version: 0, published: true })).status, 409);
    assert.equal((await aCall(t, 'PUT', '/v1/admin/content/academy/new-one', owner, { ...page, version: 1, published: true })).status, 200);
    const served = (await pub()).find((p) => p.slug === 'new-one')!;
    assert.equal(served.body, '## Hi\n\n<script>alert(1)</script>', 'stored and served as the text written');
    assert.equal((await t.call('GET', '/v1/content/academy')).headers.get('content-type')?.startsWith('application/json'), true);

    assert.equal((await aCall(t, 'DELETE', '/v1/admin/content/academy/new-one?version=1', owner)).status, 409);
    assert.equal((await aCall(t, 'DELETE', '/v1/admin/content/academy/new-one?version=2', owner)).status, 200);
    assert.equal((await aCall(t, 'DELETE', '/v1/admin/content/academy/new-one?version=2', owner)).status, 404);
    const rows = (await auditRows(t)).filter((r) => r.area === 'content');
    assert.deepEqual(rows.map((r) => r.action), ['create', 'save', 'delete']);
  } finally { await t.close(); }
});
