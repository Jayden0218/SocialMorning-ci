import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, fireEvent } from '@testing-library/react';
import { Home } from '../src/pages/Home';
import { OVERVIEW, SHOW, mockApi, renderIn, trendOf } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Home (US1)', () => {
  it('shows the totals, the day count and the latest items', async () => {
    mockApi((p) => (p.includes('/overview') ? { status: 200, body: OVERVIEW } : p.includes('/trend') ? { status: 200, body: trendOf(2) } : undefined));
    renderIn(<Home show={SHOW} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Day 11 with Morning Talk' })).toBeTruthy();
    expect(screen.getByText('1,234')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('That bit at 14:32!')).toBeTruthy();
    expect(screen.getAllByText(/at 14:32/).length).toBe(2); // the body, and the moment line
    expect(screen.getByText('900 plays · 7 comments')).toBeTruthy();
  });

  it('an empty show is zeros and a flat chart, never an error (US1 scenario 5)', async () => {
    const zero = { ...OVERVIEW, totals: { plays: 0, completionRate: null, subscribers: 0, comments: 0, likes: 0, clips: 0, saves: 0, shares: 0 }, recentComments: [], recentEpisodes: [] };
    mockApi((p) => (p.includes('/overview') ? { status: 200, body: zero } : p.includes('/trend') ? { status: 200, body: trendOf(0) } : undefined));
    renderIn(<Home show={SHOW} />);
    expect(await screen.findByText('No comments yet')).toBeTruthy();
    expect(screen.getByText('No episodes seen yet')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failing chart does not take the totals with it (Principle IV)', async () => {
    mockApi((p) => (p.includes('/overview') ? { status: 200, body: OVERVIEW } : p.includes('/trend') ? { status: 500, body: { error: 'internal', message: 'Something went wrong on our side.' } } : undefined));
    renderIn(<Home show={SHOW} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('1,234')).toBeTruthy();
  });

  it('switching the measure asks for that measure', async () => {
    const f = mockApi((p) => (p.includes('/overview') ? { status: 200, body: OVERVIEW } : p.includes('/trend') ? { status: 200, body: trendOf(1) } : undefined));
    renderIn(<Home show={SHOW} />);
    await screen.findByText('1,234');
    fireEvent.click(screen.getByRole('tab', { name: 'Comments' }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('metric=comments'))).toBe(true));
    expect(screen.getByRole('tab', { name: 'Comments' }).getAttribute('aria-selected')).toBe('true');
  });
});
