// The Studio's route table: which page opens at each web address.
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
import { Demographics } from './pages/Demographics';
import { Announcements } from './pages/Announcements';
import { Polls } from './pages/Polls';
import { Settings } from './pages/Settings';
import { Tips } from './pages/Tips';
import { TranscriptReports } from './pages/TranscriptReports';
import { NewEpisode } from './pages/NewEpisode';
import type { Show } from './api';
import { NoShow } from './pages/NoShow';
import { Invite } from './pages/Invite';
import { Media } from './pages/Media';
import { SignIn } from './pages/SignIn';
import { AdminLayout } from './pages/admin/AdminLayout';
import { Activity } from './pages/admin/Activity';
import { Dashboard } from './pages/admin/Dashboard';
import { Picks } from './pages/admin/Picks';
import { Curated } from './pages/admin/Curated';
import { DiscoverControl } from './pages/admin/Discover';
import { Launch } from './pages/admin/Launch';
import { Accounts } from './pages/admin/Accounts';
import { Users } from './pages/admin/Users';
import { Reports } from './pages/admin/Reports';

/** Route table. Each later story adds its page next to `home` (tasks.md T012). */
export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/no-show" element={<Signed><NoShow /></Signed>} />
      <Route path="/invite/:token" element={<Signed><Invite /></Signed>} />
      <Route path="/s/:show/media" element={<Signed><ShowPage page={(s) => <Media show={s} />} /></Signed>} />
      <Route path="/s/:show/home" element={<Signed><ShowPage page={(s) => <Home show={s} />} /></Signed>} />
      <Route path="/s/:show/data" element={<Signed><ShowPage page={(s) => <Data show={s} />} /></Signed>} />
      <Route path="/s/:show/episodes" element={<Signed><ShowPage page={(s) => <Episodes show={s} />} /></Signed>} />
      <Route path="/s/:show/episodes/new" element={<Signed><ShowPage page={(s) => <NewEpisode show={s} />} /></Signed>} />
      <Route path="/s/:show/episodes/:id" element={<Signed><ShowPage page={(s) => <Episode show={s} />} /></Signed>} />
      <Route path="/s/:show/subscribers" element={<Signed><ShowPage page={(s) => <Subscribers show={s} />} /></Signed>} />
      <Route path="/s/:show/subscribers/:tab" element={<Signed><ShowPage page={(s) => <Subscribers show={s} />} /></Signed>} />
      <Route path="/s/:show/demographics" element={<Signed><ShowPage page={(s) => <Demographics show={s} />} /></Signed>} />
      <Route path="/s/:show/announcements" element={<Signed><ShowPage page={(s) => <Announcements show={s} />} /></Signed>} />
      <Route path="/s/:show/polls" element={<Signed><ShowPage page={(s) => <Polls show={s} />} /></Signed>} />
      <Route path="/s/:show/tips" element={<Signed><ShowPage page={(s) => <Tips show={s} />} /></Signed>} />
      <Route path="/s/:show/settings" element={<Signed><ShowPage page={(s) => <Settings show={s} />} /></Signed>} />
      <Route path="/s/:show/settings/:tab" element={<Signed><ShowPage page={(s) => <Settings show={s} />} /></Signed>} />
      <Route path="/s/:show/comments" element={<Signed><ShowPage page={(s) => <Comments show={s} />} /></Signed>} />
      <Route path="/s/:show/transcript-reports" element={<Signed><ShowPage page={(s) => <TranscriptReports show={s} />} /></Signed>} />
      {/* M15 T005: Admin lives outside /s/:show, so it works with no show. The server decides who gets in. */}
      <Route path="/admin" element={<Signed><AdminLayout /></Signed>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="activity" element={<Activity />} />
        <Route path="picks" element={<Picks />} />
        <Route path="curated" element={<Curated />} />
        <Route path="discover" element={<DiscoverControl />} />
        <Route path="launch" element={<Launch />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="users" element={<Users />} />
        <Route path="reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
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
