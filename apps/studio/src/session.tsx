import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, bearer, whenSignedOut, type ActingAs, type Me, type Show, type StudioMe } from './api';

type Session =
  | { state: 'loading' }
  | { state: 'out' }
  | { state: 'in'; me: Me; shows: Show[]; isAdmin?: boolean; actingAs?: ActingAs };

type Extra = { isAdmin?: boolean | undefined; actingAs?: ActingAs | undefined };
type Ctx = {
  session: Session;
  /** `extra` left out keeps what the session already knew (a show list change is not a sign-in). */
  signedIn: (me: Me, shows: Show[], extra?: Extra) => void;
  signOut: () => Promise<void>;
  /** M15: read /v1/studio/me again — after "Act as" starts or stops. */
  refresh: () => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Session }) {
  const [session, setSession] = useState<Session>(initial ?? { state: 'loading' });
  useEffect(() => {
    whenSignedOut(() => { bearer.set(null); setSession({ state: 'out' }); });
    if (initial) return;
    api<StudioMe>('/v1/studio/me').then(
      (r) => setSession({ state: 'in', me: r.me, shows: r.shows, isAdmin: r.isAdmin ?? false, actingAs: r.actingAs ?? null }),
      () => setSession({ state: 'out' }),
    );
  }, [initial]);
  const signedIn = useCallback((me: Me, shows: Show[], extra?: Extra) => setSession((prev) => ({
    state: 'in', me, shows,
    isAdmin: extra?.isAdmin ?? (prev.state === 'in' ? prev.isAdmin : false) ?? false,
    actingAs: extra?.actingAs ?? (extra ? null : prev.state === 'in' ? prev.actingAs ?? null : null),
  })), []);
  const refresh = useCallback(async () => {
    const r = await api<StudioMe>('/v1/studio/me');
    setSession({ state: 'in', me: r.me, shows: r.shows, isAdmin: r.isAdmin ?? false, actingAs: r.actingAs ?? null });
  }, []);
  const signOut = useCallback(async () => {
    try { await api('/v1/studio/session/sign-out', { method: 'POST' }); } catch { /* signing out anyway */ }
    bearer.set(null);
    setSession({ state: 'out' });
  }, []);
  return <SessionCtx.Provider value={{ session, signedIn, signOut, refresh }}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
