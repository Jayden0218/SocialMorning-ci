import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import type { Show } from '../src/api';
import { SessionProvider } from '../src/session';

export const SHOW: Show = { key: 'abc123', feedUrl: 'https://feeds.example.com/f.xml', title: 'Morning Talk', image: null, role: 'owner' };

type Route = (path: string) => { status: number; body?: unknown } | undefined;

/** Answers `fetch('/api/…')` from a table; anything unmatched is a 404, so a missing fixture shows. */
export function mockApi(route: Route) {
  const f = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input).replace(/^\/api/, '');
    const r = route(path) ?? { status: 404, body: { error: 'not_found', message: 'No such route.' } };
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

export function renderIn(ui: ReactNode, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider initial={{ state: 'in', me: { id: 'u1', email: 'o@example.com', displayName: 'Owner' }, shows: [SHOW] }}>{ui}</SessionProvider>
    </MemoryRouter>,
  );
}

export const OVERVIEW = {
  claimedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  totals: { plays: 1234, completionRate: 0.667, subscribers: 56, comments: 7, likes: 3, clips: 1, saves: 2, shares: 4 },
  recentComments: [{ id: 'c1', episodeTitle: 'Episode one', author: 'Mei', body: 'That bit at 14:32!', offsetMs: 872_000, createdAt: new Date().toISOString() }],
  recentEpisodes: [{ id: 'e1', title: 'Episode one', publishedAt: new Date().toISOString(), plays: 900, comments: 7 }],
};

export const trendOf = (value = 0) => ({ days: Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10), value })) });
