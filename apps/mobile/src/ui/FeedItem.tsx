/** One Following item (M4 FR-008): who, what, which episode, at which moment; tapping opens the moment. */
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Link } from '../design/tailwind';
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
    <Pressable className="py-2.5 border-b-hairline border-separator gap-1" onPress={() => props.onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}>
      <Box className="flex-row justify-between items-center">
        <Link href={{ pathname: '/profile/[id]', params: { id: item.actor.id } }} asChild>
          <Pressable accessibilityRole="link">
            {/* A name is not an action (owner's K1 note, 2026-09-25): weight tells it apart. */}
            <Text className="text-text font-semibold">{item.actor.displayName ?? 'Deleted account'}</Text>
          </Pressable>
        </Link>
        <Text className="text-muted text-xs">{new Date(item.createdAt).toLocaleString()}</Text>
      </Box>
      <Text className="text-sm text-text">{describe(item)}</Text>
    </Pressable>
  );
}
