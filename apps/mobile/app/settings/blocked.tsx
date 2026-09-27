/** Blocked listeners (黑名单管理, M10): everyone you blocked, each with Unblock (M6's safety layer). */
import { Stack } from 'expo-router';
import { FlatList } from '../../src/ui/lib/flat-list';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { useSafety } from '../../src/safety/context';
import { BlockButton } from '../../src/ui/BlockButton';
import { EmptyPicture } from '../../src/ui/me/parts';
import { useStores } from '../../src/ui/providers';

export default function BlockedScreen(): React.ReactElement {
  const stores = useStores();
  const { version } = useSafety();
  void version; // re-read on every block change
  const rows = stores.blocks.all().filter((b) => b.pending >= 0);
  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(b) => b.listenerId}
      contentContainerClassName="px-screen-x py-row flex-grow"
      ListHeaderComponent={<Stack.Screen options={{ title: 'Blocked listeners' }} />}
      ListEmptyComponent={<EmptyPicture icon="happy-outline" line="You have not blocked anyone" />}
      renderItem={({ item }) => (
        <Box className="flex-row items-center justify-between py-row border-b-hairline border-separator">
          <Text className="text-text text-sm flex-1" numberOfLines={1}>{item.displayName ?? 'A listener'}</Text>
          <BlockButton listenerId={item.listenerId} displayName={item.displayName ?? 'this listener'} />
        </Box>
      )}
    />
  );
}
