/** A paged list of followers (M4 FR-007). */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../../src/social/context';
import type { ClipAuthor } from '../../../src/social/api';

export default function FollowersScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useSocial();
  const [rows, setRows] = useState<ClipAuthor[]>([]);
  const [next, setNext] = useState<string | undefined>();
  useEffect(() => { void api.followers(String(id)).then((r) => { setRows(r.listeners); setNext(r.next); }).catch(() => undefined); }, [api, id]);
  return (
    <FlatList
      data={rows}
      keyExtractor={(l) => l.id}
      contentContainerStyle={styles.body}
      ListEmptyComponent={<Text style={styles.muted}>Nobody yet.</Text>}
      renderItem={({ item }) => (
        <Link href={{ pathname: '/profile/[id]', params: { id: item.id } }} asChild>
          <Pressable style={styles.row} accessibilityRole="link"><Text style={styles.name}>{item.displayName ?? 'Deleted account'}</Text></Pressable>
        </Link>
      )}
      onEndReached={() => { if (next) void api.followers(String(id), next).then((r) => { setRows((x) => [...x, ...r.listeners]); setNext(r.next); }).catch(() => undefined); }}
    />
  );
}

const styles = StyleSheet.create({ body: { padding: 16 }, row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' }, name: { fontSize: 16 }, muted: { color: '#666' } });
