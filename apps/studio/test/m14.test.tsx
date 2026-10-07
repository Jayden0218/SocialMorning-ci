// Tests save bar, contacts, hosts, drafts, media, sparklines and the tips switch.
/**
 * M14 — Studio parity (specs/014-m14-studio-parity): save bar + leave guard, contacts, hosts and
 * invites, drafts and scheduling, media, sparklines, the tips switch. axe on each new screen
 * (contrast is measured from the tokens instead — jsdom has no layout).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { Route, Routes } from 'react-router';

const mockPut = vi.fn();
vi.mock('@vercel/blob/client', () => ({ put: (...a: unknown[]) => mockPut(...a) }));

import { Settings } from '../src/pages/Settings';
import { Invite } from '../src/pages/Invite';
import { Media } from '../src/pages/Media';
import { Episodes } from '../src/pages/Episodes';
import { NewEpisode } from '../src/pages/NewEpisode';
import { Home } from '../src/pages/Home';
import { Tips } from '../src/pages/Tips';
import { contactProblem } from '../src/pages/settings/Contacts';
import { Layout } from '../src/shell/Layout';
import { OVERVIEW, SHOW, mockApi, renderIn, trendOf } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); mockPut.mockReset(); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const HOSTED = { ...SHOW, hosted: true };
const OVERRIDES = { title: 'Morning Talk', description: null, coverUrl: null, themeColour: null, milestoneMessage: null, hosts: null, links: null, contacts: null, tipsEnabled: false };
const bodyOf = (f: ReturnType<typeof mockApi>, end: string, method = 'PUT') => {
  const call = f.mock.calls.filter(([u, i]) => String(u).endsWith(end) && (i?.method ?? 'GET') === method).at(-1);
  return call ? JSON.parse(String(call[1]!.body)) : undefined;
};

describe('US1 save bar and leave guard', () => {
  it('Save is off until something changes; leaving with changes asks in the page; saving turns it off again', async () => {
    const f = mockApi((p) => (p.endsWith('/overrides') ? { status: 200, body: { overrides: OVERRIDES } } : undefined));
    const { container } = renderIn(<Layout show={SHOW}><Settings show={SHOW} /></Layout>, `/s/${SHOW.key}/settings`);
    const save = await screen.findByRole('button', { name: 'Save changes' });
    await vi.waitFor(() => expect((screen.getByLabelText('Show name') as HTMLInputElement).value).toBe('Morning Talk'));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Show name'), { target: { value: 'Morning Talk 2' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('You have unsaved changes.')).toBeTruthy();
    expect(screen.getAllByText('Morning Talk 2').length).toBeGreaterThan(0); // the preview follows unsaved edits

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('link', { name: /Home/ }));
    const dlg = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Show name') as HTMLInputElement).value).toBe('Morning Talk 2');

    fireEvent.click(save);
    await vi.waitFor(() => expect(bodyOf(f, '/overrides')).toMatchObject({ title: 'Morning Talk 2' }));
    await vi.waitFor(() => expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true));
    expect(bodyOf(f, '/overrides')).not.toHaveProperty('milestoneMessage'); // left out = kept, not cleared
    await noViolations(container);
  });

  it('the share card link is the public show page', async () => {
    mockApi((p) => (p.endsWith('/overrides') ? { status: 200, body: { overrides: OVERRIDES } } : undefined));
    renderIn(<Settings show={SHOW} />, `/s/${SHOW.key}/settings`);
    expect(await screen.findByText(`https://socialmorning-api.vercel.app/show/${SHOW.key}`)).toBeTruthy();
  });
});

describe('US3 contacts', () => {
  it('each type is checked like the server checks it', () => {
    expect(contactProblem({ type: 'email', value: 'a@b.co' })).toBeNull();
    expect(contactProblem({ type: 'email', value: 'nope' })).toBe('Not an email address.');
    expect(contactProblem({ type: 'weibo', value: 'http://weibo.com/x' })).toMatch(/https/);
    expect(contactProblem({ type: 'wechat', value: 'morning_fm' })).toBeNull();
    expect(contactProblem({ type: 'wechat', value: 'has space' })).not.toBeNull();
  });
  it('a bad contact is marked and not sent; a good one is saved with the 100-hour message; axe', async () => {
    const f = mockApi((p) => (p.endsWith('/overrides') ? { status: 200, body: { overrides: OVERRIDES } } : undefined));
    const { container } = renderIn(<Layout show={SHOW}><Settings show={SHOW} /></Layout>, `/s/${SHOW.key}/settings/contacts`);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a contact' }));
    // findBy: the new contact row renders a moment after the click (seen flaky 2026-10-08, run 37691488284).
    fireEvent.change(await screen.findByLabelText('Type'), { target: { value: 'email' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Not an email address.')).toBeTruthy();
    expect(bodyOf(f, '/overrides')).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'hi@example.com' } });
    fireEvent.change(screen.getByLabelText(/A thank-you a listener sees/), { target: { value: 'Thank you!' } });
    expect(screen.getAllByText('Thank you!').length).toBeGreaterThan(0); // the phone preview
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(bodyOf(f, '/overrides')).toEqual({ contacts: [{ type: 'email', value: 'hi@example.com' }], milestoneMessage: 'Thank you!' }));
    await noViolations(container);
  });
});

describe('US2 hosts', () => {
  it('the owner makes a link (shown once), sees open links and hosts; axe', async () => {
    const f = mockApi((p) => {
      if (p.endsWith('/hosts')) return { status: 200, body: { hosts: [{ id: 'h1', displayName: 'Mei', addedAt: '2026-09-20T00:00:00Z' }] } };
      if (p.endsWith('/host-invites')) return { status: 200, body: { invites: [] } };
      return undefined;
    });
    const { container } = renderIn(<Layout show={SHOW}><Settings show={SHOW} /></Layout>, `/s/${SHOW.key}/settings/hosts`);
    expect((await screen.findAllByText('Mei')).length).toBeGreaterThan(0);
    f.mockImplementationOnce(async () => new Response(JSON.stringify({ id: 'i1', url: 'https://studio/invite/tok', expiresAt: '2026-10-03T00:00:00Z' }), { status: 201 }));
    fireEvent.click(screen.getByRole('button', { name: 'Make an invite link' }));
    expect(await screen.findByText('https://studio/invite/tok')).toBeTruthy();
    expect(f.mock.calls.some(([u, i]) => String(u).endsWith('/host-invites') && i?.method === 'POST')).toBe(true);
    await noViolations(container);
  });

  it('the invite page names the show and accepts; a used link says so', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/studio/invites/good') return { status: 200, body: { state: 'open', showTitle: 'Morning Talk', expiresAt: '2026-10-03T00:00:00Z' } };
      if (p === '/v1/studio/invites/good/accept') return { status: 200, body: { feedUrl: SHOW.feedUrl } };
      if (p === '/v1/studio/invites/old') return { status: 200, body: { state: 'used', showTitle: 'Morning Talk' } };
      return undefined;
    });
    const page = <Routes><Route path="/invite/:token" element={<Invite />} /></Routes>;
    const { container } = renderIn(page, '/invite/good');
    expect(await screen.findByRole('heading', { name: 'Join Morning Talk as a host' })).toBeTruthy();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('heading', { name: 'You are a host of Morning Talk' })).toBeTruthy();
    expect(f.mock.calls.some(([u, i]) => String(u).endsWith('/invites/good/accept') && i?.method === 'POST')).toBe(true);
    cleanup();
    renderIn(page, '/invite/old');
    expect(await screen.findByText('This invite link was already used.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });
});

describe('US4 drafts and scheduling', () => {
  const STORAGE = { ready: true, usedBytes: 0, ceilingBytes: 900 * 1024 * 1024, maxAudioBytes: 200 * 1024 * 1024 };
  const pick = async () => {
    const file = new File([new Uint8Array(1000)], 'Ep.mp3', { type: 'audio/mpeg' });
    fireEvent.change(await screen.findByLabelText(/Audio file/), { target: { files: [file] } });
  };
  const upload = () => mockApi((p) => {
    if (p === '/v1/studio/storage') return { status: 200, body: STORAGE };
    if (p.endsWith('/uploads')) return { status: 200, body: { pathname: 'episodes/x/a.mp3', token: 't' } };
    if (p.endsWith('/hosted-episodes')) return { status: 201, body: { episode: { episodeId: 'e1' } } };
    return undefined;
  });
  it('a draft is sent as a draft; a scheduled one carries its time; a past time is refused here', async () => {
    mockPut.mockResolvedValue({ url: 'https://store/episodes/x/a.mp3' });
    let f = upload();
    renderIn(<NewEpisode show={HOSTED} />);
    await pick();
    fireEvent.click(screen.getByLabelText('Save as a draft (not in your feed)'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload and save draft' }));
    await vi.waitFor(() => expect(bodyOf(f, '/hosted-episodes', 'POST')).toMatchObject({ status: 'draft' }));
    cleanup();

    f = upload();
    renderIn(<NewEpisode show={HOSTED} />);
    await pick();
    fireEvent.click(screen.getByLabelText('Publish at a time'));
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: '2020-01-01T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload and schedule' }));
    expect(await screen.findByText('Choose a time in the next 90 days.')).toBeTruthy();
    expect(mockPut).toHaveBeenCalledTimes(1); // only the draft's upload: nothing moved for the refused one
    const soon = new Date(Date.now() + 2 * 86_400_000);
    const local = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText(/Date and time/), { target: { value: local } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload and schedule' }));
    await vi.waitFor(() => expect(bodyOf(f, '/hosted-episodes', 'POST')).toMatchObject({ status: 'published', publishAt: new Date(local).toISOString() }));
  });

  it('drafts and scheduled episodes are listed apart, and Publish now publishes; axe', async () => {
    const f = mockApi((p) => {
      if (p.endsWith('/hosted-episodes')) return { status: 200, body: { items: [
        { id: 'd1', title: 'Rough cut', status: 'draft', scheduled: false, publishedAt: '2026-09-20T00:00:00Z', coverUrl: null },
        { id: 's1', title: 'Next week', status: 'published', scheduled: true, publishedAt: '2026-10-06T01:00:00Z', coverUrl: null },
        { id: 'p1', title: 'Out now', status: 'published', scheduled: false, publishedAt: '2026-09-01T00:00:00Z', coverUrl: null },
      ] } };
      if (p.endsWith('/hosted-episodes/d1')) return { status: 200, body: { episode: {} } };
      if (p.includes('/episodes')) return { status: 200, body: { total: 0, page: 1, pageSize: 20, items: [] } };
      return undefined;
    });
    const { container } = renderIn(<Layout show={HOSTED}><Episodes show={HOSTED} /></Layout>);
    const box = await screen.findByRole('region', { name: 'Drafts and scheduled' });
    expect(within(box).getAllByText('Rough cut').length).toBeGreaterThan(0);
    expect(within(box).getByText(/^Scheduled for/)).toBeTruthy();
    expect(within(box).queryByText('Out now')).toBeNull();
    await noViolations(container);
    fireEvent.click(within(box).getByRole('button', { name: 'Publish now: Rough cut' }));
    await vi.waitFor(() => expect(bodyOf(f, '/hosted-episodes/d1')).toEqual({ status: 'published', publishAt: null }));
  });
});

describe('US5 media', () => {
  it('a file in use cannot be deleted; an unused one is, after a confirm; axe', async () => {
    const f = mockApi((p) => (p.endsWith('/media') ? { status: 200, body: {
      usedBytes: 6_000_000, ceilingBytes: 900 * 1024 * 1024, totalUsedBytes: 6_000_000, files: [
        { url: 'https://s/episodes/x/a.mp3', pathname: 'episodes/x/a.mp3', size: 5_000_000, contentType: 'audio/mpeg', kind: 'audio', usedBy: 'Ep one' },
        { url: 'https://s/covers/x/b.png', pathname: 'covers/x/b.png', size: 1_000_000, contentType: 'image/png', kind: 'image', usedBy: null },
      ] } } : undefined));
    const { container } = renderIn(<Layout show={HOSTED}><Media show={HOSTED} /></Layout>);
    expect(await screen.findByText('Ep one')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete a.mp3' })).toBeNull();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Delete b.png' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(bodyOf(f, '/media', 'DELETE')).toEqual({ url: 'https://s/covers/x/b.png' }));
  });
  it('the Media section is only in the sidebar of a show made here', () => {
    mockApi(() => undefined);
    renderIn(<Layout show={SHOW}><p>x</p></Layout>);
    expect(screen.queryByRole('link', { name: /Media/ })).toBeNull();
    cleanup();
    renderIn(<Layout show={HOSTED}><p>x</p></Layout>);
    expect(screen.getByRole('link', { name: /Media/ })).toBeTruthy();
  });
});

describe('US6 and US7', () => {
  it('each stat has a 14-day sparkline; the overview asks in the browser\'s time zone', async () => {
    const days = Array.from({ length: 14 }, (_, i) => i);
    const f = mockApi((p) => (p.includes('/overview') ? { status: 200, body: { ...OVERVIEW, sparklines: { plays: days, subs: days, comments: days, saves: days, shares: days, likes: days } } }
      : p.includes('/trend') ? { status: 200, body: trendOf(1) } : undefined));
    const { container } = renderIn(<Home show={SHOW} />);
    await screen.findByText('1,234');
    expect(container.querySelectorAll('svg.sparkline')).toHaveLength(6);
    expect(String(f.mock.calls.find(([u]) => String(u).includes('/overview'))![0])).toMatch(/overview\?tz=/);
  });
  it('the tips switch saves at once and says the app has no Tip button yet; axe', async () => {
    const f = mockApi((p) => (p.endsWith('/overrides') ? { status: 200, body: { overrides: OVERRIDES } }
      : p.endsWith('/tips') ? { status: 200, body: { totalMicrosByCurrency: {}, items: [] } } : undefined));
    const { container } = renderIn(<Layout show={SHOW}><Tips show={SHOW} /></Layout>);
    const sw = await screen.findByRole('switch');
    expect((sw as HTMLInputElement).checked).toBe(false);
    fireEvent.click(sw);
    await vi.waitFor(() => expect(bodyOf(f, '/overrides')).toEqual({ tipsEnabled: true }));
    expect(await screen.findByText('Saved: tips are on.')).toBeTruthy();
    expect(screen.getByText(/the app has no Tip button/)).toBeTruthy();
    await noViolations(container);
  });
});
