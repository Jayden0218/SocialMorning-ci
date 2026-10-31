// Checks the toast sits above whichever bars are showing: both on a tab screen, the tray on the player.
/**
 * M31 integration (L5; design-pulse2 index.html §Bars, listen.html toasts at 112). `toastPlacement`
 * is the rule, `toastBottom` the number. The breaks that turn it red: make `toastPlacement` return
 * `now: true` on the player, or ignore `momentsOnScreen`; or make `toastBottom` ignore `opts.player`.
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false }));
jest.mock('@/ui/player/MiniPlayer', () => ({
  TAB_ROUTES: ['/', '/library'],
  miniPlayerShows: (path: string, ctx: string, idle: boolean) => path !== '/player' && !(ctx === 'root' && ['/', '/library'].includes(path)) && !idle,
}));
import { toastBottom } from '@/design';
import { toastPlacement } from '@/ui/shell/toastPlacement';

const at = (path: string, idle: boolean, moments = false) => { const p = toastPlacement(path, idle, moments); return toastBottom(34, p); };

it('a tab screen with something playing: over the tab bar and the now bar (176)', () => expect(at('/', false)).toBe(176));
it('a tab screen with nothing loaded: over the tab bar alone (108); the Updates tab sits over its tall title bar (232, F9)', () => { expect(at('/', true)).toBe(108); expect(at('/library', true)).toBe(232); });
it('Home on Moments hides the now bar, so the toast drops to the tab bar (108)', () => expect(at('/', false, true)).toBe(108));
it('the player: clears the tray (112), whatever is loaded', () => { expect(at('/player', false)).toBe(112); expect(at('/player', true)).toBe(112); });
it('a pushed page with the now bar: 116; without: 48', () => { expect(at('/show/x', false)).toBe(116); expect(at('/show/x', true)).toBe(48); });

// Lane W3-D: the Comments pages (social.html comments--toast 196, comment-thread--toast 176 at inset 34).
it('comments: the toast clears the composer (196); replies (176) — the thread path wins over /comments', () => {
  expect(at('/comments/ep1', false)).toBe(196);
  expect(at('/comments/ep1', true)).toBe(196);
  expect(at('/comments/thread/c1', false)).toBe(176);
});
it('a pushed page that is not comments is unchanged (48)', () => expect(at('/commentary', true)).toBe(48));

// F2a: chat-thread--toast 176 and notifications--toast 196 (social.html), at inset 34. Break: remove the '/chat/' or '/notifications' branch in toastPlacement.
it('a chat thread: the toast clears the message box (176), with or without something playing; New chat is a plain pushed page', () => {
  expect(at('/chat/u1', false)).toBe(176);
  expect(at('/chat/u1', true)).toBe(176);
  expect(at('/chat/new', true)).toBe(48);
  expect(at('/chat', true)).toBe(48);
});
it('Notifications: 196, over its bottom zone', () => {
  expect(at('/notifications', false)).toBe(196);
  expect(at('/notifications', true)).toBe(196);
});
