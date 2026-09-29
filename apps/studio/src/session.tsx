import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, bearer, whenSignedOut, type Me, type Show } from './api';

type Session =
  | { state: 'loading' }
  | { state: 'out' }
  | { state: 'in'; me: Me; shows: Show[] };

type Ctx = { session: Session; signedIn: (me: Me, shows: Show[]) => void; signOut: () => Promise<void> };

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Session }) {
  const [session, setSession] = useState<Session>(initial ?? { state: 'loading' });
  useEffect(() => {
    whenSignedOut(() => { bearer.set(null); setSession({ state: 'out' }); });
    if (initial) return;
    api<{ me: Me; shows: Show[] }>('/v1/studio/me').then(
      (r) => setSession({ state: 'in', me: r.me, shows: r.shows }),
      () => setSession({ state: 'out' }),
    );
  }, [initial]);
  const signedIn = useCallback((me: Me, shows: Show[]) => setSession({ state: 'in', me, shows }), []);
  const signOut = useCallback(async () => {
    try { await api('/v1/studio/session/sign-out', { method: 'POST' }); } catch { /* signing out anyway */ }
    bearer.set(null);
    setSession({ state: 'out' });
  }, []);
  return <SessionCtx.Provider value={{ session, signedIn, signOut }}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
