// Tests the Host picks star and card on the Episodes page: add, reorder, remove, save; axe.
/**
 * M21 US5 T066 (FR-042): on the Episodes page a host stars episodes as Host picks and orders
 * them; every change PUTs the whole list. If the picks cannot be read, nothing extra shows.
 *
 * The break that turns it red: in `src/pages/Episodes.tsx` `useHostPicks.toggle`, append the new
 * pick without saving (no PUT goes out).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { Episodes } from '../src/pages/Episodes';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const row = (id: string, title: string) => ({ id, title, publishedAt: null, plays: 1, completionRate: null, comments: 0, shares: 0, saves: 0, likes: 0 });
const EPS = { total: 2, page: 1, pageSize: 20, items: [row('e1', 'One'), row('e2', 'Two')] };
const putsOf = (f: ReturnType<typeof mockApi>) =>
  f.mock.calls.filter(([u, i]) => String(u).endsWith('/host-picks') && i?.method === 'PUT').map(([, i]) => JSON.parse(String(i!.body)) as { episodeIds: string[] });

describe('M21 Host picks', () => {
  it('star an episode, move it, remove it — each change saved; axe', async () => {
    let saved: { id: string; title: string }[] = [{ id: 'e2', title: 'Two' }];
    const f = mockApi((p) => {
      if (p.endsWith('/host-picks')) return { status: 200, body: { items: saved } };
      if (p.includes('/episodes')) return { status: 200, body: EPS };
      return undefined;
    });
    const { container } = renderIn(<Layout show={SHOW}><Episodes show={SHOW} /></Layout>);
    const card = await screen.findByRole('region', { name: 'Host picks' });
    expect(within(card).getByText('Two')).toBeTruthy();
    await screen.findByText('One');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);

    saved = [{ id: 'e2', title: 'Two' }, { id: 'e1', title: 'One' }];
    fireEvent.click(screen.getByRole('button', { name: 'Add One to host picks' }));
    await vi.waitFor(() => expect(putsOf(f).at(-1)).toEqual({ episodeIds: ['e2', 'e1'] }));

    saved = [{ id: 'e1', title: 'One' }, { id: 'e2', title: 'Two' }];
    fireEvent.click(await within(card).findByRole('button', { name: 'Move One up' }));
    await vi.waitFor(() => expect(putsOf(f).at(-1)).toEqual({ episodeIds: ['e1', 'e2'] }));

    saved = [{ id: 'e1', title: 'One' }];
    fireEvent.click(await within(card).findByRole('button', { name: 'Remove Two from host picks' }));
    await vi.waitFor(() => expect(putsOf(f).at(-1)).toEqual({ episodeIds: ['e1'] }));
  });

  it('picks that cannot be read: no star column and no card', async () => {
    mockApi((p) => (p.includes('/episodes') && !p.endsWith('/host-picks') ? { status: 200, body: EPS } : undefined));
    renderIn(<Layout show={SHOW}><Episodes show={SHOW} /></Layout>);
    await screen.findByText('One');
    expect(screen.queryByRole('region', { name: 'Host picks' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add One to host picks' })).toBeNull();
  });
});
