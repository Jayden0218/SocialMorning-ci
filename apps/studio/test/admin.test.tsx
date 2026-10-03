// Tests the Admin link shows only for admins, sign-in-again, and Admin pages.
/**
 * M15 — Admin in the Studio (specs/015-m15-admin): the Admin link is drawn only for an admin
 * (display only — the server decides, guard G-A1 in apps/api); a `reauth` answer sends the owner
 * to sign in again (T010); the pages have no axe violations (contrast is measured from the tokens).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { api, HttpError, whenReauth } from '../src/api';
import { SessionProvider } from '../src/session';
import { Sidebar } from '../src/shell/Sidebar';
import { AdminLayout } from '../src/pages/admin/AdminLayout';
import { Activity, changedKeys } from '../src/pages/admin/Activity';
import { parseList } from '../src/pages/admin/Accounts';
import { fullOrder } from '../src/pages/admin/Discover';
import { SHOW, mockApi } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); whenReauth(null); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const ME = { id: 'u1', email: 'o@example.com', displayName: 'Owner' };

function Where() { return <span data-testid="where">{useLocation().pathname + useLocation().search}</span>; }

describe('the Admin link', () => {
  it('is drawn for an admin and not for anyone else', () => {
    const { unmount } = render(<MemoryRouter><SessionProvider initial={{ state: 'in', me: ME, shows: [SHOW], isAdmin: true }}><Sidebar show={SHOW} open={false} onNavigate={() => {}} /></SessionProvider></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Admin' })).toBeTruthy();
    unmount();
    render(<MemoryRouter><SessionProvider initial={{ state: 'in', me: ME, shows: [SHOW], isAdmin: false }}><Sidebar show={SHOW} open={false} onNavigate={() => {}} /></SessionProvider></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
  });

  it('a non-admin who types /admin sees a refusal, not the pages', async () => {
    mockApi(() => undefined);
    render(
      <MemoryRouter initialEntries={['/admin/activity']}>
        <SessionProvider initial={{ state: 'in', me: ME, shows: [SHOW], isAdmin: false }}>
          <Routes><Route path="/admin" element={<AdminLayout />}><Route path="activity" element={<Activity />} /></Route></Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin is for the owner only')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Activity' })).toBeNull();
  });
});

describe('T010: reauth', () => {
  it('a 401 reauth from an admin call goes to /sign-in?reason=reauth&next=<the page>', async () => {
    mockApi((p) => (p.startsWith('/v1/admin/audit') ? { status: 401, body: { error: 'reauth', message: 'Sign in again to use Admin.' } } : undefined));
    render(
      <MemoryRouter initialEntries={['/admin/activity']}>
        <SessionProvider initial={{ state: 'in', me: ME, shows: [SHOW], isAdmin: true }}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}><Route path="activity" element={<Activity />} /></Route>
            <Route path="/sign-in" element={<Where />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
    expect((await screen.findByTestId('where')).textContent).toBe('/sign-in?reason=reauth&next=%2Fadmin%2Factivity');
  });

  it('the error still reaches the caller', async () => {
    mockApi(() => ({ status: 401, body: { error: 'reauth', message: 'Sign in again to use Admin.' } }));
    const seen = vi.fn();
    whenReauth(seen);
    await expect(api('/v1/admin/audit')).rejects.toBeInstanceOf(HttpError);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('Activity', () => {
  it('lists changes newest first with what changed, by area, and passes axe', async () => {
    const f = mockApi((p) => (p.startsWith('/v1/admin/audit') ? { status: 200, body: { items: [
      { id: '2', at: new Date().toISOString(), adminName: 'Owner', actingAs: 'a1', actingAsName: 'Cai', area: 'accounts', action: 'studio POST', target: '/v1/studio/hosted-shows', before: null, after: { status: 201 }, device: null },
      { id: '1', at: new Date().toISOString(), adminName: 'Owner', actingAs: null, actingAsName: null, area: 'picks', action: 'save', target: '2026-10-02', before: null, after: { version: 1 }, device: 'Firefox' },
    ], next: '1' } } : undefined));
    const { container } = render(<MemoryRouter><SessionProvider initial={{ state: 'in', me: ME, shows: [], isAdmin: true }}><Activity /></SessionProvider></MemoryRouter>);
    await screen.findByText('2026-10-02');
    expect(screen.getByText('as Cai')).toBeTruthy();
    await noViolations(container);
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: 'picks' } });
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).endsWith('/v1/admin/audit?area=picks'))).toBe(true));
  });

  it('the diff names only the fields that changed', () => {
    expect(changedKeys({ a: 1, b: [1], c: 'x' }, { a: 1, b: [2], d: true })).toEqual(['b', 'c', 'd']);
    expect(changedKeys(null, { v: 1 })).toEqual(['v']);
  });
});

describe('helpers', () => {
  it('a pasted list is one account per line: Name | bio | email', () => {
    expect(parseList('Mei | Shares good shows\n\nArif | | arif@example.com\nSolo')).toEqual([
      { displayName: 'Mei', bio: 'Shares good shows' },
      { displayName: 'Arif', email: 'arif@example.com' },
      { displayName: 'Solo' },
    ]);
  });
  it('the section order keeps a saved order and adds what it did not name', () => {
    expect(fullOrder(['forYou', 'picks', 'chart'], ['chart', 'gone'])).toEqual(['chart', 'forYou', 'picks']);
  });
});
