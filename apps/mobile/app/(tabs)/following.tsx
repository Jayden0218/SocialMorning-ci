// No screen: old link, sends you to Notifications.
/**
 * `/following` (M4–M9's Following tab). M10 moved that feed into Notifications (Me →
 * Notifications, owner 2026-09-27); this path stays because links carrying it exist (G3).
 */
import { Redirect } from 'expo-router';

export default function FollowingRedirect(): React.ReactElement {
  return <Redirect href="/notifications" />;
}
