/**
 * M18 — the admin Dashboard draws what the server counted: the headline row, eight sections, and
 * a failed section as "could not load" + Retry while the other seven still show (FR-017).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { Dashboard, type Metrics } from '../src/pages/admin/Dashboard';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const days = (values: number[]) => values.map((value, i) => ({ date: `2026-10-0${i + 1}`, value }));
const FIXTURE: Metrics = {
  days: 7, from: '2026-09-27', to: '2026-10-03', countedAt: '2026-10-03T06:32:00.000Z', partial: false,
  sections: {
    users: { ok: true, total: 12, suspended: 1, active: { d1: 3, d7: 5, d30: 9 }, newPerDay: days([1, 0, 2]), dauPerDay: days([2, 4, 6]), recordedSince: '2026-10-01' },
    listening: { ok: true, listenersPerDay: days([1, 2, 5]), hoursPerDay: days([0.5, 1, 2]), finished: 7, topShows: [{ feedUrl: 'f1', title: 'Show One', hours: 2 }], topEpisodes: [{ episodeId: 'e1', title: 'Ep One', showTitle: 'Show One', hours: 1.5 }] },
    library: { ok: true, addedPerDay: days([1, 1]), removedPerDay: days([0, 1]), topShows: [{ feedUrl: 'f1', title: 'Show One', subscribers: 4 }] },
    social: { ok: true, commentsPerDay: days([4, 0, 3]), reactionsPerDay: days([1]), clipsPerDay: days([1]), followsPerDay: days([1]), sharesPerDay: days([1]), voicePostsLive: 2 },
    recs: { ok: true, byChannel: [{ channel: 'pick', shown: 40, played: 6 }] },
    safety: { ok: true, openReports: 1, reports: 3, actions: 2, blocks: 1 },
    money: { ok: true, activePurchases: 1, purchases: 1, tips: 1, amounts: [{ currency: 'MYR', micros: 4_900_000 }] },
    creators: { ok: true, claimedShows: 1, hostedShows: 1, hostedEpisodes: 3, teamMembers: 2 },
  },
};

describe('Dashboard', () => {
  it('shows the headline numbers and every section, and passes axe', async () => {
    const f = mockApi((p) => (p.startsWith('/v1/admin/metrics') ? { status: 200, body: FIXTURE } : undefined));
    renderIn(<Dashboard />, '/admin/dashboard');
    const head = await screen.findByRole('region', { name: 'Headline' });
    expect(within(head).getByText('12')).toBeTruthy(); // accounts
    expect(within(head).getByText('3')).toBeTruthy(); // new in 7 days: 1 + 0 + 2
    expect(within(head).getByText('6')).toBeTruthy(); // used the app today: the last day
    expect(within(head).getByText('3.5 h')).toBeTruthy(); // hours: 0.5 + 1 + 2
    expect(within(head).getByText('7')).toBeTruthy(); // comments: 4 + 0 + 3
    for (const h of ['Users', 'Listening', 'Library', 'Social', 'For You', 'Safety', 'Money', 'Creators']) {
      expect(screen.getByRole('heading', { name: h })).toBeTruthy();
    }
    expect(screen.getByText('15%')).toBeTruthy(); // picks: 6 of 40
    expect(screen.getByText('MYR 4.90')).toBeTruthy();
    expect(screen.getByText(/App use is recorded from 2026-10-01/)).toBeTruthy();
    expect(f.mock.calls.map((c) => String(c[0]))).toContain('/api/v1/admin/metrics?days=30');
    await noViolations(document.body);
  });

  it('a failed section says so with Try again; the others still show', async () => {
    const body = { ...FIXTURE, partial: true, sections: { ...FIXTURE.sections, money: { ok: false, message: 'The money numbers could not be counted.' } } };
    const f = mockApi((p) => (p.startsWith('/v1/admin/metrics') ? { status: 200, body } : undefined));
    renderIn(<Dashboard />, '/admin/dashboard');
    expect(await screen.findByText('The money numbers could not be counted.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Creators' })).toBeTruthy();
    expect(screen.getByText('Shows hosted here')).toBeTruthy();
    const before = f.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(before));
  });

  it('the range switch asks for 90 days', async () => {
    const f = mockApi((p) => (p.startsWith('/v1/admin/metrics') ? { status: 200, body: FIXTURE } : undefined));
    renderIn(<Dashboard />, '/admin/dashboard');
    await screen.findByRole('region', { name: 'Headline' });
    fireEvent.change(screen.getByLabelText('Range'), { target: { value: '90' } });
    await vi.waitFor(() => expect(f.mock.calls.map((c) => String(c[0]))).toContain('/api/v1/admin/metrics?days=90'));
  });
});

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
