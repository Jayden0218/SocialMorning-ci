// The Studio's route table: which page opens at each web address.
import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { useSession } from './session';
import { Layout } from './shell/Layout';
import { Loading } from './shell/States';
import type { Show } from './api';

/**
 * M23 T041: every page is its own download, fetched the first time its address opens. Admin pages
 * and the charts (recharts, used only by pages) never load for a creator who does not open them.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(async () => ({ default: (await load())[name] }));
}
const Home = page(() => import('./pages/Home'), 'Home');
const Data = page(() => import('./pages/Data'), 'Data');
const Episodes = page(() => import('./pages/Episodes'), 'Episodes');
const Episode = page(() => import('./pages/Episode'), 'Episode');
const Comments = page(() => import('./pages/Comments'), 'Comments');
const Bans = page(() => import('./pages/Bans'), 'Bans');
const Subscribers = page(() => import('./pages/Subscribers'), 'Subscribers');
const Demographics = page(() => import('./pages/Demographics'), 'Demographics');
const Announcements = page(() => import('./pages/Announcements'), 'Announcements');
const Polls = page(() => import('./pages/Polls'), 'Polls');
const Settings = page(() => import('./pages/Settings'), 'Settings');
const Tips = page(() => import('./pages/Tips'), 'Tips');
const Earnings = page(() => import('./pages/Earnings'), 'Earnings');
const TranscriptReports = page(() => import('./pages/TranscriptReports'), 'TranscriptReports');
const NewEpisode = page(() => import('./pages/NewEpisode'), 'NewEpisode');
const NoShow = page(() => import('./pages/NoShow'), 'NoShow');
const Invite = page(() => import('./pages/Invite'), 'Invite');
const Media = page(() => import('./pages/Media'), 'Media');
const SignIn = page(() => import('./pages/SignIn'), 'SignIn');
const AdminLayout = page(() => import('./pages/admin/AdminLayout'), 'AdminLayout');
const Activity = page(() => import('./pages/admin/Activity'), 'Activity');
const Dashboard = page(() => import('./pages/admin/Dashboard'), 'Dashboard');
const Picks = page(() => import('./pages/admin/Picks'), 'Picks');
const Curated = page(() => import('./pages/admin/Curated'), 'Curated');
const DiscoverControl = page(() => import('./pages/admin/Discover'), 'DiscoverControl');
const Launch = page(() => import('./pages/admin/Launch'), 'Launch');
const Accounts = page(() => import('./pages/admin/Accounts'), 'Accounts');
const Users = page(() => import('./pages/admin/Users'), 'Users');
const Reports = page(() => import('./pages/admin/Reports'), 'Reports');
const TranslationShows = page(() => import('./pages/admin/Translation'), 'TranslationShows');
const RedeemCodes = page(() => import('./pages/admin/Redeem'), 'Redeem'); // M24 lane A3
// M24 lane A1
const Appeals = page(() => import('./pages/admin/Appeals'), 'Appeals');
const Deletions = page(() => import('./pages/admin/Appeals'), 'Deletions');
const Safety = page(() => import('./pages/admin/Safety'), 'Safety');
const Notices = page(() => import('./pages/admin/Notices'), 'Notices');
const AppSettings = page(() => import('./pages/admin/AppSettings'), 'AppSettings'); // M25 lane AC
const ContentPages = page(() => import('./pages/admin/Content'), 'Content'); // M25 lane AC

/** While a page's download arrives: the same loading line every block uses. */
function Wait({ children }: { children: ReactElement }) {
  return <Suspense fallback={<Loading label="Opening the page" />}>{children}</Suspense>;
}

/** Route table. Each later story adds its page next to `home` (tasks.md T012). */
export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<Wait><SignIn /></Wait>} />
      <Route path="/no-show" element={<Signed><Wait><NoShow /></Wait></Signed>} />
      <Route path="/invite/:token" element={<Signed><Wait><Invite /></Wait></Signed>} />
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
      <Route path="/s/:show/earnings" element={<Signed><ShowPage page={(s) => <Earnings show={s} />} /></Signed>} />
      <Route path="/s/:show/comments" element={<Signed><ShowPage page={(s) => <Comments show={s} />} /></Signed>} />
      <Route path="/s/:show/comments/:tab" element={<Signed><ShowPage page={(s) => <Comments show={s} />} /></Signed>} />
      <Route path="/s/:show/bans" element={<Signed><ShowPage page={(s) => <Bans show={s} />} /></Signed>} />
      <Route path="/s/:show/transcript-reports" element={<Signed><ShowPage page={(s) => <TranscriptReports show={s} />} /></Signed>} />
      {/* M15 T005: Admin lives outside /s/:show, so it works with no show. The server decides who gets in. */}
      <Route path="/admin" element={<Signed><Wait><AdminLayout /></Wait></Signed>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Wait><Dashboard /></Wait>} />
        <Route path="activity" element={<Wait><Activity /></Wait>} />
        <Route path="picks" element={<Wait><Picks /></Wait>} />
        <Route path="curated" element={<Wait><Curated /></Wait>} />
        <Route path="discover" element={<Wait><DiscoverControl /></Wait>} />
        <Route path="launch" element={<Wait><Launch /></Wait>} />
        <Route path="accounts" element={<Wait><Accounts /></Wait>} />
        <Route path="users" element={<Wait><Users /></Wait>} />
        <Route path="reports" element={<Wait><Reports /></Wait>} />
        <Route path="translation" element={<Wait><TranslationShows /></Wait>} />
        <Route path="redeem" element={<Wait><RedeemCodes /></Wait>} />
        <Route path="appeals" element={<Wait><Appeals /></Wait>} />
        <Route path="safety" element={<Wait><Safety /></Wait>} />
        <Route path="notices" element={<Wait><Notices /></Wait>} />
        <Route path="deletions" element={<Wait><Deletions /></Wait>} />
        <Route path="app-settings" element={<Wait><AppSettings /></Wait>} />
        <Route path="content" element={<Wait><ContentPages /></Wait>} />
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

function ShowPage({ page: render }: { page: (s: Show) => ReactElement }) {
  const { session } = useSession();
  const { show: key } = useParams();
  if (session.state !== 'in') return null;
  const show = session.shows.find((s) => s.key === key);
  if (!show) return <Navigate to="/" replace />;
  return <Layout show={show}><Wait>{render(show)}</Wait></Layout>;
}
