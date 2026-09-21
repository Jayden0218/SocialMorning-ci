/** One Following item (M4 FR-008): who, what, which episode, at which moment; tapping opens the moment. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import type { FeedItem as Item } from '../social/api';
import { mmss } from './format';

export function describe(item: Item): string {
  const ep = item.episode.showTitle ? `${item.episode.title} (${item.episode.showTitle})` : item.episode.title;
  switch (item.kind) {
    case 'listened': return `listened to ${ep}`;
    case 'clipped': return `clipped ${item.momentMs !== null ? `${mmss(item.momentMs)} of ` : ''}${ep}`;
    case 'commented': return `commented${item.momentMs !== null ? ` at ${mmss(item.momentMs)}` : ''} on ${ep}`;
  }
}

export function FeedItem(props: { item: Item; onOpen: (item: Item) => void }): React.ReactElement {
  const { item } = props;
  return (
    <Pressable style={styles.row} onPress={() => props.onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}>
      <View style={styles.head}>
        <Link href={{ pathname: '/profile/[id]', params: { id: item.actor.id } }} asChild>
          <Pressable accessibilityRole="link"><Text style={styles.author}>{item.actor.displayName ?? 'Deleted account'}</Text></Pressable>
        </Link>
        <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString()}</Text>
      </View>
      <Text style={styles.body}>{describe(item)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc', gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { color: '#1a4fd6', fontWeight: '600' },
  muted: { color: '#666', fontSize: 12 },
  body: { fontSize: 16 },
});
