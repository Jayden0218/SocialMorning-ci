import Constants from 'expo-constants';

/**
 * `extra.apiBaseUrl` from app.json; the Android emulator's host alias otherwise.
 * The listener journey (specs/015-e2e-journey) points a build at a local test server with
 * `EXPO_PUBLIC_API_BASE_URL`: Metro writes it into the JS bundle, so it reaches a Debug build
 * too — whose `expoConfig` is the one embedded when the app was compiled, not Metro's.
 * Unset in every production build.
 */
export function apiBaseUrl(): string {
  const test = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (test) return test;
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };
  return extra.apiBaseUrl ?? 'http://10.0.2.2:3000';
}
