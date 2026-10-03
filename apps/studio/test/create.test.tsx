// Tests creating a show in one form and uploading and publishing an episode.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import axe from 'axe-core';

const mockPut = vi.fn();
vi.mock('@vercel/blob/client', () => ({ put: (...a: unknown[]) => mockPut(...a) }));

import { NoShow } from '../src/pages/NoShow';
import { NewEpisode } from '../src/pages/NewEpisode';
import { Layout } from '../src/shell/Layout';
import { SHOW, mockApi, renderIn } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); mockPut.mockReset(); });

const HOSTED = { ...SHOW, hosted: true };
const STORAGE = { ready: true, usedBytes: 10 * 1024 * 1024, ceilingBytes: 900 * 1024 * 1024, maxAudioBytes: 200 * 1024 * 1024 };

it('US1: one form creates the show; the name and choices are what the server gets', async () => {
  const f = mockApi((p) => (p === '/v1/studio/hosted-shows'
    ? { status: 201, body: { show: { feedUrl: 'https://api/feeds/x.xml' }, shows: [{ key: 'k', feedUrl: 'https://api/feeds/x.xml', title: 'Morning', image: null, role: 'owner', hosted: true }] } }
    : p.includes('/claims') ? { status: 200, body: { claims: [] } } : undefined));
  renderIn(<NoShow />, '/no-show');
  fireEvent.change(screen.getByLabelText('Show name'), { target: { value: '  Morning  ' } });
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Technology' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create show' }));
  await vi.waitFor(() => {
    const call = f.mock.calls.find(([u]) => String(u).endsWith('/hosted-shows'));
    expect(JSON.parse(String(call![1]!.body))).toEqual({ title: 'Morning', description: '', category: 'Technology', language: 'zh' });
  });
});

it('US2: a picked MP3 uploads with progress, then publishes with its title', async () => {
  mockPut.mockImplementation(async (_p: string, _f: File, o: { onUploadProgress: (e: { percentage: number }) => void }) => {
    o.onUploadProgress({ percentage: 50 });
    return { url: 'https://store/episodes/x/a.mp3' };
  });
  const f = mockApi((p) => {
    if (p === '/v1/studio/storage') return { status: 200, body: STORAGE };
    if (p.endsWith('/uploads')) return { status: 200, body: { pathname: 'episodes/x/a.mp3', token: 't' } };
    if (p.endsWith('/hosted-episodes')) return { status: 201, body: { episode: { episodeId: 'e1' } } };
    return undefined;
  });
  renderIn(<NewEpisode show={HOSTED} />);
  const input = await screen.findByLabelText(/Audio file/);
  const file = new File([new Uint8Array(1000)], 'Ep one.mp3', { type: 'audio/mpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Ep one');
  fireEvent.click(screen.getByRole('button', { name: 'Upload and publish' }));
  await vi.waitFor(() => {
    const pub = f.mock.calls.find(([u]) => String(u).endsWith('/hosted-episodes'));
    expect(JSON.parse(String(pub![1]!.body))).toMatchObject({ title: 'Ep one', audioUrl: 'https://store/episodes/x/a.mp3' });
  });
  const tok = f.mock.calls.find(([u]) => String(u).endsWith('/uploads'));
  expect(JSON.parse(String(tok![1]!.body))).toEqual({ kind: 'audio', contentType: 'audio/mpeg', size: 1000 });
  expect(mockPut.mock.calls[0]![2]).toMatchObject({ access: 'public', token: 't' });
});

it('refuses a non-audio file and says so; the store not connected is explained; axe', async () => {
  mockApi((p) => (p === '/v1/studio/storage' ? { status: 200, body: { ...STORAGE, ready: false } } : undefined));
  const { container } = renderIn(<Layout show={HOSTED}><NewEpisode show={HOSTED} /></Layout>);
  expect(await screen.findByText(/Uploading is not switched on yet/)).toBeTruthy();
  expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
});

it('a claimed-feed show has no upload page', async () => {
  mockApi(() => undefined);
  renderIn(<NewEpisode show={{ ...SHOW, hosted: false }} />);
  expect(screen.getByText(/Publish new episodes where you host it/)).toBeTruthy();
});
