/** The real `NotifyApi`: expo-notifications. Kept apart so tests never load the native module. */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { NotifyApi, PermissionState } from './permission';

export const expoNotify: NotifyApi = {
  os: Platform.OS,
  status: async () => `${(await Notifications.getPermissionsAsync()).status}` as PermissionState,
  createChannel: () => Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.DEFAULT,
  }),
  request: () => Notifications.requestPermissionsAsync(),
};
