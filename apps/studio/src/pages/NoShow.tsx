import { useSession } from '../session';

/** Spec US1 scenario 2: signed in, but no proven claim — say how to get one, show no data. */
export function NoShow() {
  const { session, signOut } = useSession();
  return (
    <main className="auth-form" style={{ minHeight: '100%' }}>
      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="brand" style={{ padding: 0, marginBottom: 24 }}><span className="brand-mark" aria-hidden="true">S</span>SocialMorning Studio</div>
        <h1 style={{ fontSize: 28, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Claim your show first</h1>
        <p className="muted">
          {session.state === 'in' ? `${session.me.displayName}, you` : 'You'} do not manage a show yet. The Studio opens once you prove a feed is yours:
        </p>
        <ol style={{ lineHeight: 1.8, paddingLeft: 20 }}>
          <li>In the SocialMorning app, open <strong>Me → Creator centre</strong>.</li>
          <li>Enter your feed's address and copy the code you are given.</li>
          <li>Put the code anywhere in your feed (the show description works), publish, then tap <strong>Verify</strong>.</li>
          <li>Come back here and sign in again.</li>
        </ol>
        <p className="muted">Someone else owns the show? Ask them to add you as an operator.</p>
        <button type="button" className="btn btn-quiet" onClick={() => { void signOut(); }}>Sign out</button>
      </div>
    </main>
  );
}
