import type { ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { useSession } from './session';
import { Layout } from './shell/Layout';
import { Loading } from './shell/States';
import { Home } from './pages/Home';
import { Data } from './pages/Data';
import { Episodes } from './pages/Episodes';
import { Episode } from './pages/Episode';
import { Comments } from './pages/Comments';
import { Subscribers } from './pages/Subscribers';
import type { Show } from './api';
import { NoShow } from './pages/NoShow';
import { SignIn } from './pages/SignIn';

/** Route table. Each later story adds its page next to `home` (tasks.md T012). */
export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/no-show" element={<Signed><NoShow /></Signed>} />
      <Route path="/s/:show/home" element={<Signed><ShowPage page={(s) => <Home show={s} />} /></Signed>} />
      <Route path="/s/:show/data" element={<Signed><ShowPage page={(s) => <Data show={s} />} /></Signed>} />
      <Route path="/s/:show/episodes" element={<Signed><ShowPage page={(s) => <Episodes show={s} />} /></Signed>} />
      <Route path="/s/:show/episodes/:id" element={<Signed><ShowPage page={(s) => <Episode show={s} />} /></Signed>} />
      <Route path="/s/:show/subscribers" element={<Signed><ShowPage page={(s) => <Subscribers show={s} />} /></Signed>} />
      <Route path="/s/:show/subscribers/:tab" element={<Signed><ShowPage page={(s) => <Subscribers show={s} />} /></Signed>} />
      <Route path="/s/:show/comments" element={<Signed><ShowPage page={(s) => <Comments show={s} />} /></Signed>} />
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

function ShowPage({ page }: { page: (s: Show) => ReactElement }) {
  const { session } = useSession();
  const { show: key } = useParams();
  if (session.state !== 'in') return null;
  const show = session.shows.find((s) => s.key === key);
  if (!show) return <Navigate to="/" replace />;
  return <Layout show={show}>{page(show)}</Layout>;
}
