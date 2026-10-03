/**
 * M17 (FR-015, research R8): whether in-app purchases are switched on, as the server last said
 * (`storeReady` on GET /v1/me/purchases and /v1/me/tips). Kept in settings so Me can decide,
 * without a network call, whether Wallet opens the page or the Coming soon pop-up. Unknown
 * counts as not ready — the pop-up's "Open Wallet" still reaches the page, which refreshes it.
 */
import type { SettingsStore } from '../storage/types';

export const STORE_READY_KEY = 'store.ready';

export function readStoreReady(s: Pick<SettingsStore, 'get'>): boolean {
  return s.get(STORE_READY_KEY) === '1';
}

export function writeStoreReady(s: Pick<SettingsStore, 'set'>, ready: boolean): void {
  s.set(STORE_READY_KEY, ready ? '1' : '0');
}
