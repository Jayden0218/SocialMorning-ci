// Tests that the Episode page has no now bar and that its toasts sit 112 up, above the tray.
/**
 * M31 W3-A (T040; design-pulse2 `episode--screen`, `toast--episode-page`: "Always 112 from the bottom on this page (above the tray)").
 * The page draws its own tray where the now bar would float, so `miniPlayerShows` stands down on `/episode/…` and the toast
 * rule treats the page like the player: 8 over the tray's 12 → 112 on a 34 pt inset. Other pushed pages keep the bar.
 *
 * The break that turns it red: remove the `/episode/` line from `miniPlayerShows` (src/ui/player/MiniPlayer.tsx) or from
 * `toastPlacement` (src/ui/shell/toastPlacement.ts).
 */
import { toastPlacement } from '@/ui/shell/toastPlacement';
import { toastBottom } from '@/design';
import { miniPlayerShows } from '@/ui/player/MiniPlayer';

jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({}), useToast: () => jest.fn() }));
jest.mock('@/ui/queue/QueueSheetHost', () => ({ useQueueSheet: () => ({ open: jest.fn() }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/episode/e1', router: { push: jest.fn() }, useIsFocused: () => true }));

it('a toast on the Episode page sits 112 up, and no now bar is drawn there', () => {
  const p = toastPlacement('/episode/e1', false, false);
  expect(p).toMatchObject({ tabs: false, now: false, player: true });
  expect(toastBottom(34, p)).toBe(112);
  expect(miniPlayerShows('/episode/e1', 'root', false)).toBe(false);
});

it('other pushed pages keep the bar and their toast spot', () => {
  expect(miniPlayerShows('/show/x', 'root', false)).toBe(true);
  expect(toastBottom(34, toastPlacement('/show/x', false, false))).toBe(toastBottom(34, { tabs: false, now: true }));
});

// 035 T013 (device check D1, B1): a chat thread has its message box at the foot, and Scan is a full-screen camera — neither draws the now bar.
// Notifications keeps it (its title bar lifts above it); New chat is a plain pushed page and keeps it too.
it('035 D1: the chat thread and Scan draw no now bar; New chat and Notifications still do', () => {
  expect(miniPlayerShows('/chat/u1', 'root', false)).toBe(false);
  expect(miniPlayerShows('/scan', 'root', false)).toBe(false);
  expect(miniPlayerShows('/chat/new', 'root', false)).toBe(true);
  expect(miniPlayerShows('/chat', 'tabs', false)).toBe(true); // the Chat tab: the tab layout's bar
  expect(miniPlayerShows('/notifications', 'root', false)).toBe(true);
});
