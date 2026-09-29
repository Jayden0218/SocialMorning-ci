import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { useSession } from './session';
import { Layout } from './shell/Layout';
import { Loading } from './shell/States';
import { Home } from './pages/Home';
import { NoShow } from './pages/NoShow';
import { SignIn } from './pages/SignIn';

/** Route table. Each later story adds its page next to `home` (tasks.md T012). */
export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/no-show" element={<Signed><NoShow /></Signed>} />
      <Route path="/s/:show/home" element={<Signed><ShowPage /></Signed>} />
      <Route path="*" element={<Signed><FirstShow /></Signed>} />
    </Routes>
  );
}

function Signed({ children }: { children: ReactElement }) {
  const { session } = useSession();
  const loc = useLocation();
  if (session.state === 'loading') return <div className="main"><Loading label="Signing in" /></div>;
  if (session.state === 'out') return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return children;
}

function FirstShow() {
  const { session } = useSession();
  if (session.state !== 'in') return null;
  const first = session.shows[0];
  return <Navigate to={first ? `/s/${first.key}/home` : '/no-show'} replace />;
}

function ShowPage() {
  const { session } = useSession();
  const { show: key } = useParams();
  if (session.state !== 'in') return null;
  const show = session.shows.find((s) => s.key === key);
  if (!show) return <Navigate to="/" replace />;
  return <Layout show={show}><Home show={show} /></Layout>;
}
