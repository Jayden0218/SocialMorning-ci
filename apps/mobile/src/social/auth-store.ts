// Handles sign-up, sign-in and sign-out, and stores the account.
/**
 * Accounts on the phone (FR-001..004). The token goes to secure storage, the
 * listener row to SQLite's `auth` table; both are cleared together on sign-out.
 * Pure orchestration over injected pieces so the tests run without a device.
 */
import type { ApiClient, Listener } from './api';
import type { AuthRow, Stores } from '@/storage/types';

export type TokenStore = {
  get(): Promise<string | undefined>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
};

export type AuthDeps = {
  api: ApiClient;
  stores: Pick<Stores, 'auth' | 'drafts'> & Partial<Pick<Stores, 'hidden' | 'blocks'>>;
  token: TokenStore;
  now: () => number;
  /** Called after a successful sign-in so M3's position sync can merge (T057). */
  onSignedIn?: (listener: Listener) => Promise<void> | void;
  /** M22 US11/US15: the whole sign-in answer — `pendingDeletion` for the Keep sheet; the time zone is sent from here. Never throws into sign-in. */
  onAccepted?: (r: { token: string; listener: Listener; pendingDeletion?: { dueAt: string } | null }) => void;
};

export type AuthApi = {
  current(): AuthRow | undefined;
  signUp(email: string, password: string, displayName: string): Promise<AuthRow>;
  signIn(email: string, password: string): Promise<AuthRow>;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
  /** Owner, 2026-09-27: the code ways in. 'needsName' = a right code for a new email. */
  requestCode(email: string): Promise<{ resendAfterSeconds: number }>;
  signInWithCode(email: string, code: string, displayName?: string): Promise<AuthRow | 'needsName'>;
  deleteAccountWithCode(code: string): Promise<void>;
};

export function createAuth(deps: AuthDeps): AuthApi {
  async function accept(r: { token: string; listener: Listener }): Promise<AuthRow> {
    await deps.token.set(r.token);
    deps.stores.auth.set({ listenerId: r.listener.id, displayName: r.listener.displayName, email: r.listener.email }, deps.now());
    try { deps.onAccepted?.(r); } catch { /* M22: a side note must never undo a sign-in */ }
    await deps.onSignedIn?.(r.listener);
    return deps.stores.auth.get()!;
  }

  async function forget(): Promise<void> {
    await deps.token.clear();
    deps.stores.auth.clear();
  }

  return {
    current: () => deps.stores.auth.get(),
    signUp: async (email, password, displayName) => accept(await deps.api.signUp(email, password, displayName)),
    signIn: async (email, password) => accept(await deps.api.signIn(email, password)),
    async signOut() {
      // Tell the server first, but a dead network must not trap a listener in a session.
      try { await deps.api.signOut(); } catch { /* best effort */ }
      await forget();
      // Drafts are the listener's; the social cache is the episode's and stays (T048).
      deps.stores.drafts.clearAll();
      // M6: what this listener hid and blocked is theirs too.
      deps.stores.hidden?.clearAll();
      deps.stores.blocks?.clearAll();
    },
    requestCode: async (email) => ({ resendAfterSeconds: (await deps.api.requestCode(email)).resendAfterSeconds }),
    async signInWithCode(email, code, displayName) {
      const r = await deps.api.verifyCode(email, code, displayName);
      return 'needsName' in r ? 'needsName' : accept(r);
    },
    async deleteAccountWithCode(code) {
      await deps.api.deleteMeWithCode(code);
      await forget();
      deps.stores.drafts.clearAll();
      deps.stores.hidden?.clearAll();
      deps.stores.blocks?.clearAll();
    },
    async deleteAccount(password) {
      await deps.api.deleteMe(password);
      await forget();
      deps.stores.drafts.clearAll();
      deps.stores.hidden?.clearAll();
      deps.stores.blocks?.clearAll();
    },
  };
}
