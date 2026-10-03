// Gives the server address set in the app config.
/** Where the app finds the server: the address set in app.json. */
import Constants from 'expo-constants';

/** `extra.apiBaseUrl` from app.json; the Android emulator's host alias otherwise. */
export function apiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  return extra.apiBaseUrl ?? 'http://10.0.2.2:3000';
}
