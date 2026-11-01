// Tests that Academy shows the bundled articles when the server sends none.
/**
 * 035 T053 (device check L5; FR-011). With the catalogue seeded empty, the server answers /v1/content/academy with `{ items: [] }`;
 * the app read that as "show nothing" and drew an empty grid with no message (r17-01). An empty server list means "no override":
 * the bundled articles show. A server list with articles still wins.
 * Breaks that turn it red: go back to `items ? … : BUNDLED_ARTICLES` (an empty array is truthy).
 */
import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockServer: unknown[] = [];
const mockCache = new Map<string, unknown>();
// One object for every render, as the real hook gives (a new one each time would re-create the loader for ever).
const mockStores = { feedCache: { get: (k: string) => mockCache.get(k), set: (row: { key: string }) => { mockCache.set(row.key, row); } } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores }));
jest.mock('@/config/api', () => ({ createConfigApi: () => ({ content: async () => ({ status: 200, body: { items: mockServer } }) }) }));
jest.mock('@/social/token', () => ({ secureToken: { get: async () => undefined } }));

import { BUNDLED_ARTICLES, useAcademy, type ArticleView } from '@/config/content';

let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); mockCache.clear(); });
async function read(): Promise<readonly ArticleView[]> {
  const got: { current: readonly ArticleView[] } = { current: [] };
  function Probe(): null { const v = useAcademy(); useEffect(() => { got.current = v; }); return null; }
  await act(async () => { r = create(createElement(Probe)); for (let i = 0; i < 6; i++) await Promise.resolve(); });
  return got.current;
}

it('the server sends []: the bundled articles show', async () => {
  mockServer = [];
  const got = await read();
  expect(BUNDLED_ARTICLES.length).toBeGreaterThan(0);
  expect(got).toHaveLength(BUNDLED_ARTICLES.length);
});

it('the server sends articles: those show', async () => {
  mockServer = [{ slug: 'hello', title: 'Hello', body: '# Hello\n\nText.' }];
  const got = await read();
  expect(got.map((a) => a.slug)).toEqual(['hello']);
});
