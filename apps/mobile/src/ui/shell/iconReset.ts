// Puts the app icon back to Default at start-up when PLUS has ended and one of the PLUS icons is still set.
/**
 * M22 US17 (alternate icons). The four own icons (modules/alternate-icons) are a PLUS extra; when
 * the server says PLUS is over (`api.me().plus` is not true), the next start resets the icon to
 * Default, once per start. Nothing happens when the build has no icon module, the icon is already
 * Default, the listener is signed out, or the server cannot be reached (PLUS is unknown then).
 * On Android the launcher may close the app while it swaps the icon — NOT VERIFIED on a phone.
 */
import { useEffect } from 'react';
import * as AltIcons from '../../../modules/alternate-icons';
import { useSocial } from '@/social/context';

let checked = false;

/** Resets when `plus` is false and an own icon is in use; true when it reset. */
export async function resetIconIfPlusEnded(plus: () => Promise<boolean>): Promise<boolean> {
  if (!AltIcons.isAvailable()) return false;
  if ((await AltIcons.currentIcon()) === null) return false;
  if (await plus()) return false;
  return AltIcons.setIcon(null);
}

export function useIconReset(): void {
  const { api, listener } = useSocial();
  const signedIn = listener !== undefined;
  useEffect(() => {
    if (!signedIn || checked) return;
    checked = true;
    void resetIconIfPlusEnded(async () => (await api.me()).plus === true).catch(() => undefined);
  }, [api, signedIn]);
}
