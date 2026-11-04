// 037 M5 (spec 037 FR-007): a toast sits just above the bottom bars and is never over the top title.
/**
 * Written BEFORE the change: red today (toasts were lifted over a BOTTOM title bar: `titleBarBottom + toastLift`, `toastTabTitle` on Updates, `foot: 'page'` on
 * the settings pages whose only foot was the title). Now the highest bar is the reference, and the title is at the top.
 * Breaks that turn it red: lift a toast by the old title height again (`barsTop` + 126); give a `composer` toast a bottom over the screen's height less the title block.
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false }));
jest.mock('@/ui/player/MiniPlayer', () => ({
  TAB_ROUTES: ['/', '/library'],
  miniPlayerShows: (path: string, ctx: string, idle: boolean) => path !== '/player' && !(ctx === 'root' && ['/', '/library'].includes(path)) && !idle,
}));
import { bars, barsTop, contentTopReserve, titleBarTop, toastBottom } from '@/design';
import { toastPlacement } from '@/ui/shell/toastPlacement';

const at = (path: string, idle: boolean, safe = 34, moments = false): number => toastBottom(safe, toastPlacement(path, idle, moments));
const PATHS = ['/', '/library', '/me', '/chat', '/notifications', '/settings/devices', '/settings/downloads', '/settings/feedback', '/search', '/comments/e1', '/comments/thread/c1', '/status/text', '/clip/new', '/voice/new', '/history', '/subscriptions', '/settings/minor', '/profile/abc'];

describe('037 M5 toasts clear the bottom bars only', () => {
  it('over a tab page with a now bar a toast sits toastLift over the now bar\'s top', () => {
    expect(at('/', false)).toBe(barsTop(34, { tabs: true, now: true }) + bars.toastLift);
  });
  it('over a tab page with only the tab bar, toastLift over the tab bar\'s top', () => {
    expect(at('/', true)).toBe(barsTop(34, { tabs: true }) + bars.toastLift);
  });
  it('the Updates tab has no extra lift for a tall title any more', () => {
    expect(at('/library', false)).toBe(at('/', false));
    expect(at('/library', true)).toBe(at('/', true));
  });
  it('a settings page whose only foot was its title uses the plain rule', () => {
    expect(at('/settings/devices', false)).toBe(barsTop(34, { now: true }) + bars.toastLift);
    expect(at('/settings/downloads', true)).toBe(barsTop(34) + bars.toastLift);
  });
  it('a toast\'s top edge is below the title block on the smallest phone, on every route', () => {
    const height = 667; const safeTop = 20; const safeBottom = 0;
    for (const path of PATHS) for (const idle of [true, false]) {
      const topEdge = height - at(path, idle, safeBottom) - bars.toast;
      expect(topEdge).toBeGreaterThanOrEqual(titleBarTop(safeTop) + contentTopReserve());
    }
  });
});
