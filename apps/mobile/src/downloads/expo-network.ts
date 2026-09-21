/** The `Network` (contracts/downloader.ts) on expo-network 58 — research R6. Only importer. */
import { getNetworkStateAsync, NetworkStateType } from 'expo-network';
import type { Network } from './types';

export function createExpoNetwork(): Network {
  return {
    async kind() {
      try {
        const s = await getNetworkStateAsync();
        if (!s.isConnected) return 'none';
        if (s.type === NetworkStateType.WIFI || s.type === NetworkStateType.ETHERNET) return 'wifi';
        if (s.type === NetworkStateType.CELLULAR) return 'cellular';
        // UNKNOWN / VPN / OTHER while connected: treat as Wi-Fi-like rather than blocking (R6).
        return s.type === NetworkStateType.NONE ? 'none' : 'wifi';
      } catch {
        return 'none';
      }
    },
  };
}
