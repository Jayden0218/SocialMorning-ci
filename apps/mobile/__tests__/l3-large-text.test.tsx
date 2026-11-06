// Tests that names wrap at the largest text size instead of being cut off, and that a category's name is drawn over its art.
/**
 * 035 T052 (device check L3; FR-010). At `accessibility-extra-extra-extra-large` follower names read "Listener…" (one line), and
 * on Categories the tile art covered the name ("Society & Culture" even at normal size). jest has no layout engine, so the
 * guards read what the layout engine is given: a name's line limit at font scale 1 and 3.1, and the name's z-order against the art.
 * Breaks that turn it red: put `numberOfLines={1}` back on the follower name; draw the category name without a zIndex above the art.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: mockScale })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => ({ push: jest.fn() }), Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/design/tailwind', () => ({ ...jest.requireActual('@/design/tailwind'), Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }), useToast: () => jest.fn() }));
const mockApi = { followers: () => Promise.resolve({ listeners: [{ id: 'u1', displayName: 'Listener Number Zero Five', bio: 'A long bio line' }] }), following: () => Promise.resolve({ listeners: [] }) };
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: mockApi, listener: { listenerId: 'me' } }) }));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ listeners: (l: unknown[]) => l }) }));
jest.mock('@/config/store', () => ({ useAppConfig: () => ({}) }));

import { FollowList } from '@/ui/social/FollowList';
import CategoriesScreen from '../app/categories';

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));
const flat = (s: unknown) => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

describe.each([1, 3.1])('follower names at font scale %s', (scale) => {
  it(scale > 1.3 ? 'may wrap (more than one line)' : 'stay one line', async () => {
    mockScale = scale;
    await act(async () => { r = create(createElement(FollowList, { kind: 'followers', id: 'me', name: 'Me' })); });
    const name = r.root.findAll((n) => typeof n.type === 'string' && n.props['numberOfLines'] !== undefined && JSON.stringify(n.props['children']).includes('Listener Number Zero Five'))[0]!;
    if (scale > 1.3) expect(name.props['numberOfLines']).toBeGreaterThan(1);
    else expect(name.props['numberOfLines']).toBe(1);
  });
});

it('a category tile draws its name above its art', () => {
  mockScale = 1;
  act(() => { r = create(createElement(CategoriesScreen)); });
  const art = r.root.findAll((n) => n.props['testID'] === 'corner-square')[0]!;
  const name = r.root.findAll((n) => n.props['testID'] === 'genre-tile')[0]!.findAll((n) => typeof n.type === 'string' && n.props['numberOfLines'] === 2)[0]!; // 039 (Feed lane): was 3 (the tall tile's name); every genre tile is the same size now, names on 2 lines
  expect(Number(flat(name.props['style'])['zIndex'] ?? 0)).toBeGreaterThan(Number(flat(art.props['style'])['zIndex'] ?? 0));
});
