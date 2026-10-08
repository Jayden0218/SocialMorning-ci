// Tests the M24 Studio additions: comment settings, Pending, like and report, Earnings, feed sync, polls, subscriber search, hidden episodes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { CommentList, Comments, type StudioComment } from '../src/pages/Comments';
import { Earnings, type EarningsData } from '../src/pages/Earnings';
import { Episodes } from '../src/pages/Episodes';
import { Polls } from '../src/pages/Polls';
import { Settings } from '../src/pages/Settings';
import { Subscribers } from '../src/pages/Subscribers';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BASE = `/v1/studio/shows/${SHOW.key}`;
const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const callsTo = (f: ReturnType<typeof mockApi>, end: string, method: string) =>
  f.mock.calls.filter(([u, i]) => String(u).endsWith(end) && (i?.method ?? 'GET') === method);
const bodyOf = (f: ReturnType<typeof mockApi>, end: string, method: string) => {
  const call = callsTo(f, end, method).at(-1);
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
};

const COMMENT: StudioComment = {
  id: '44444444-4444-4444-4444-444444444444', episodeId: 'e1', episodeTitle: 'Episode one', author: { id: 'l1', displayName: 'Mei' },
  body: 'Great one', state: 'visible', offsetMs: null, createdAt: '2026-10-05T10:00:00Z', parentId: null, replies: 0,
};
const EPS = { total: 1, page: 1, pageSize: 20, items: [{ id: 'e1', title: 'Episode one', publishedAt: '2026-10-01T00:00:00Z', plays: 3, completionRate: null, comments: 1, shares: 0, saves: 0, likes: 0 }] };

describe('Comments › Comment settings (M24 US8)', () => {
  it('choosing Review first saves at once with a PUT of the mode; axe', async () => {
    let policyCalls = 0;
    const f = mockApi((p) => {
      if (p.endsWith('/comment-policy')) return { status: 200, body: { show: policyCalls++ === 0 ? 'open' : 'review', episodes: [] } };
      if (p.startsWith(`${BASE}/comments?`)) return { status: 200, body: { items: [COMMENT] } };
      if (p.includes('/episodes')) return { status: 200, body: EPS };
      return undefined;
    });
    const { container } = renderIn(<Layout show={SHOW}><Comments show={SHOW} /></Layout>, `/s/${SHOW.key}/comments`);
    const open = await screen.findByRole('radio', { name: /^Open/ });
    expect((open as HTMLInputElement).checked).toBe(true);
    await screen.findByText('Great one');
    await noViolations(container);
    fireEvent.click(screen.getByRole('radio', { name: /^Review first/ }));
    await vi.waitFor(() => expect(bodyOf(f, '/comment-policy', 'PUT')).toEqual({ mode: 'review' }));
    expect(await screen.findByText('Saved: comments are review first.')).toBeTruthy();
    expect((screen.getByRole('radio', { name: /^Review first/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('Comments › Pending (M24 US8)', () => {
  const held = (id: string, name: string, body: string) => ({ id, episodeId: 'e1', episodeTitle: 'Episode one', author: { id: `a-${id}`, displayName: name }, body, offsetMs: 5000, parentId: null, createdAt: '2026-10-07T10:00:00Z' });
  it('Approve posts to the approve route and the row goes; Reject asks first, then posts reject', async () => {
    const f = mockApi((p) => {
      if (p.endsWith('/comments/pending/p1/approve')) return { status: 200, body: { commentId: 'c9' } };
      if (p.endsWith('/comments/pending/p2/reject')) return { status: 204 };
      if (p.endsWith('/comments/pending')) return { status: 200, body: { items: [held('p1', 'Mei', 'Hold me'), held('p2', 'Bo', 'Spam here')] } };
      return undefined;
    });
    const { container } = renderIn(<Layout show={SHOW}><Comments show={SHOW} /></Layout>, `/s/${SHOW.key}/comments/pending`);
    expect(await screen.findByText('Hold me')).toBeTruthy();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: /^Approve the comment by Mei/ }));
    await vi.waitFor(() => expect(callsTo(f, '/comments/pending/p1/approve', 'POST')).toHaveLength(1));
    await vi.waitFor(() => expect(screen.queryByText('Hold me')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /^Reject the comment by Bo/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Reject this comment?' });
    expect(callsTo(f, '/comments/pending/p2/reject', 'POST')).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Reject' }));
    await vi.waitFor(() => expect(callsTo(f, '/comments/pending/p2/reject', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Nothing waiting')).toBeTruthy();
  });
});

describe('Comments: like and report as the host (M24 US14)', () => {
  it('Like sends PUT and shows the count; Report sends the reason and note', async () => {
    const f = mockApi((p) => {
      if (p.startsWith(`${BASE}/comments?`)) return { status: 200, body: { items: [COMMENT, { ...COMMENT, id: 'team1', byTeam: true, author: { id: 'u1', displayName: 'Owner' }, body: 'From us' }] } };
      if (p.endsWith(`/comments/${COMMENT.id}/like`)) return { status: 200, body: { likeCount: 4, likedByMe: true } };
      if (p.endsWith(`/comments/${COMMENT.id}/report`)) return { status: 201, body: { id: 'r1', duplicate: false } };
      return undefined;
    });
    renderIn(<CommentList show={SHOW} />);
    const mine = await screen.findByRole('article', { name: 'Comment by Owner' });
    expect(within(mine).queryByRole('button', { name: /^Like/ })).toBeNull(); // not on your team's own comments
    expect(within(mine).queryByRole('button', { name: 'Report' })).toBeNull();
    const meis = screen.getByRole('article', { name: 'Comment by Mei' });
    fireEvent.click(within(meis).getByRole('button', { name: 'Like' }));
    await vi.waitFor(() => expect(callsTo(f, `/comments/${COMMENT.id}/like`, 'PUT')).toHaveLength(1));
    expect(await within(meis).findByRole('button', { name: 'Liked · 4' })).toBeTruthy();

    fireEvent.click(within(meis).getByRole('button', { name: 'Report' }));
    const dlg = await screen.findByRole('dialog', { name: 'Report this comment?' });
    fireEvent.change(within(dlg).getByLabelText('Reason'), { target: { value: 'harassment' } });
    fireEvent.change(within(dlg).getByLabelText('Note (optional)'), { target: { value: '  rude  ' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Report' }));
    await vi.waitFor(() => expect(bodyOf(f, `/comments/${COMMENT.id}/report`, 'POST')).toEqual({ reason: 'harassment', note: 'rude' }));
    expect(await screen.findByText('Reported. Our moderators will look at it.')).toBeTruthy();
  });
});

describe('Earnings (M24 US9)', () => {
  const zero = { count: 0, refunded: 0, totalMicrosByCurrency: {}, refundedMicrosByCurrency: {} };
  const DATA: EarningsData = {
    months: [{
      month: '2026-10',
      sale: { count: 2, refunded: 1, totalMicrosByCurrency: { MYR: 9_800_000 }, refundedMicrosByCurrency: { MYR: 4_900_000 } },
      gift: zero,
      tip: { count: 1, refunded: 0, totalMicrosByCurrency: { MYR: 2_500_000 }, refundedMicrosByCurrency: {} },
    }],
    items: [{ at: '2026-10-07T10:00:00Z', kind: 'sale', amountMicros: 4_900_000, currency: 'MYR', refunded: true }],
  };
  it('shows a month row with counts and money, the recent list, the note, and exports the CSV; axe', async () => {
    const f = mockApi((p) => (p.endsWith('/earnings') ? { status: 200, body: DATA } : p.endsWith('/export/earnings.csv') ? { status: 200, body: {} } : undefined));
    const { container } = renderIn(<Layout show={SHOW}><Earnings show={SHOW} /></Layout>);
    expect(await screen.findByText('Oct 2026')).toBeTruthy();
    expect(screen.getAllByText(/MYR 9\.80/).length).toBeGreaterThan(0); // paid shows this month
    expect(screen.getAllByText(/MYR 2\.50/).length).toBeGreaterThan(0); // tips this month
    expect(screen.getAllByText(/MYR 4\.90/).length).toBeGreaterThan(1); // refunded this month, and the recent sale
    expect(screen.getByText('Paid show')).toBeTruthy();
    expect(screen.getByText(/Amounts are what the store reported, before its fee\. Payouts are not available yet\./)).toBeTruthy();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await vi.waitFor(() => expect(callsTo(f, `${BASE}/export/earnings.csv`, 'GET')).toHaveLength(1));
  });

  it('is in the sidebar for the owner only', () => {
    mockApi(() => undefined);
    renderIn(<Layout show={SHOW}><p>x</p></Layout>);
    expect(screen.getByRole('link', { name: /Earnings/ })).toBeTruthy();
    cleanup();
    renderIn(<Layout show={{ ...SHOW, role: 'operator' }}><p>x</p></Layout>);
    expect(screen.queryByRole('link', { name: /Earnings/ })).toBeNull();
  });
});

describe('Settings › Feed (M24 US10)', () => {
  const status = (nextManualAt: string | null) => ({ hosted: false, fetchedAt: '2026-10-08T01:00:00Z', ok: true, error: null, nextManualAt });
  const overrides = { status: 200, body: { overrides: null } };

  it('Sync now is off while the next allowed time is in the future', async () => {
    mockApi((p) => (p.endsWith('/feed-sync') ? { status: 200, body: status(new Date(Date.now() + 5 * 60_000).toISOString()) } : p.endsWith('/overrides') ? overrides : undefined));
    renderIn(<Settings show={SHOW} />, `/s/${SHOW.key}/settings`);
    const btn = await screen.findByRole('button', { name: 'Sync now' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/^Last fetched/)).toBeTruthy();
    expect(screen.getByText(/Sync now works again at/)).toBeTruthy();
  });

  it('Sync now posts; a refusal shows the server\'s message', async () => {
    let n = 0;
    const f = mockApi((p) => {
      if (p.endsWith('/overrides')) return overrides;
      if (p.endsWith('/feed-sync')) return n++ === 0 ? { status: 200, body: status(null) } : { status: 429, body: { error: 'locked', message: 'Sync now works once every 10 minutes.' } };
      return undefined;
    });
    renderIn(<Settings show={SHOW} />, `/s/${SHOW.key}/settings`);
    const btn = await screen.findByRole('button', { name: 'Sync now' });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    await vi.waitFor(() => expect(callsTo(f, '/feed-sync', 'POST')).toHaveLength(1));
    expect(await screen.findByText('Sync now works once every 10 minutes.')).toBeTruthy();
  });
});

describe('Polls: multiple choice and delete (M24 US14)', () => {
  const POLL = { id: 'p1', question: 'Which topics?', episodeId: null, endsAt: '2026-10-20T00:00:00Z', closedAt: null, open: true, total: 5, multi: true, voters: 3, options: [{ idx: 0, label: 'Books', votes: 3 }, { idx: 1, label: 'Films', votes: 2 }] };
  it('a multiple-choice poll says so with its voters; create sends multi; Delete asks, then sends DELETE', async () => {
    const f = mockApi((p) => {
      if (p.endsWith('/polls/p1')) return { status: 204 };
      if (p.endsWith('/polls')) return { status: 200, body: { items: [POLL] } };
      if (p.includes('/episodes')) return { status: 200, body: EPS };
      return undefined;
    });
    renderIn(<Polls show={SHOW} />);
    expect(await screen.findByText('Multiple choice')).toBeTruthy();
    expect(screen.getByText('3 voters')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Best snack?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Tea' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Coffee' } });
    fireEvent.click(screen.getByLabelText('Listeners may choose more than one'));
    fireEvent.click(screen.getByRole('button', { name: 'Create poll' }));
    await vi.waitFor(() => expect(bodyOf(f, '/polls', 'POST')).toMatchObject({ question: 'Best snack?', options: ['Tea', 'Coffee'], multi: true }));

    fireEvent.click(screen.getByRole('button', { name: /^Delete the poll Which topics/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Delete this poll?' });
    expect(callsTo(f, '/polls/p1', 'DELETE')).toHaveLength(0);
    fireEvent.click(within(dlg).getByRole('button', { name: 'Delete poll' }));
    await vi.waitFor(() => expect(callsTo(f, '/polls/p1', 'DELETE')).toHaveLength(1));
  });
});

describe('Subscribers: search (M24 US14)', () => {
  it('typing a name asks the server with q, after a short pause', async () => {
    const f = mockApi((p) => (p.startsWith(`${BASE}/subscribers?`) ? { status: 200, body: { total: 1, page: 1, pageSize: 50, items: [{ id: 'l1', displayName: 'Mei', subscribedAt: '2026-10-01T00:00:00Z', muted: false }] } } : undefined));
    renderIn(<Subscribers show={SHOW} />, `/s/${SHOW.key}/subscribers/list`);
    expect(await screen.findByRole('cell', { name: 'Mei' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search subscribers'), { target: { value: ' Mei ' } });
    await vi.waitFor(() => expect(f.mock.calls.some(([u]) => String(u).includes('/subscribers?page=1&q=Mei'))).toBe(true));
  });
});

describe('Episodes: hidden mark (M24 US11)', () => {
  it('an episode the show hid is marked Hidden in the list', async () => {
    mockApi((p) => {
      if (p.endsWith('/hidden-episodes')) return { status: 200, body: { items: [{ episodeId: 'e1', guid: 'g1', title: 'Episode one', hiddenAt: '2026-10-07T00:00:00Z' }] } };
      if (p.includes('/episodes')) return { status: 200, body: EPS };
      return undefined;
    });
    renderIn(<Episodes show={SHOW} />);
    await screen.findByRole('link', { name: 'Episode one' });
    expect(await screen.findByText('Hidden')).toBeTruthy();
  });
});
