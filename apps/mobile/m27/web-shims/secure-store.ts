// The web pass's stand-in for expo-secure-store: localStorage (a test build on a test server only).
const k = (key: string): string => `m27.secure.${key}`;
export async function getItemAsync(key: string): Promise<string | null> { try { return globalThis.localStorage?.getItem(k(key)) ?? null; } catch { return null; } }
export async function setItemAsync(key: string, value: string): Promise<void> { try { globalThis.localStorage?.setItem(k(key), value); } catch { /* blocked */ } }
export async function deleteItemAsync(key: string): Promise<void> { try { globalThis.localStorage?.removeItem(k(key)); } catch { /* blocked */ } }
export function getItem(key: string): string | null { try { return globalThis.localStorage?.getItem(k(key)) ?? null; } catch { return null; } }
export function setItem(key: string, value: string): void { void setItemAsync(key, value); }
export async function isAvailableAsync(): Promise<boolean> { return true; }
export const WHEN_UNLOCKED = 0;
export const AFTER_FIRST_UNLOCK = 1;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 2;
export const ALWAYS = 3;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 4;
export const ALWAYS_THIS_DEVICE_ONLY = 5;
