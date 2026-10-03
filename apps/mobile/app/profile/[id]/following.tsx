/** A paged list of following (M4 FR-007). M16a bug 2: one component for both lists — src/ui/FollowList.tsx.
 * M17 (`Followers-B` / `FollowingList-B`): the profile also passes `count`, shown as the eyebrow. */
import { useLocalSearchParams } from 'expo-router';
import { FollowList } from '../../../src/ui/FollowList';

export default function FollowingScreen(): React.ReactElement {
  // `name` comes from the profile's link, so an empty list can say whose it is.
  const { id, name, count } = useLocalSearchParams<{ id: string; name?: string; count?: string }>();
  const n = typeof count === 'string' && /^\d+$/.test(count) ? Number(count) : undefined;
  return <FollowList kind="following" id={String(id)} {...(typeof name === 'string' ? { name } : {})} {...(n !== undefined ? { count: n } : {})} />;
}
