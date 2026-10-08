// M25 lane AL: Admin › Lists (pins and hides on every list, hide everywhere), For You (rules, weights, numbers), Inbox, and the split Discover sections.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { fullHidden, fullOrder, SECTION_LABEL } from '../src/pages/admin/Discover';
import { Lists } from '../src/pages/admin/Lists';
import { ForYouAdmin } from '../src/pages/admin/ForYou';
import { Inbox } from '../src/pages/admin/Inbox';
import { ADMIN_SECTIONS } from '../src/pages/admin/AdminLayout';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const calls = (f: ReturnType<typeof mockApi>) => f.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${String(u).replace(/^\/api/, '')}${init?.body ? ` ${String(init.body)}` : ''}`);

const SPLIT = { theirLikes: ['picks', true], pickedShows: ['forYou', true], categories: ['chart', false], premium: ['shows', true], hunt: ['newShows', true] } as const;
const SECTIONS = ['picks', 'theirLikes', 'forYou', 'pickedShows', 'chart', 'categories', 'shows', 'premium', 'video', 'collections', 'said', 'newShows', 'hunt'];

describe('A5: the split Discover sections in Admin', () => {
  it('an old save maps forward: parts after their bundle, hidden with it where they were drawn inside it', () => {
    expect(fullOrder(SECTIONS, ['shows', 'chart'], SPLIT).slice(0, 4)).toEqual(['shows', 'premium', 'chart', 'categories']);
    expect(fullHidden(['shows', 'chart'], ['shows', 'chart'], SPLIT)).toEqual(['shows', 'chart', 'premium']);
    // A save that names the part keeps it as saved.
    expect(fullHidden(['shows'], ['shows', 'premium'], SPLIT)).toEqual(['shows']);
    expect(Object.keys(SECTION_LABEL).sort()).toEqual([...SECTIONS].sort());
    expect(SECTION_LABEL['followedHere']).toBeUndefined();
  });
  it('the admin menu has Lists, For You and Inbox', () => {
    for (const p of ['lists', 'foryou', 'inbox']) expect(ADMIN_SECTIONS.some((s) => s.path === p)).toBe(true);
  });
});

describe('Lists', () => {
  it('shows the list as served and its rows; Hide here POSTs a hide; passes axe', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/lists') return { status: 200, body: { lists: [{ id: 'trending', label: 'Charts › Top', item: 'episode', pins: true, where: 'Discover' }], categories: [{ genreId: 1303, name: 'Comedy', listId: 'category:1303' }] } };
      if (p === '/v1/admin/lists/trending') return { status: 200, body: {
        list: { id: 'trending', label: 'Charts › Top', item: 'episode', pins: true, where: 'Discover' },
        overrides: [{ id: '7', kind: 'pin', feedUrl: 'https://f/a.xml', guid: 'g1', position: 1, startsAt: null, endsAt: null, note: 'launch week', createdAt: new Date().toISOString(), live: true }],
        live: [{ feedUrl: 'https://f/a.xml', guid: 'g1', title: 'Pinned one', sub: 'Show A', pinned: true }, { feedUrl: 'https://f/b.xml', guid: 'g2', title: 'Second', sub: 'Show B', pinned: false }],
      } };
      if (p === '/v1/admin/hidden') return { status: 200, body: { shows: [{ feedUrl: 'https://f/h.xml', title: 'Hidden show', reason: 'Spam', hiddenAt: new Date().toISOString(), byReport: false }], episodes: [] } };
      if (p.startsWith('/v1/admin/lists/trending')) return { status: 200, body: { override: {} } };
      return undefined;
    });
    const { container } = renderIn(<Lists />);
    const hideHere = await screen.findByRole('button', { name: 'Hide here Second' });
    expect(screen.getByText('launch week')).toBeTruthy();
    expect(screen.getByText(/Spam/)).toBeTruthy();
    fireEvent.click(hideHere);
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/lists/trending {"kind":"hide","feedUrl":"https://f/b.xml","guid":"g2"}'));
    await noViolations(container);
  });

  it('Hide everywhere asks for the reason in place, then POSTs it', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/lists') return { status: 200, body: { lists: [{ id: 'trending', label: 'Charts › Top', item: 'episode', pins: true, where: 'Discover' }], categories: [] } };
      if (p === '/v1/admin/lists/trending') return { status: 200, body: { list: { id: 'trending', label: 'Charts › Top', item: 'episode', pins: true, where: 'Discover' }, overrides: [], live: [{ feedUrl: 'https://f/b.xml', guid: 'g2', title: 'Second', sub: 'Show B', pinned: false }] } };
      if (p === '/v1/admin/hidden') return { status: 200, body: { shows: [], episodes: [] } };
      if (p === '/v1/admin/hidden/episode') return { status: 200, body: { shows: [], episodes: [] } };
      return undefined;
    });
    renderIn(<Lists />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hide episode everywhere Second' }));
    fireEvent.change(screen.getByLabelText('Why hide Second'), { target: { value: 'Wrong audio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/hidden/episode {"feedUrl":"https://f/b.xml","guid":"g2","reason":"Wrong audio"}'));
  });
});

describe('For You', () => {
  it('shows rules, weights inside their ranges and the CTR per channel; saving PUTs the weights with the version', async () => {
    const defaults = { affinity: 1, social: 0.4, freshness: 0.8, quality: 0.3, fatigue: 0.25 };
    const bounds = { affinity: [0, 3], social: [0, 3], freshness: [0, 3], quality: [0, 3], fatigue: [0, 2] };
    const f = mockApi((p) => {
      if (p === '/v1/admin/foryou') return { status: 200, body: { rules: [{ feedUrl: 'https://f/a.xml', rule: 'never', note: null, createdAt: new Date().toISOString(), title: 'Show A' }], weights: defaults, version: 3, saved: true, defaults, bounds, boost: 0.5, bury: 0.5 } };
      if (p === '/v1/admin/recs') return { status: 200, body: { days: 7, channels: [{ channel: 'pick', shown: 10, opened: 4, played: 2, finished: 1 }], similarityAge: 5, similarityStale: false } };
      if (p === '/v1/admin/foryou/weights') return { status: 200, body: {} };
      return undefined;
    });
    const { container } = renderIn(<ForYouAdmin />);
    expect(await screen.findByText('Never recommend')).toBeTruthy();
    expect(await screen.findByText('40%')).toBeTruthy();
    const quality = screen.getByLabelText(/Talked about here/);
    fireEvent.change(quality, { target: { value: '9' } });
    expect((screen.getByRole('button', { name: 'Save weights' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(quality, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save weights' }));
    await waitFor(() => expect(calls(f).some((c) => c.startsWith('PUT /v1/admin/foryou/weights {"version":3,"weights":{') && c.includes('"quality":1.5'))).toBe(true));
    await noViolations(container);
  });
});

describe('Inbox', () => {
  it('lists feedback with its pictures and the search requests', async () => {
    mockApi((p) => {
      if (p === '/v1/admin/feedback') return { status: 200, body: { items: [{ id: 'f1', kind: 'Bug', body: 'The play button jumps', appVersion: '1.2.3', createdAt: new Date().toISOString(), displayName: null, images: 1 }] } };
      if (p === '/v1/admin/search-requests') return { status: 200, body: { items: [{ q: 'tiny desk', n: 3, last: new Date().toISOString() }] } };
      return undefined;
    });
    const { container } = renderIn(<Inbox />);
    expect(await screen.findByText('The play button jumps')).toBeTruthy();
    expect(await screen.findByText('tiny desk')).toBeTruthy();
    expect(screen.getByAltText('Picture 1 with this feedback').getAttribute('src')).toBe('/api/v1/admin/feedback/f1/1');
    await noViolations(container);
  });
});
