// Which bars are showing under a toast, so the toast sits just above them.
/**
 * M31 integration (L5; design-pulse2 §Bars): on the tab screens the toast clears the tab bar and
 * the now bar (176 on a 34 pt inset), on the player the tray (112), on a pushed page less. The
 * rule is the one the bars themselves use: `miniPlayerShows` for the now bar, `TAB_ROUTES` for the
 * tab bar, and the Moments view hides the now bar (`nowbar-signals`).
 */
import { createElement } from 'react';
import { usePathname } from 'expo-router';
import { ToastHost } from '@/ui/kit/ToastHost';
import { usePlayerSelector } from '@/playback/store';
import { miniPlayerShows, TAB_ROUTES } from '@/ui/player/MiniPlayer';
import { useNowBarSignals } from '@/ui/player/nowbar-signals';

export type ToastPlacement = { tabs: boolean; now: boolean; player: boolean; foot?: 'page' | 'send' | 'digest' | 'search' | 'appeal' | 'gift' | 'profile'; composer?: 'comments' | 'replies' | 'clip' | 'voice' | 'transcript' | 'status'; updates?: boolean };

/** Pure: the bars for a route. */
export function toastPlacement(path: string, idle: boolean, momentsOnScreen: boolean): ToastPlacement {
  const tabs = TAB_ROUTES.includes(path);
  // M31 W3-A (T040): the Episode page has the player's thumb zone — a tray at the foot, no now bar — and its toasts are 112 up too
  // (design-pulse2 toast--episode-page: "Always 112 from the bottom on this page (above the tray)").
  const player = path === '/player' || path.startsWith('/episode/');
  // The Comments pages (design-pulse2 social.html comments--toast 196, comment-thread--toast 176):
  // the composer fills the bottom, so the toast sits above it (the thread route first: it is under /comments).
  // M31 W3-B: the New clip page (toast--clip-new, 130) and the voice status page (voice-new--toast, 124) have a tall bottom zone too.
  // M31 F2a (social.html chat-thread--toast 176, notifications--toast 196): a chat thread has its message box at the foot (the replies' 176),
  // Notifications its tall bottom zone (the comments' 196). `/chat/new` is the New chat page, not a thread: it keeps the pushed-page rule.
  const composer = path.startsWith('/chat/') && path !== '/chat/new' ? 'replies' : path === '/notifications' ? 'comments' : path.startsWith('/comments/thread/') ? 'replies' : path.startsWith('/comments/') || path === '/comments' ? 'comments' : path === '/clip/new' ? 'clip' : path === '/voice/new' || path === '/status/text' ? 'voice' : path.startsWith('/status/') ? 'status' : path.startsWith('/transcript/') ? 'transcript' : undefined;
  if (composer !== undefined) return { tabs: false, now: false, player: false, composer };
  // M31 F8: pushed pages with the title bar (and a foot button) at the foot — the toast clears them (README wave-5 defect 1).
  const foot: ToastPlacement['foot'] = /^\/settings\/(feedback|network)$/.test(path) ? 'send' : path.startsWith('/digest/') ? 'digest' : path === '/search' ? 'search'
    : path === '/appeal' ? 'appeal' : path.startsWith('/gift/') ? 'gift' : path.startsWith('/profile/') && !/^\/profile\/(edit|[^/]+\/)/.test(path) ? 'profile'
    : /^\/settings\/(devices|downloads|minor|not-interested|opml|privacy|queue-backups)$/.test(path) || path.startsWith('/report/') ? 'page' : undefined;
  const now = !player && !momentsOnScreen && miniPlayerShows(path, tabs ? 'tabs' : 'root', idle);
  if (foot !== undefined) return { tabs, now, player, foot };
  // M31 F9: the Updates tab (design-pulse2 discover.html `toast--library`, 300 over both bars).
  return path === '/library' ? { tabs, now, player, updates: true } : { tabs, now, player };
}

export function useToastPlacement(): ToastPlacement {
  const path = usePathname();
  const idle = usePlayerSelector((s) => s.kind === 'idle');
  const { moments } = useNowBarSignals();
  return toastPlacement(path, idle, moments);
}

/** The app's toast host with its lift following the bars on screen. */
export function PlacedToastHost(props: { message: string | undefined }): React.ReactElement | null {
  return createElement(ToastHost, { message: props.message, placement: useToastPlacement() });
}
