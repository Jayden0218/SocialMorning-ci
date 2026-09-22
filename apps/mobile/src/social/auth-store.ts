/**
 * Accounts on the phone (FR-001..004). The token goes to secure storage, the
 * listener row to SQLite's `auth` table; both are cleared together on sign-out.
 * Pure orchestration over injected pieces so the tests run without a device.
 */
import type { ApiClient, Listener } from './api';
import type { AuthRow, Stores } from '../storage/types';

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
};

export type AuthApi = {
  current(): AuthRow | undefined;
  signUp(email: string, password: string, displayName: string): Promise<AuthRow>;
  signIn(email: string, password: string): Promise<AuthRow>;
  signOut(): Promise<void>;
  deleteAccount(password: string): Promise<void>;
};

export function createAuth(deps: AuthDeps): AuthApi {
  async function accept(r: { token: string; listener: Listener }): Promise<AuthRow> {
    await deps.token.set(r.token);
    deps.stores.auth.set({ listenerId: r.listener.id, displayName: r.listener.displayName, email: r.listener.email }, deps.now());
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
    async deleteAccount(password) {
      await deps.api.deleteMe(password);
      await forget();
      deps.stores.drafts.clearAll();
      deps.stores.hidden?.clearAll();
      deps.stores.blocks?.clearAll();
    },
  };
}
