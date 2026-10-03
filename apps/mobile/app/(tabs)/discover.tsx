// No screen: old link, sends you to Discover at `/`.
/**
 * `/discover` (M5–M9's Discover tab). M10 made Discover the first tab, at `/`; this path
 * stays because links carrying it already exist (G3), and it lands on the same screen.
 */
import { Redirect } from 'expo-router';

export default function DiscoverRedirect(): React.ReactElement {
  return <Redirect href="/" />;
}
