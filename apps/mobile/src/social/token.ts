/**
 * The session token lives in expo-secure-store (Android Keystore-backed), never
 * in SQLite (data-model.md, "Phone"). This is the only file that imports it.
 */
import * as SecureStore from 'expo-secure-store';

export const TOKEN_KEY = 'sm.session';

export const secureToken = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY).then((v) => v ?? undefined),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
