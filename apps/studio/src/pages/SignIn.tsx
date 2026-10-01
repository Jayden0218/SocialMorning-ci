import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, HttpError, REAUTH_MESSAGE, startSession } from '../api';
import { useSession } from '../session';

type Mode = 'password' | 'code';

/** One account for the app and the Studio (FR-002): the same sign-in, labelled `studio-web`. */
export function SignIn() {
  const { signedIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(token: string) {
    const { me, shows, isAdmin, actingAs } = await startSession(token);
    signedIn(me, shows, { isAdmin: isAdmin ?? false, actingAs: actingAs ?? null });
    const next = params.get('next');
    // M15: `/admin…` is a place to come back to as well.
    navigate(next && /^\/((s|invite)\/|admin(\/|$))/.test(next) ? next : shows[0] ? `/s/${shows[0].key}/home` : '/no-show', { replace: true });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const onPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ token: string }>('/v1/auth/sign-in', { method: 'POST', body: { email, password, deviceLabel: 'studio-web' }, token: '' });
      await finish(r.token);
    });
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!codeSent) {
        await api('/v1/auth/code', { method: 'POST', body: { email }, token: '' });
        setCodeSent(true);
        return;
      }
      const r = await api<{ token?: string; needsName?: boolean }>('/v1/auth/code/verify', { method: 'POST', body: { email, code, deviceLabel: 'studio-web' }, token: '' });
      if (r.needsName || !r.token) throw new HttpError(409, 'finish_in_app', 'There is no SocialMorning account with this email yet. Create it in the app first, then claim your show there.');
      await finish(r.token);
    });
  };

  return (
    <main className="auth">
      <section className="auth-art" aria-hidden="true">
        <div className="brand"><span className="brand-mark" style={{ background: 'var(--on-fill)', color: 'var(--primary)' }}>S</span>SocialMorning Studio</div>
        <p className="auth-headline">Hear what your listeners hear.</p>
        <ul>
          <li>Plays, completion and the moments people react to</li>
          <li>Every comment, answered as the host</li>
          <li>Your feed stays yours — nothing is uploaded</li>
        </ul>
      </section>
      <section className="auth-form">
        <div className="panel">
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 0 }}>Use the account you use in the SocialMorning app.</p>
          <div className="tabs" role="tablist" aria-label="Sign-in method" style={{ margin: '16px 0 20px' }}>
            <button type="button" role="tab" className="tab" aria-selected={mode === 'code'} onClick={() => { setMode('code'); setError(null); }}>Email code</button>
            <button type="button" role="tab" className="tab" aria-selected={mode === 'password'} onClick={() => { setMode('password'); setError(null); }}>Password</button>
          </div>
          {params.get('reason') === 'reauth' ? <p className="error" role="status">{REAUTH_MESSAGE}. For safety, Admin asks every 12 hours.</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {mode === 'password' ? (
            <form onSubmit={onPassword}>
              <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          ) : (
            <form onSubmit={onCode}>
              <div className="field"><label htmlFor="email-c">Email</label><input id="email-c" type="email" autoComplete="email" required value={email} disabled={codeSent} onChange={(e) => setEmail(e.target.value)} /></div>
              {codeSent ? (
                <div className="field">
                  <label htmlFor="code">6-digit code</label>
                  <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                  <span className="muted" style={{ fontSize: 13 }}>We sent it to {email}. <button type="button" className="linkish" onClick={() => { setCodeSent(false); setCode(''); }}>Use another email</button></span>
                </div>
              ) : null}
              <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'One moment…' : codeSent ? 'Sign in' : 'Email me a code'}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
