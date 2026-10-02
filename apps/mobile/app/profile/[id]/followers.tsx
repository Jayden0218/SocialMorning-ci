/** A paged list of followers (M4 FR-007). M16a bug 2: one component for both lists — src/ui/FollowList.tsx. */
import { useLocalSearchParams } from 'expo-router';
import { FollowList } from '../../../src/ui/FollowList';

export default function FollowersScreen(): React.ReactElement {
  // `name` comes from the profile's link, so an empty list can say whose it is.
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <FollowList kind="followers" id={String(id)} {...(typeof name === 'string' ? { name } : {})} />;
}
