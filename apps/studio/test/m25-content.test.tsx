// M25 lane AC: Admin › App settings and Admin › Content, and the content-sanitising guard.
/**
 * Guard G-AC2 (content sanitising, Studio half): a `<script>` or an `<img onerror>` typed into a page
 * body is drawn as TEXT in the preview — no script or img element exists, and a non-https link is
 * not a link. The break that turns it red: in `src/pages/admin/Markdown.tsx`, draw a text run as
 * `<span dangerouslySetInnerHTML={{ __html: x.v }} />`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { MarkdownView } from '../src/pages/admin/Markdown';
import { AppSettings, hintLines, mergeRows, rowsValue, type ConfigData } from '../src/pages/admin/AppSettings';
import { Content, slugOf } from '../src/pages/admin/Content';
import { ADMIN_SECTIONS } from '../src/pages/admin/AdminLayout';
import { mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const noViolations = async (el: Element) =>
  expect((await axe.run(el, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
const calls = (f: ReturnType<typeof mockApi>) => f.mock.calls.map(([u, init]) => `${init?.method ?? 'GET'} ${String(u).replace(/^\/api/, '')}${init?.body ? ` ${String(init.body)}` : ''}`);

describe('G-AC2: a page body never renders as HTML', () => {
  it('<script>, <img onerror> and a javascript: link stay text', () => {
    const { container } = render(<MarkdownView label="Body" source={'## Hi <b>there</b>\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1)) [good](https://example.com/a) **bold**\n\n- one\n1. two'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    const links = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['https://example.com/a']);
    expect(container.querySelector('h3')?.textContent).toBe('Hi <b>there</b>');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelectorAll('ul li, ol li')).toHaveLength(2);
  });
});

describe('pure helpers', () => {
  it('mergeRows, rowsValue, hintLines, slugOf', () => {
    expect(mergeRows(['a', 'b', 'c'], [{ id: 'c', label: 'C!' }, { id: 'zz' }, { id: 'a', hidden: true }])).toEqual([
      { id: 'c', label: 'C!', hidden: false }, { id: 'a', label: '', hidden: true }, { id: 'b', label: '', hidden: false },
    ]);
    expect(rowsValue([{ id: 1, label: ' X ', hidden: false }, { id: 2, label: '', hidden: true }], 'name')).toEqual([{ id: 1, name: 'X' }, { id: 2, hidden: true }]);
    expect(hintLines(' jazz \n\nhistory ')).toEqual(['jazz', 'history']);
    expect(slugOf('  How do I — start? ')).toBe('how-do-i-start');
    expect(ADMIN_SECTIONS.some((s) => s.path === 'app-settings')).toBe(true);
    expect(ADMIN_SECTIONS.some((s) => s.path === 'content')).toBe(true);
  });
});

const CONFIG: ConfigData = {
  items: [
    { key: 'shortcuts', value: [{ id: 'categories' }, { id: 'queue' }], saved: false, version: 0, updatedAt: null },
    { key: 'genres', value: [], saved: false, version: 0, updatedAt: null },
    { key: 'sectionTitles', value: {}, saved: false, version: 0, updatedAt: null },
    { key: 'listSizes', value: { discoverCategories: 8, searchCategories: 4, searchHints: 5 }, saved: false, version: 0, updatedAt: null },
    { key: 'ratePrompt', value: { enabled: true, delayMs: 1500, reaskAfterDays: null, storeUrls: {} }, saved: false, version: 0, updatedAt: null },
    { key: 'searchHints', value: [], saved: true, version: 2, updatedAt: new Date().toISOString() },
  ],
  shortcuts: [{ id: 'categories', label: 'Categories' }, { id: 'queue', label: 'Queue' }],
  genres: [{ id: 1321, name: 'Business' }, { id: 1303, name: 'Comedy' }],
  sectionTitles: ['For You', 'New arrivals'],
  listSizes: { discoverCategories: { label: 'Category tiles on Discover', def: 8, min: 0, max: 19 } },
};

describe('App settings', () => {
  it('lists every card, saves the tiles in the new order with a label and a hide, and passes axe', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/config') return { status: 200, body: CONFIG };
      if (p === '/v1/admin/config/shortcuts') return { status: 200, body: { version: 1 } };
      return undefined;
    });
    const { container } = renderIn(<AppSettings />);
    expect(await screen.findByRole('heading', { name: /Discover shortcut tiles/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Rate prompt/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Move Queue up' }));
    fireEvent.change(screen.getByLabelText('New name for Queue'), { target: { value: 'Up next' } });
    fireEvent.click(screen.getByLabelText('Show Categories'));
    fireEvent.click(screen.getByRole('button', { name: 'Save discover shortcut tiles' }));
    await waitFor(() => expect(calls(f)).toContain('PUT /v1/admin/config/shortcuts {"version":0,"value":[{"id":"queue","label":"Up next"},{"id":"categories","hidden":true}]}'));
    expect(await screen.findByText(/Saved\. Phones pick it up/)).toBeTruthy();
    await noViolations(container);
  });

  it('a saved key can go back to its default', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/config') return { status: 200, body: CONFIG };
      if (p.startsWith('/v1/admin/config/searchHints')) return { status: 200, body: { version: 0 } };
      return undefined;
    });
    renderIn(<AppSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to default' }));
    await waitFor(() => expect(calls(f)).toContain('DELETE /v1/admin/config/searchHints?version=2'));
  });
});

const PAGES = [
  { kind: 'academy', slug: 'clips', title: 'Clips', summary: 'Share the best minute.', tag: 'grow', body: '## What a clip is\n\nA range.', position: 3, published: true, version: 1, updatedAt: new Date().toISOString() },
  { kind: 'academy', slug: 'draft', title: 'Draft one', summary: null, tag: null, body: 'x', position: 4, published: false, version: 2, updatedAt: new Date().toISOString() },
];

describe('Content', () => {
  it('lists pages, opens the editor with a live preview that keeps HTML as text, saves, and passes axe', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/content?kind=academy') return { status: 200, body: { items: PAGES } };
      if (p === '/v1/admin/content/academy/clips') return { status: 200, body: { version: 2 } };
      return undefined;
    });
    const { container } = renderIn(<Content />);
    expect(await screen.findByText('Not published')).toBeTruthy();
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Clips' }));
    fireEvent.change(screen.getByLabelText('Article (## starts a section)'), { target: { value: '## Safe\n\n<script>alert(1)</script>' } });
    const preview = screen.getByRole('region', { name: 'Preview of the body' });
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.textContent).toContain('<script>alert(1)</script>');
    await noViolations(container);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(f)).toContain('PUT /v1/admin/content/academy/clips {"version":1,"title":"Clips","summary":"Share the best minute.","tag":"grow","body":"## Safe\\n\\n<script>alert(1)</script>","position":3,"published":true}'));
  });

  it('a new Help question takes its address from the question', async () => {
    const f = mockApi((p) => {
      if (p === '/v1/admin/content?kind=academy') return { status: 200, body: { items: [] } };
      if (p === '/v1/admin/content?kind=faq') return { status: 200, body: { items: [] } };
      if (p === '/v1/admin/content/faq/how-do-i-start') return { status: 200, body: { version: 1 } };
      return undefined;
    });
    renderIn(<Content />);
    fireEvent.click(screen.getByRole('tab', { name: 'Help questions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New question' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'How do I start?' } });
    fireEvent.change(screen.getByLabelText('Answer'), { target: { value: 'Tap **Play**.' } });
    expect((screen.getByLabelText('Address (lower-case letters, digits, dashes)') as HTMLInputElement).value).toBe('how-do-i-start');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls(f).some((c) => c.startsWith('PUT /v1/admin/content/faq/how-do-i-start {"version":0,"title":"How do I start?"'))).toBe(true));
  });
});
