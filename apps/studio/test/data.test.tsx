import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Data } from '../src/pages/Data';
import { Comments } from '../src/pages/Comments';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn, trendOf } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const EPS = { total: 2, page: 1, pageSize: 20, items: [
  { id: 'e1', title: 'One', publishedAt: '2026-09-20T00:00:00Z', plays: 5, completionRate: 0.5, comments: 2, shares: 1, saves: 0, likes: 3 },
  { id: 'e2', title: 'Two', publishedAt: '2026-09-25T00:00:00Z', plays: 9, completionRate: null, comments: 0, shares: 0, saves: 1, likes: 0 },
] };

function dataApi(also: unknown = { hidden: 'too_few' }) {
  return mockApi((p) => {
    if (p.includes('/yesterday')) return { status: 200, body: { plays: 4, subs: 1, comments: 2, shares: 0 } };
    if (p.includes('/trend')) return { status: 200, body: trendOf(1) };
    if (p.includes('/top-episodes')) return { status: 200, body: { items: [{ id: 'e2', title: 'Two', plays: 9 }, { id: 'e1', title: 'One', plays: 5 }] } };
    if (p.includes('/also-follow')) return { status: 200, body: also };
    if (p.includes('/episodes')) return { status: 200, body: EPS };
    if (p.includes('/comments')) return { status: 200, body: { items: [
      { id: 'c1', episodeId: 'e1', episodeTitle: 'One', author: { id: 'u', displayName: 'Mei' }, body: 'Loved it', state: 'visible', offsetMs: 60000, createdAt: '2026-09-28T00:00:00Z', parentId: null, replies: 0 },
      { id: 'c2', episodeId: 'e1', episodeTitle: 'One', author: { id: 'v', displayName: 'Bo' }, body: 'spam', state: 'host_hidden', offsetMs: null, createdAt: '2026-09-27T00:00:00Z', parentId: null, replies: 0 },
    ] } };
    return undefined;
  });
}

describe('Data (US2)', () => {
  it('shows yesterday, the too-few state, and the table', async () => {
    dataApi();
    renderIn(<Data show={SHOW} />);
    expect(await screen.findByText('Not enough listeners yet')).toBeTruthy();
    expect(screen.getByText('New plays yesterday')).toBeTruthy();
    expect((await screen.findAllByText('Two')).length).toBeGreaterThan(0);
  });

  it('the range select re-asks for the trend; a header click flips the sort', async () => {
    const f = dataApi();
    renderIn(<Data show={SHOW} />);
    await screen.findAllByText('Two');
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: '90' } });
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('days=90'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /^Plays/ }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /sort=plays&dir=desc/.test(String(u)))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /^Plays/ }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => /sort=plays&dir=asc/.test(String(u)))).toBe(true));
  });

  it('axe: Data in the layout has no violations', async () => {
    dataApi({ shows: [{ feedUrl: 'https://x', title: 'Other', image: null, listeners: 5 }] });
    const { container } = renderIn(<Layout show={SHOW}><Data show={SHOW} /></Layout>);
    await screen.findByText('Other');
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('Comments (US3)', () => {
  it('lists comments with their state; Hide asks first, then posts', async () => {
    const f = dataApi();
    renderIn(<Comments show={SHOW} />);
    expect(await screen.findByText('Loved it')).toBeTruthy();
    expect(screen.getByText('Hidden by you')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.getByRole('dialog', { name: 'Hide this comment?' })).toBeTruthy();
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/hide'))).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide' }).at(-1)!);
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith('/comments/c1/hide') && (o as RequestInit | undefined)?.method === 'POST')).toBe(true));
  });

  it('a reply posts to the reply route with the Studio header', async () => {
    const f = dataApi();
    renderIn(<Comments show={SHOW} />);
    await screen.findByText('Loved it');
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[0]!);
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Thank you!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => {
      const call = f.mock.calls.find(([u]) => String(u).endsWith('/comments/c1/reply'));
      expect(call).toBeTruthy();
      const init = call![1]!;
      expect((init.headers as Record<string, string>)['x-studio']).toBe('1');
      expect(JSON.parse(String(init.body))).toEqual({ body: 'Thank you!' });
    });
  });

  it('axe: Comments has no violations', async () => {
    dataApi();
    const { container } = renderIn(<Layout show={SHOW}><Comments show={SHOW} /></Layout>);
    await screen.findByText('Loved it');
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
