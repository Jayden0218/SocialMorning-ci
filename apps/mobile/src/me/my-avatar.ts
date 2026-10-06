// My own profile photo for Me and Updates: the saved copy at once, refreshed from the server.
/**
 * M21 US8 (FR-073): Me drew initials only, because the signed-in row on the phone (`AuthRow`)
 * carries no photo. The photo's URL is kept in settings (`me.avatarUrl`) so Me and the Updates
 * "+" circle draw it at once, and it is re-read from `GET /v1/me` each time the page shows.
 * Signed out → no photo; a failed read keeps the saved copy.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import type { SettingsStore } from '@/storage/types';

export const MY_AVATAR_KEY = 'me.avatarUrl';

export function useMyAvatar(settings: SettingsStore, signedIn: boolean, me: () => Promise<{ avatarUrl?: string }>): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (signedIn ? settings.get(MY_AVATAR_KEY) || undefined : undefined));
  useFocusEffect(useCallback(() => {
    if (!signedIn) { setUrl(undefined); return; }
    let live = true;
    setUrl(settings.get(MY_AVATAR_KEY) || undefined);
    me().then((l) => {
      settings.set(MY_AVATAR_KEY, l.avatarUrl ?? '');
      if (live) setUrl(l.avatarUrl);
    }, () => undefined);
    return () => { live = false; };
  }, [settings, signedIn, me]));
  return url;
}
