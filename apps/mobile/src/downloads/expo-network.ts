/** The `Network` (contracts/downloader.ts) on expo-network 58 — research R6. Only importer. */
import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType } from 'expo-network';
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
    // Gap 4 (2026-09-21, build 3): Wi-Fi off paused the transfer in 1 s; Wi-Fi back
    // left it "Paused at 29 %" for good — nothing ticked the manager. This does.
    onChange(fn) {
      const sub = addNetworkStateListener(() => fn());
      return () => sub.remove();
    },
  };
}
