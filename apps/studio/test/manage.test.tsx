import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Announcements } from '../src/pages/Announcements';
import { Polls } from '../src/pages/Polls';
import { Settings } from '../src/pages/Settings';
import { Tips } from '../src/pages/Tips';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);

function api(extra: (p: string, init?: RequestInit) => { status: number; body?: unknown } | undefined = () => undefined) {
  return mockApi((p) => {
    const hit = extra(p);
    if (hit) return hit;
    if (p.includes('/announcements')) return { status: 200, body: { items: [{ id: 'a1', body: 'New season Monday', createdAt: '2026-09-20T00:00:00Z', editedAt: null, pushedAt: '2026-09-20T00:00:00Z' }], pushesLeftThisMonth: 0, resetsOn: '2026-10-01' } };
    if (p.includes('/polls')) return { status: 200, body: { items: [{ id: 'p1', question: 'Next topic?', episodeId: null, endsAt: '2026-10-05T00:00:00Z', closedAt: null, open: true, total: 4, options: [{ idx: 0, label: 'Books', votes: 3 }, { idx: 1, label: 'Films', votes: 1 }] }] } };
    if (p.includes('/episodes')) return { status: 200, body: { total: 0, page: 1, pageSize: 20, items: [] } };
    if (p.includes('/overrides')) return { status: 200, body: { overrides: { title: 'Morning Talk', description: null, coverUrl: null, themeColour: '#fcc522', milestoneMessage: null, hosts: ['Mei'], links: null } } };
    if (p.includes('/tips')) return { status: 200, body: { totalMicrosByCurrency: { MYR: 4_900_000 }, items: [{ at: '2026-09-20T00:00:00Z', amountMicros: 4_900_000, currency: 'MYR', from: null }] } };
    return undefined;
  });
}

describe('Announcements', () => {
  it('with no notifications left this month, publishing is off and the reset date is shown', async () => {
    api();
    renderIn(<Announcements show={SHOW} />);
    expect(await screen.findByText(/No notifications left this month/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    expect((screen.getByRole('button', { name: 'Publish and notify' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('New season Monday')).toBeTruthy();
  });
  it('axe', async () => {
    api();
    const { container } = renderIn(<Layout show={SHOW}><Announcements show={SHOW} /></Layout>);
    await screen.findByText('New season Monday');
    await noViolations(container);
  });
});

describe('Polls', () => {
  it('shows each option\'s share; a new poll posts its question and non-empty options', async () => {
    const f = api();
    renderIn(<Polls show={SHOW} />);
    expect(await screen.findByText('75% · 3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Best snack?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Tea' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add an option' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));
    await vi.waitFor(() => {
      const call = f.mock.calls.find(([u, o]) => String(u).endsWith('/polls') && o?.method === 'POST');
      expect(call).toBeTruthy();
      const body = JSON.parse(String(call![1]!.body)) as { question: string; options: string[] };
      expect([body.question, body.options]).toEqual(['Best snack?', ['Tea', 'Coffee']]);
    });
  });
  it('axe', async () => {
    api();
    const { container } = renderIn(<Layout show={SHOW}><Polls show={SHOW} /></Layout>);
    await screen.findByText('Next topic?');
    await noViolations(container);
  });
});

describe('Settings and Tips', () => {
  it('an operator is told only the owner can change settings', () => {
    api();
    renderIn(<Settings show={{ ...SHOW, role: 'operator' }} />);
    expect(screen.getByText('Only the owner can do this')).toBeTruthy();
  });
  it('the owner sees the saved values; axe', async () => {
    api();
    const { container } = renderIn(<Layout show={SHOW}><Settings show={SHOW} /></Layout>, `/s/${SHOW.key}/settings`);
    await vi.waitFor(() => expect((screen.getByLabelText('Show name') as HTMLInputElement).value).toBe('Morning Talk'));
    await noViolations(container);
  });
  it('tips: total in the currency, anonymous shown as such; axe', async () => {
    api();
    const { container } = renderIn(<Layout show={SHOW}><Tips show={SHOW} /></Layout>);
    expect(await screen.findByText('Anonymous')).toBeTruthy();
    expect(screen.getAllByText(/4\.90/).length).toBeGreaterThan(0);
    await noViolations(container);
  });
});
