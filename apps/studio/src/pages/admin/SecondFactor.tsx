// The Admin second step: a code emailed to the owner, with "remember this browser for 30 days".
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, HttpError } from '../../api';

/**
 * M25 lane SB. Shown in place of an Admin page when the server answers `second_factor`: this
 * session signed in with a password and has not proved the owner's inbox yet. A code is sent when
 * the step opens (once); "Send a new code" asks again (30 s apart). `onDone` reloads the page.
 */
export function SecondFactor({ email, onDone }: { email: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  async function send() {
    setError(null);
    try {
      await api('/v1/studio/second-factor/send', { method: 'POST' });
      setNote(`We emailed a 6-digit code to ${email}. It works for 10 minutes.`);
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'The code could not be sent. Try again.');
    }
  }

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void send();
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    api('/v1/studio/second-factor/verify', { method: 'POST', body: { code, remember } })
      .then(() => onDone())
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'Something went wrong. Try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <section className="panel" aria-labelledby="sf-title" style={{ maxWidth: 440 }}>
      <h1 id="sf-title">Enter the code</h1>
      <p className="muted" style={{ marginTop: 0 }}>Admin asks for a code from your email once on each new browser, as well as your password.</p>
      {note ? <p role="status">{note}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="sf-code">6-digit code</label>
          <input id="sf-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </div>
        <label className="radio"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this browser for 30 days</label>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
          <button className="btn btn-quiet" type="button" onClick={() => { void send(); }}>Send a new code</button>
        </div>
      </form>
    </section>
  );
}
