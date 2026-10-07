// M24 lane A1: the Admin pages for blocked words, maintenance, notices, appeals, deletions and user detail.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { Safety, localToIso, splitWords } from '../src/pages/admin/Safety';
import { Notices, isAppRoute } from '../src/pages/admin/Notices';
import { Appeals, Deletions } from '../src/pages/admin/Appeals';
import { chatContext } from '../src/pages/admin/Reports';
import { money, UserDetail } from '../src/pages/admin/Users';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const calls = (f: ReturnType<typeof mockApi>) => f.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${String(u).replace(/^\/api/, '')}${init?.body ? ` ${String(init.body)}` : ''}`);

describe('pure helpers', () => {
  it('splitWords, localToIso, isAppRoute, chatContext, money', () => {
    expect(splitWords(' a, b\n\n坏词，c ')).toEqual(['a', 'b', '坏词', 'c']);
    expect(localToIso('')).toBeNull();
    expect(localToIso('nonsense')).toBeNull();
    expect(localToIso('2026-10-08T10:00')).toBe(new Date('2026-10-08T10:00').toISOString());
    expect(isAppRoute('/inbox')).toBe(true);
    expect(isAppRoute('//evil.example')).toBe(false);
    expect(isAppRoute('https://evil.example')).toBe(false);
    expect(isAppRoute('/a b')).toBe(false);
    expect(chatContext({ context: [{ from: 'A', body: 'hi' }, { nope: 1 }, null] })).toEqual([{ from: 'A', body: 'hi' }]);
    expect(chatContext(null)).toEqual([]);
    expect(money(4_990_000, 'USD')).toBe('4.99 USD');
    expect(money(null, null)).toBe('—');
  });
});

describe('Safety', () => {
  it('lists blocked words, adds the words in the box, shows maintenance off, and passes axe', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/words') return { status: 200, body: { items: [{ word: 'badword', addedBy: 'Owner', addedAt: new Date().toISOString() }] } };
      if (p === '/v1/admin/maintenance') return { status: 200, body: { stored: null, active: null } };
      return undefined;
    });
    const { container } = renderIn(<Safety />);
    expect(await screen.findByText('badword')).toBeTruthy();
    expect(await screen.findByText('The app works as usual.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Words to block, one per line or comma'), { target: { value: 'one, two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Block' }));
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/words {"words":["one","two"]}'));
    await noViolations(container);
  });

  it('maintenance on: shows the end time and message; Turn off asks first, then PUTs on:false', async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const f = mockApi((p) => {
      if (p === '/v1/admin/words') return { status: 200, body: { items: [] } };
      if (p === '/v1/admin/maintenance') return { status: 200, body: { stored: { until, message: 'Back soon.' }, active: { until, message: 'Back soon.' } } };
      return undefined;
    });
    renderIn(<Safety />);
    expect(await screen.findByText(/Back soon\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Turn off' }).at(-1)!);
    await waitFor(() => expect(calls(f)).toContain('PUT /v1/admin/maintenance {"on":false}'));
  });
});

describe('Notices', () => {
  it('a button needs an app path; Send asks, then posts the notice with push', async () => {
    const f = mockApi((p) => (p === '/v1/admin/notices' ? { status: 200, body: { items: [] } } : undefined));
    const { container } = renderIn(<Notices />);
    await screen.findByText('No notices yet');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'News' } });
    fireEvent.change(screen.getByLabelText('Button label (optional)'), { target: { value: 'Open' } });
    fireEvent.change(screen.getByLabelText('Button opens (an app path, e.g. /inbox)'), { target: { value: 'https://x' } });
    expect((screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Button opens (an app path, e.g. /inbox)'), { target: { value: '/inbox' } });
    fireEvent.click(screen.getByLabelText(/Also send a push/));
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' }).at(-1)!);
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/notices {"title":"Hello","body":"News","push":true,"link":{"label":"Open","route":"/inbox"}}'));
  });
});

describe('Appeals and Deletions', () => {
  const appeal = {
    id: 'ap1', state: 'open', text: 'Please look again', createdAt: new Date().toISOString(), decidedAt: null,
    listener: { id: 'l1', displayName: 'Mei', email: 'mei@example.com', suspended: true },
    action: { id: 'a1', action: 'suspend', targetKind: 'profile', targetId: 'l1', at: new Date().toISOString() }, what: 'Your account was suspended',
  };
  it('lists an open appeal; Accept asks, then posts accept', async () => {
    const f = mockApi((p) => (p.startsWith('/v1/admin/appeals?') ? { status: 200, body: { items: [appeal] } } : p === '/v1/admin/appeals/ap1/accept' ? { status: 200, body: {} } : undefined));
    const { container } = renderIn(<Appeals />);
    expect(await screen.findByText('Please look again')).toBeTruthy();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: /^Accept/ }));
    expect(screen.getByText('The account works again at once.')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^Accept/ }).at(-1)!);
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/appeals/ap1/accept'));
  });

  it('the deletion queue shows each account and its date', async () => {
    mockApi((p) => (p === '/v1/admin/deletions' ? { status: 200, body: { items: [{ listenerId: 'l1', displayName: 'Leaving', email: 'l@example.com', requestedAt: new Date().toISOString(), dueAt: new Date().toISOString() }] } } : undefined));
    renderIn(<Deletions />);
    expect(await screen.findByText('Leaving')).toBeTruthy();
  });
});

describe('UserDetail', () => {
  it('shows PLUS, purchases and reports; Give PLUS asks, then posts the days', async () => {
    const detail = {
      user: { id: 'u9', displayName: 'Mei', email: 'm@example.com', createdAt: new Date().toISOString(), suspended: false, madeByAdmin: false },
      avatarUrl: null, bio: 'hi', sessions: 2, plus: { active: false, until: null, byAdmin: false },
      purchases: [{ id: 'p1', productId: 'plus_month', store: 'google', status: 'active', amountMicros: 4_990_000, currency: 'USD', createdAt: new Date().toISOString() }],
      tips: [], gifts: [], reportsAgainst: [{ id: 'r1', targetKind: 'comment', reason: 'spam', createdAt: new Date().toISOString(), closeReason: null }], deletion: null,
    };
    const f = mockApi((p) => (p.startsWith('/v1/admin/users/u9') ? { status: 200, body: detail } : undefined));
    renderIn(<UserDetail id="u9" />);
    expect(await screen.findByText(/plus_month/)).toBeTruthy();
    expect(screen.getByText('2 signed-in devices')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Give PLUS' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Give PLUS' }).at(-1)!);
    await waitFor(() => expect(calls(f)).toContain('POST /v1/admin/users/u9/plus {"days":30}'));
  });
});
