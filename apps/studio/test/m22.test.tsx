// Tests the M22 Studio pages: Banned listeners, pin to the bottom on Comments, and Admin › Translation.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { Bans, type Ban } from '../src/pages/Bans';
import { CommentList, type StudioComment } from '../src/pages/Comments';
import { TranslationShows } from '../src/pages/admin/Translation';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BAN: Ban = { listenerId: '22222222-2222-2222-2222-222222222222', name: 'Troll', reason: 'Spam links', createdAt: '2026-10-05T10:00:00Z' };
const COMMENT: StudioComment = {
  id: '33333333-3333-3333-3333-333333333333', episodeId: 'e1', episodeTitle: 'Episode one', author: { id: 'l1', displayName: 'Mei' },
  body: 'Great one', state: 'visible', offsetMs: null, createdAt: '2026-10-05T10:00:00Z', parentId: null, replies: 0, pinned: false, pinnedBottom: false,
};

describe('Banned listeners (M22 US10)', () => {
  it('lists who is banned with the reason; Lift ban sends DELETE and the list empties', async () => {
    let items = [BAN];
    const f = mockApi((p) => {
      if (p.endsWith(`/v1/studio/shows/${SHOW.key}/bans`)) return { status: 200, body: { items } };
      if (p.endsWith(`/bans/${BAN.listenerId}`)) { items = []; return { status: 204 }; }
      return undefined;
    });
    const { container } = renderIn(<Bans show={SHOW} />);
    expect(await screen.findByText('Spam links')).toBeTruthy();
    expect(screen.getByText('Troll')).toBeTruthy();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /Lift ban/ }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith(`/bans/${BAN.listenerId}`) && o?.method === 'DELETE')).toBe(true));
    expect(await screen.findByText('Nobody is banned')).toBeTruthy();
  });
});

describe('Comments: Mute with an optional ban reason (M22 US10)', () => {
  const setup = () => mockApi((p) => {
    if (p.startsWith(`/v1/studio/shows/${SHOW.key}/comments?`)) return { status: 200, body: { items: [COMMENT] } };
    if (p.endsWith(`/mutes/l1`) || p.endsWith(`/bans/l1`)) return { status: 204 };
    return undefined;
  });

  it('a typed reason goes to the ban route with the reason (≤ 200 characters)', async () => {
    const f = setup();
    renderIn(<CommentList show={SHOW} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mute Mei' }));
    const box = screen.getByLabelText('Reason (optional)') as HTMLInputElement;
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: '  Spam links  ' } });
    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn:not(.btn-quiet)')!);
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith('/bans/l1') && o?.method === 'PUT' && o?.body === JSON.stringify({ reason: 'Spam links' }))).toBe(true));
    expect(await screen.findByText('Muted on your show')).toBeTruthy();
  });

  it('no reason: the mute route, as before', async () => {
    const f = setup();
    renderIn(<CommentList show={SHOW} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mute Mei' }));
    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn:not(.btn-quiet)')!);
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith('/mutes/l1') && o?.method === 'PUT')).toBe(true));
    expect(f.mock.calls.some(([u]) => String(u).endsWith('/bans/l1'))).toBe(false);
  });
});

describe('Comments: pin to the bottom (M22 US10)', () => {
  it('"Pin to bottom" posts pin-bottom; a bottom-pinned comment says so and offers "Unpin from bottom" (DELETE)', async () => {
    let c = COMMENT;
    const f = mockApi((p) => {
      if (p.startsWith(`/v1/studio/shows/${SHOW.key}/comments?`)) return { status: 200, body: { items: [c] } };
      if (p.endsWith(`/comments/${COMMENT.id}/pin-bottom`)) { c = { ...c, pinnedBottom: !c.pinnedBottom }; return { status: 204 }; }
      return undefined;
    });
    renderIn(<CommentList show={SHOW} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pin to bottom' }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith('/pin-bottom') && o?.method === 'POST')).toBe(true));
    expect(await screen.findByText('Pinned to bottom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unpin from bottom' }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith('/pin-bottom') && o?.method === 'DELETE')).toBe(true));
  });
});

describe('Admin › Translation (M22 US13)', () => {
  it('lists the allowed shows and today\'s use against the 90 % budget; Remove sends DELETE with the encoded feed URL', async () => {
    const FEED = 'https://foreign.example.com/feed.xml';
    let items = [{ feedUrl: FEED, title: 'Le Show', createdAt: '2026-10-05T10:00:00Z' }];
    const f = mockApi((p) => {
      if (p === '/v1/mod/translation-shows') return { status: 200, body: { items } };
      if (p === '/v1/mod/translation-usage') return { status: 200, body: { day: '2026-10-07', models: [{ model: 'whisper-large-v3', requests: 2, audioS: 7200, tokens: 0, budget: { requests: 1800, audioS: 25920 } }, { model: 'openai/gpt-oss-120b', requests: 4, audioS: 0, tokens: 9000, budget: { requests: 900, tokens: 180000 } }], queue: [] } };
      if (p === `/v1/mod/translation-shows/${encodeURIComponent(FEED)}`) { items = []; return { status: 204 }; }
      return undefined;
    });
    const { container } = renderIn(<TranslationShows />);
    expect((await screen.findAllByText('Le Show')).length).toBeGreaterThan(0); // the cell, and the Remove button's hidden name
    expect(await screen.findByText('7200 / 25920 s')).toBeTruthy();
    expect(screen.getByText('9000 / 180000 tokens')).toBeTruthy();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /^Remove/ }));
    await vi.waitFor(() => expect(f.mock.calls.some(([u, o]) => String(u).endsWith(encodeURIComponent(FEED)) && o?.method === 'DELETE')).toBe(true));
    expect(await screen.findByText('No shows yet')).toBeTruthy();
  });
});
