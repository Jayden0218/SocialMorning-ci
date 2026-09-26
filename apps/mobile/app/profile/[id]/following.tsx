/** A paged list of following (M4 FR-007). */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../../src/social/context';
import { useSafety } from '../../../src/safety/context';
import type { ClipAuthor } from '../../../src/social/api';
import { EmptyState } from '../../../src/ui/EmptyState';

export default function FollowingScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const safetyFilter = useSafety();
  const [rows, setRows] = useState<ClipAuthor[]>([]);
  const [next, setNext] = useState<string | undefined>();
  useEffect(() => { void api.following(String(id)).then((r) => { setRows(r.listeners); setNext(r.next); }).catch(() => undefined); }, [api, id]);
  return (
    <FlatList
      data={safetyFilter.listeners(rows)}
      keyExtractor={(l) => l.id}
      contentContainerClassName="p-4"
      ListEmptyComponent={<EmptyState surface="following" />}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
          <Pressable className="py-3 border-b-hairline border-separator" accessibilityRole="link"><Text className="text-sm text-text">{item.displayName ?? 'Deleted account'}</Text></Pressable>
        </Link>
      )}
      onEndReached={() => { if (next) void api.following(String(id), next).then((r) => { setRows((x) => [...x, ...r.listeners]); setNext(r.next); }).catch(() => undefined); }}
    />
  );
}
