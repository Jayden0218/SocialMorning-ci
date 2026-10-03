/**
 * M10b US3 — this device's push address, kept with the account (FR-008): registered when
 * the listener is signed in and has allowed notifications, removed at sign-out. The last
 * address sent is remembered so sign-out can remove exactly it.
 */
import type { SettingsStore } from '@/storage/types';

export const PUSH_TOKEN_KEY = 'push.token';

export type PushDeps = {
  token: () => Promise<string | undefined>;
  add: (token: string, platform: 'ios' | 'android') => Promise<void>;
  remove: (token: string) => Promise<void>;
  settings: SettingsStore;
  platform: string;
};

/** Sends the address if there is one; never throws (a push address is never worth failing sign-in over). */
export async function registerPush(d: PushDeps): Promise<'sent' | 'none' | 'failed'> {
  try {
    const t = await d.token();
    if (!t) return 'none';
    await d.add(t, d.platform === 'ios' ? 'ios' : 'android');
    d.settings.set(PUSH_TOKEN_KEY, t);
    return 'sent';
  } catch {
    return 'failed';
  }
}

export async function unregisterPush(d: Pick<PushDeps, 'remove' | 'settings'>): Promise<void> {
  const t = d.settings.get(PUSH_TOKEN_KEY);
  if (!t) return;
  try { await d.remove(t); } catch { /* signed out anyway; the server drops a dead token on its next send */ }
  d.settings.set(PUSH_TOKEN_KEY, '');
}
