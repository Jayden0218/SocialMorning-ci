// Connects to the phone's notification system, safely if it is missing.
/**
 * The real `NotifyApi`: expo-notifications. Kept apart so tests never load the native module.
 *
 * Loaded on first use, not at import: a build made before expo-notifications was added
 * has no `ExpoPushTokenManager`, and a top-level import then throws while sign-in.tsx
 * loads — the route loses its default export and the page is gone (2026-09-27, iOS).
 * Loading it lazily was not enough: the package's own side-effect file still reaches for
 * the missing module and logs an ERROR. So the native module is checked FIRST, with
 * `requireOptionalNativeModule` (returns null, never throws), and the package is not
 * loaded at all without it. `askForNotifications` then returns 'failed' and signing in
 * carries on.
 */
import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NotifyApi, PermissionState } from './permission';
import { routeForPush } from './route';

type Notifications = typeof import('expo-notifications');
let loaded: Notifications | undefined;
const native = (): Notifications => {
  if (loaded) return loaded;
  if (!requireOptionalNativeModule('ExpoPushTokenManager')) throw new Error('expo-notifications is not in this build');
  return (loaded = require('expo-notifications') as Notifications);
};

export const expoNotify: NotifyApi = {
  os: Platform.OS,
  status: async () => `${(await native().getPermissionsAsync()).status}` as PermissionState,
  createChannel: async () => {
    await native().setNotificationChannelAsync('default', { name: 'General', importance: native().AndroidImportance.DEFAULT });
    // M22 US1: replies, likes, follows and statuses get their own channel, so a listener can mute them alone.
    await native().setNotificationChannelAsync('social', { name: 'Replies, likes and follows', importance: native().AndroidImportance.DEFAULT });
  },
  request: async () => native().requestPermissionsAsync(),
  pushToken: async () => {
    const n = native();
    if ((await n.getPermissionsAsync()).status !== 'granted') return undefined;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    return (await n.getExpoPushTokenAsync(projectId ? { projectId } : {})).data;
  },
};

/** M10b US3 / M22 US1: open the place a tapped notification names. Returns the unsubscribe, or a no-op without the module. */
export function onNotificationTap(open: (href: string) => void): () => void {
  try {
    const sub = native().addNotificationResponseReceivedListener((r) => {
      const href = routeForPush(r.notification.request.content.data);
      if (href) open(href);
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}
