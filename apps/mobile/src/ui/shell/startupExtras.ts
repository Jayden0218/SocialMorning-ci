// Small start-up jobs: hold phones in portrait, app-icon shortcuts, the maintenance check, What's new, vibration and lock-screen skip settings.
/**
 * M22 lane 6 (US16 T069, US17 T072 T074 T075 T079), called once from app/_layout.tsx so the root
 * layout keeps one line for all of them.
 *
 *  - Phones (shortest SCREEN side < 600 pt) are locked to portrait; tablets turn with the device
 *    (app.json `orientation: "default"`, `ios.requireFullScreen: false`, research R14).
 *  - App-icon shortcuts (long-press the icon): History, Subscriptions, Playlist, Search. iOS also
 *    has them before the first start (app.json, expo-quick-actions `iosActions`); here they are
 *    set for both platforms and a tap navigates to the action's `href`.
 *  - Maintenance: `/v1/health` may carry `maintenance: { until, message }` (apps/api/src/app.ts);
 *    then the calm page `app/maintenance.tsx` opens. Downloads stay playable from there. Mid-session,
 *    an API call answered 503 with a maintenance body opens it too (`setMaintenanceListener`, src/social/api.ts).
 *  - What's new (Android APK copies, T077): the first start on a new version opens
 *    app/settings/updates.tsx once with the release's notes (`updates.lastSeenVersion`).
 *  - The Vibration switch and the ±5 min lock-screen skip are applied from their settings.
 *
 * expo-screen-orientation and expo-quick-actions are native: they are loaded lazily, and a build
 * made before they were added simply skips that job (as src/ui/kit/haptics.ts does).
 */
import { useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import type { SettingsStore } from '@/storage/types';
import { apiBaseUrl } from '@/social/base-url';
import { setMaintenanceListener } from '@/social/api';
import { hapticsOn, setHapticsEnabled } from '@/ui/kit/haptics';
import { lockSkipSeconds } from '@/settings/playback';
import { setLockScreenSkipSeconds } from '@/playback/expo-audio-adapter';
import { PHONE_SHORT_SIDE } from './useLayout';

type Orientation = { lockAsync(lock: number): Promise<void>; OrientationLock: { PORTRAIT_UP: number } };
type QuickAction = { id: string; title: string; icon?: string | null; params?: Record<string, string | number | boolean | null | undefined> | null };
type QuickActions = {
  initial?: QuickAction;
  setItems(items: QuickAction[]): Promise<void>;
  addListener(listener: (action: QuickAction) => void): { remove: () => void };
};

function optional<T>(load: () => unknown): T | null {
  try { return load() as T; } catch { return null; }
}

/** The four shortcuts. `icon` names are iOS built-ins; Android shows the app icon. */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'history', title: 'History', icon: 'time', params: { href: '/history' } },
  { id: 'subscriptions', title: 'Subscriptions', icon: 'bookmark', params: { href: '/subscriptions' } },
  { id: 'playlist', title: 'Playlist', icon: 'audio', params: { href: '/queue' } },
  { id: 'search', title: 'Search', icon: 'search', params: { href: '/search' } },
];

/** A shortcut's page, or undefined for anything that is not one of ours. */
export function quickActionHref(action: QuickAction | undefined): string | undefined {
  const href = action?.params?.href;
  return typeof href === 'string' && QUICK_ACTIONS.some((a) => a.params?.href === href) ? href : undefined;
}

export type Maintenance = { until: string; message: string };
let maintenance: Maintenance | undefined;

/** What the server last said about maintenance (read by app/maintenance.tsx). */
export function maintenanceInfo(): Maintenance | undefined {
  return maintenance;
}

/** `/v1/health`'s maintenance field, or undefined when it is missing or malformed. */
export function parseMaintenance(body: unknown): Maintenance | undefined {
  const m = (body as { maintenance?: { until?: unknown; message?: unknown } } | null)?.maintenance;
  if (!m || typeof m.until !== 'string' || typeof m.message !== 'string') return undefined;
  return { until: m.until, message: m.message };
}

/** T077: the APK releases (scripts/release.sh publishes them on the public CI mirror). */
export const RELEASES_LATEST = 'https://api.github.com/repos/Jayden0218/SocialMorning-ci/releases/latest';
export const LAST_SEEN_VERSION_KEY = 'updates.lastSeenVersion';

export type Release = { version: string; notes: string; pageUrl: string; apkUrl?: string };

/** GitHub's `releases/latest` body → what the page shows; undefined when it is not one. */
export function parseRelease(body: unknown): Release | undefined {
  const b = body as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown } | null;
  if (!b || typeof b.tag_name !== 'string' || typeof b.html_url !== 'string') return undefined;
  const assets = Array.isArray(b.assets) ? (b.assets as { name?: unknown; browser_download_url?: unknown }[]) : [];
  const apk = assets.find((a) => typeof a.name === 'string' && a.name.endsWith('.apk') && typeof a.browser_download_url === 'string');
  return {
    version: b.tag_name.replace(/^v/i, ''),
    notes: typeof b.body === 'string' ? b.body.trim() : '',
    pageUrl: b.html_url,
    ...(apk ? { apkUrl: apk.browser_download_url as string } : {}),
  };
}

/** Is `candidate` (e.g. "0.2.0", "m22-1.0.3") a later x.y.z than `current`? Unreadable → false. */
export function isNewer(candidate: string, current: string): boolean {
  const parts = (v: string): number[] | undefined => {
    const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : undefined;
  };
  const a = parts(candidate);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

/** What's new is due when a version was seen before and this one differs (not on a first install). */
export function whatsNewDue(lastSeen: string | undefined, current: string): boolean {
  return lastSeen !== undefined && lastSeen !== '' && lastSeen !== current;
}

/** T077: opens the updates page once after an update (Android only). */
function useWhatsNew(settings: SettingsStore): void {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const current = Constants.expoConfig?.version;
    if (!current) return;
    const due = whatsNewDue(settings.get(LAST_SEEN_VERSION_KEY), current);
    settings.set(LAST_SEEN_VERSION_KEY, current);
    if (due) setTimeout(() => router.navigate('/settings/updates?whatsNew=1' as never), 0);
  }, [router, settings]);
}

/** Holds a phone in portrait; a tablet is left free to turn. */
function useOrientationLock(): void {
  useEffect(() => {
    const screen = Dimensions.get('screen');
    if (Math.min(screen.width, screen.height) >= PHONE_SHORT_SIDE) return;
    const mod = optional<Orientation>(() => require('expo-screen-orientation'));
    void mod?.lockAsync(mod.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);
}

/** T075: sets the shortcuts and opens the page of the one that was tapped (also on a cold start). */
export function useQuickActionRouting(): void {
  const router = useRouter();
  useEffect(() => {
    const mod = optional<QuickActions>(() => require('expo-quick-actions'));
    if (!mod) return;
    // Android has no built-in icon names (it would look for a drawable): the app icon is shown.
    const items = Platform.OS === 'ios' ? [...QUICK_ACTIONS] : QUICK_ACTIONS.map(({ icon: _icon, ...a }) => a);
    void mod.setItems(items).catch(() => undefined);
    let live = true;
    const go = (action: QuickAction | undefined) => {
      const href = quickActionHref(action);
      // After this frame: on a cold start the stack must be mounted before it is navigated.
      if (href) setTimeout(() => { if (live) router.navigate(href as never); }, 0);
    };
    go(mod.initial);
    const sub = optional<{ remove: () => void }>(() => mod.addListener(go));
    return () => { live = false; sub?.remove(); };
  }, [router]);
}

/** T079: asks the server once at start-up; maintenance opens the maintenance page. */
function useMaintenanceCheck(): void {
  const router = useRouter();
  useEffect(() => {
    let live = true;
    void fetch(`${apiBaseUrl()}/v1/health`)
      .then((r) => r.json())
      .then((body: unknown) => {
        maintenance = parseMaintenance(body);
        if (live && maintenance) router.navigate('/maintenance' as never);
      })
      .catch(() => undefined);
    // Mid-session: any API call answered 503 with a maintenance body opens the page too — at most
    // once a minute, so a screen's burst of failing calls opens it once. Downloads still play there.
    let openedAt = -Infinity;
    setMaintenanceListener((body) => {
      maintenance = maintenanceFromBody(body);
      if (!live || Date.now() - openedAt < MAINTENANCE_REOPEN_MS) return;
      openedAt = Date.now();
      router.navigate('/maintenance' as never);
    });
    return () => { live = false; setMaintenanceListener(undefined); };
  }, [router]);
}

const MAINTENANCE_REOPEN_MS = 60_000;

/** A 503 body → what the page shows: `{ maintenance: {…} }`, or `until`/`message` at the top, or just the message. */
export function maintenanceFromBody(body: Record<string, unknown>): Maintenance {
  const top = parseMaintenance(body) ?? parseMaintenance({ maintenance: body });
  if (top) return top;
  return { until: '', message: typeof body['message'] === 'string' ? body['message'] : 'SocialNet is being updated.' };
}

export function useStartupExtras(settings: SettingsStore): void {
  useOrientationLock();
  useQuickActionRouting();
  useMaintenanceCheck();
  useWhatsNew(settings);
  useEffect(() => {
    setHapticsEnabled(hapticsOn(settings));
    setLockScreenSkipSeconds(lockSkipSeconds(settings));
  }, [settings]);
}
