/**
 * M16a guard G-B2 (FR-003, FR-004). Phone walk 2026-10-02: own profile "300 followers", list
 * "Nobody follows you yet"; and another user's empty list said "you" too.
 *  - an empty list names whose list it is — "you" only on your own (FR-004);
 *  - a list that FAILED to load says so, with Retry — it is not drawn as "nobody" (the page used
 *    to swallow the error and show the empty sentence);
 *  - the rows that came back are the rows drawn.
 * The count half (the server counts with the list's rule) is guarded in
 * apps/api/test/follows.test.ts.
 *
 * The break that turns it red: hard-code "you" — e.g. make `followEmptyLine` in
 * src/ui/social/FollowList.tsx return undefined for every profile, so the fixed "Nobody follows you
 * yet" sentence shows on Bea's list.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockFollowers: () => Promise<{ listeners: { id: string; displayName: string | null }[]; next?: string }> = () => Promise.resolve({ listeners: [] });
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/design/tailwind', () => ({ Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/ui/kit/PageHeader', () => ({ PageHeader: () => null }));
// One api object for every render, as the real context gives: a new object per render re-ran the
// page's load effect forever (gate 36950442286 ran out of memory here).
const mockApi = { followers: () => mockFollowers(), following: () => mockFollowers() };
jest.mock('@/social/context', () => ({
  useSocial: () => ({ api: mockApi, listener: { listenerId: 'me' } }),
}));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ listeners: (l: unknown[]) => l }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

import { FollowList, followEmptyLine } from '@/ui/social/FollowList';

// The visible words only: the tree's props hold React elements (ListEmptyComponent), which JSON cannot hold.
const text = (r: ReactTestRenderer): string =>
  r.root.findAll((n) => typeof n.type === 'string').flatMap((n) => n.children.filter((c): c is string => typeof c === 'string')).join(' ');
async function render(id: string, name?: string, kind: 'followers' | 'following' = 'followers'): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(FollowList, { kind, id, ...(name ? { name } : {}) })); });
  return r;
}

it('the empty sentence names the owner — "you" only on your own list', () => {
  expect(followEmptyLine('followers', true, 'Me')).toBeUndefined(); // the table's own "Nobody follows you yet"
  expect(followEmptyLine('followers', false, 'Bea')).toBe('Nobody follows Bea yet.');
  expect(followEmptyLine('following', false, 'Bea')).toBe("Bea doesn't follow anyone yet.");
  expect(followEmptyLine('followers', false, undefined)).toBe('Nobody follows this listener yet.');
  expect(followEmptyLine('following', false, '  ')).toBe("This listener doesn't follow anyone yet.");
});

it("another user's empty list says their name, never \"you\"", async () => {
  mockFollowers = () => Promise.resolve({ listeners: [] });
  const r = await render('bea', 'Bea');
  expect(text(r)).toContain('Nobody follows Bea yet.');
  expect(text(r)).not.toContain('Nobody follows you');
});

it('your own empty list keeps the sentence about you', async () => {
  mockFollowers = () => Promise.resolve({ listeners: [] });
  expect(text(await render('me', 'Me'))).toContain('Nobody follows you yet');
});

it('a list that failed to load says so, with Retry — not "nobody"', async () => {
  mockFollowers = () => Promise.reject(new Error('network'));
  const r = await render('me', 'Me');
  expect(text(r)).toContain("Couldn't load followers");
  expect(text(r)).not.toContain('Nobody follows');
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Retry').length).toBeGreaterThan(0);
});

it('the rows that came back are drawn', async () => {
  mockFollowers = () => Promise.resolve({ listeners: [{ id: 'a', displayName: 'Ana' }, { id: 'b', displayName: null }] });
  const r = await render('me', 'Me');
  expect(text(r)).toContain('Ana');
  expect(text(r)).toContain('Deleted account');
  expect(text(r)).not.toContain('Nobody follows');
});
