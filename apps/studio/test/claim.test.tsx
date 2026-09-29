import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { NoShow } from '../src/pages/NoShow';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const CLAIM = { id: 'c1', feedUrl: 'https://feeds.example.com/mine.xml', code: 'socialnet-verify-0123456789ab', status: 'pending' };

it('claims a feed on the web: address → code → verify → the show opens', async () => {
  let proven = false;
  const f = mockApi((p) => {
    if (p === '/v1/studio/claims') return { status: 200, body: { claims: [] } };
    if (p.endsWith('/verify')) return proven
      ? { status: 200, body: { status: 'proven', shows: [{ key: 'k1', feedUrl: CLAIM.feedUrl, title: 'Mine', image: null, role: 'owner' }] } }
      : { status: 200, body: { status: 'pending', shows: [] } };
    return undefined;
  });
  f.mockImplementationOnce(async () => new Response(JSON.stringify({ claims: [] }), { status: 200 }));
  f.mockImplementationOnce(async () => new Response(JSON.stringify({ claim: CLAIM }), { status: 201 }));
  renderIn(<NoShow />, '/no-show');
  fireEvent.change(screen.getByLabelText(/RSS feed address/), { target: { value: CLAIM.feedUrl } });
  fireEvent.click(screen.getByRole('button', { name: 'Get my code' }));
  expect(await screen.findByText(CLAIM.code)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByText(/not in your feed yet/)).toBeTruthy();

  proven = true;
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await vi.waitFor(() => expect(f.mock.calls.filter(([u]) => String(u).endsWith('/verify')).length).toBe(2));
});
