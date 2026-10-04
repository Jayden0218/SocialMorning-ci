// No screen: old link, sends you to Updates.
/**
 * `/inbox` (M2 US4's Inbox). Owner, 2026-10-04: removed — it listed the new episodes of your
 * shows, which the Updates tab (`/library`) already lists. This path stays because links
 * carrying it exist (G3), the same as `/following`.
 */
import { Redirect } from 'expo-router';

export default function InboxRedirect(): React.ReactElement {
  return <Redirect href="/library" />;
}
