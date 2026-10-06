// Tests the Transcript reports page: what the line says and should say, and the Done button.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';
import { TranscriptReports, type TranscriptReport } from '../src/pages/TranscriptReports';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPEN: TranscriptReport = { id: '11111111-1111-1111-1111-111111111111', episodeId: 'e1', episodeTitle: 'Episode one', offsetMs: 61_000, original: 'the wrong words', suggested: 'the right words', createdAt: '2026-10-05T10:00:00Z', status: 'open' };

function api(items: TranscriptReport[]) {
  let list = items;
  return mockApi((p) => {
    if (p.endsWith(`/v1/studio/shows/${SHOW.key}/transcript-reports`)) return { status: 200, body: { items: list } };
    if (p.startsWith('/v1/studio/transcript-reports/')) { list = list.map((r) => ({ ...r, status: 'done' as const })); return { status: 200, body: { id: OPEN.id, status: 'done' } }; }
    return undefined;
  });
}

describe('Transcript reports', () => {
  it('shows the line, what it says and what it should say; Done sends PATCH {status:"done"} and the item reads Done', async () => {
    const f = api([OPEN]);
    renderIn(<TranscriptReports show={SHOW} />);
    expect(await screen.findByText('the right words')).toBeTruthy();
    expect(screen.getByText('the wrong words')).toBeTruthy();
    expect(screen.getByText('at 1:01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
    await vi.waitFor(() => {
      const call = f.mock.calls.find(([u, o]) => String(u).endsWith(`/transcript-reports/${OPEN.id}`) && o?.method === 'PATCH');
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toEqual({ status: 'done' });
    });
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^Done/ })).toBeNull());
  });

  it('empty says so', async () => {
    api([]);
    renderIn(<TranscriptReports show={SHOW} />);
    expect(await screen.findByText('No transcript reports')).toBeTruthy();
  });

  it('the side menu links to it; axe', async () => {
    api([OPEN]);
    const { container } = renderIn(<Layout show={SHOW}><TranscriptReports show={SHOW} /></Layout>, `/s/${SHOW.key}/transcript-reports`);
    await screen.findByText('the right words');
    expect(screen.getByRole('navigation', { name: 'Sections' }).querySelector(`a[href="/s/${SHOW.key}/transcript-reports"]`)).toBeTruthy();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
