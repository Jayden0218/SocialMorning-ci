// Tests Admin › Redeem codes (M24 US15): list, make codes, switch one off; the helpers' words.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Redeem, grantText, grouped, stateText, type RedeemCode } from '../src/pages/admin/Redeem';
import { ADMIN_SECTIONS } from '../src/pages/admin/AdminLayout';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const FEED = 'https://socialmorning-api.vercel.app/feeds/paid.xml';
const CODE: RedeemCode = {
  code: 'ABCDEFGHJKMN', kind: 'plus', days: 30, feedUrl: null, showTitle: null, uses: 1, maxUses: 5,
  note: 'launch', createdAt: '2026-10-08T10:00:00Z', expiresAt: null, disabled: false,
};

describe('helpers', () => {
  it('groups a code in fours, says what it gives and its state', () => {
    expect(grouped('ABCDEFGHJKMN')).toBe('ABCD-EFGH-JKMN');
    expect(grantText(CODE)).toBe('PLUS, 30 days');
    expect(grantText({ kind: 'plus', days: 1, showTitle: null, feedUrl: null })).toBe('PLUS, 1 day');
    expect(grantText({ kind: 'show', days: null, showTitle: 'Deep Talk', feedUrl: FEED })).toBe('Series: Deep Talk');
    expect(stateText(CODE)).toBe('Open');
    expect(stateText({ ...CODE, disabled: true })).toBe('Off');
    expect(stateText({ ...CODE, uses: 5 })).toBe('Used up');
    expect(stateText({ ...CODE, expiresAt: '2020-01-01T00:00:00Z' })).toBe('Expired');
  });

  it('Admin has a Redeem codes section', () => {
    expect(ADMIN_SECTIONS.some((s) => s.path === 'redeem')).toBe(true);
  });
});

describe('Admin › Redeem codes (M24 US15)', () => {
  it('lists codes; making one POSTs the grant and shows the new code; Switch off POSTs disable', async () => {
    let items: RedeemCode[] = [CODE];
    const f = mockApi(() => undefined);
    // The POST to /v1/admin/redeem answers with new codes.
    f.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, '');
      if (path === '/v1/admin/redeem' && init?.method === 'POST') return new Response(JSON.stringify({ codes: ['PQRSTUVWXYZ2'] }), { status: 201, headers: { 'content-type': 'application/json' } });
      if (path === '/v1/admin/redeem') return new Response(JSON.stringify({ items, paidShows: [{ feedUrl: FEED, title: 'Deep Talk' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (path === `/v1/admin/redeem/${CODE.code}/disable`) { items = [{ ...CODE, disabled: true }]; return new Response(JSON.stringify({ disabled: true }), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return new Response(JSON.stringify({ error: 'not_found', message: 'No such route.' }), { status: 404 });
    });
    const { container } = renderIn(<Redeem />);
    expect((await screen.findAllByText('ABCD-EFGH-JKMN')).length).toBeGreaterThan(0);
    expect(screen.getByText('PLUS, 30 days')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);

    fireEvent.change(screen.getByLabelText('Days of PLUS'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'friends' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make code' }));
    expect(await screen.findByText('PQRS-TUVW-XYZ2')).toBeTruthy();
    const post = f.mock.calls.find(([u, o]) => String(u).endsWith('/v1/admin/redeem') && o?.method === 'POST');
    expect(JSON.parse(String(post![1]!.body))).toEqual({ kind: 'plus', days: 7, count: 1, maxUses: 1, note: 'friends' });

    fireEvent.click(screen.getByLabelText(/A paid series/));
    expect((screen.getByLabelText('Series') as HTMLSelectElement).value).toBe(FEED);

    fireEvent.click(screen.getByRole('button', { name: /^Switch off/ }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith(`/v1/admin/redeem/${CODE.code}/disable`) && o?.method === 'POST')).toBe(true));
    expect(await screen.findByText('Off')).toBeTruthy();
  });
});
