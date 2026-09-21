/** A stable per-install id for `PUT /me/positions` (R5 ties, contracts/api.md). */
import * as SecureStore from 'expo-secure-store';

const KEY = 'sm.device';

export async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;
  const fresh = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  await SecureStore.setItemAsync(KEY, fresh);
  return fresh;
}
