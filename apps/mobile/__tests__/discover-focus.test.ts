// Tests that Discover only refreshes on focus when its copy is old.
/**
 * M12 guard G-N9 (NEW-9, found on the iPhone): Discover refreshed through the pull spinner on
 * every focus. A focus refreshes only a copy older than FOCUS_REFRESH_MS.
 * The break: make `dueForRefresh` always true.
 */
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}), useToast: () => () => undefined }));
jest.mock('@/social/context', () => ({ useSocial: () => ({}) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => ({}) }));
jest.mock('@/feeds/fetch', () => ({ refreshShow: jest.fn() }));
import { FOCUS_REFRESH_MS, dueForRefresh } from '@/discover/useDiscover';

it('a recent copy is not fetched again on focus; an old or missing one is', () => {
  const now = 1_000_000_000;
  expect(dueForRefresh(now - 60_000, now)).toBe(false);
  expect(dueForRefresh(now - FOCUS_REFRESH_MS - 1, now)).toBe(true);
  expect(dueForRefresh(undefined, now)).toBe(true);
});
