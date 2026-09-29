/** A paged list of followers (M4 FR-007). */
import { useEffect, useState } from 'react';
import { FlatList } from '../../../src/ui/lib/flat-list';
import { Pressable } from '../../../src/ui/lib/pressable';
import { Text } from '../../../src/ui/lib/text';
import { useLocalSearchParams } from 'expo-router';
import { Link } from '../../../src/design/tailwind';
import { useSocial } from '../../../src/social/context';
import { useSafety } from '../../../src/safety/context';
import type { ClipAuthor } from '../../../src/social/api';
import { EmptyState } from '../../../src/ui/EmptyState';

export default function FollowersScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const safetyFilter = useSafety();
  const [rows, setRows] = useState<ClipAuthor[]>([]);
  const [next, setNext] = useState<string | undefined>();
  useEffect(() => { void api.followers(String(id)).then((r) => { setRows(r.listeners); setNext(r.next); }).catch(() => undefined); }, [api, id]);
  return (
    <FlatList
      data={safetyFilter.listeners(rows)}
      keyExtractor={(l) => l.id}
      contentContainerClassName="p-4"
      ListEmptyComponent={<EmptyState surface="followers" />}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
          <Pressable className="py-3 border-b-hairline border-separator" accessibilityRole="link"><Text className="text-sm text-text">{item.displayName ?? 'Deleted account'}</Text></Pressable>
        </Link>
      )}
      onEndReached={() => { if (next) void api.followers(String(id), next).then((r) => { setRows((x) => [...x, ...r.listeners]); setNext(r.next); }).catch(() => undefined); }}
    />
  );
}
