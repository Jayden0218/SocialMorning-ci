// Listeners you blocked, each with an Unblock button.
/**
 * Blocked listeners (黑名单管理, M10): everyone you blocked, each with Unblock (M6's safety layer).
 *
 * M17 T084 (`SettingsBlocked-B`): the page's name sits small in the back row; under it the count
 * as a big serif figure with "listeners blocked" and the block rule in one muted line; then a
 * two-column grid of white cards — an initials disc, the name, and the same Unblock button.
 */
import { FlatList } from '@/ui/lib/flat-list';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { useSafety } from '@/safety/context';
import { BlockButton } from '@/ui/social/BlockButton';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';

const COLUMNS = { gap: spacing.row };

/** Up to two initials from the name ("Marta Quell" → "MQ"); "A listener" → "A". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 && words[0] !== 'A' ? (words[1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

export default function BlockedScreen(): React.ReactElement {
  const stores = useStores();
  const { version } = useSafety();
  void version; // re-read on every block change
  const rows = stores.blocks.all().filter((b) => b.pending >= 0);
  const header = rows.length > 0 ? (
    <Box className="pb-section">
      <Text className="text-text text-display font-display">{rows.length}</Text>
      <Text className="text-text text-base font-display">{rows.length === 1 ? 'listener blocked' : 'listeners blocked'}</Text>
      <Text className="text-muted text-body mt-1">Nothing they write, clip or do shows for you. They are not told.</Text>
    </Box>
  ) : undefined;
  return (
    <>
    <PageHeader
      title="Blocked listeners"
      middle={<Text className="text-text text-body font-bold" accessibilityRole="header" numberOfLines={1}>Blocked listeners</Text>}
    />
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      numColumns={2}
      columnWrapperStyle={COLUMNS}
      keyExtractor={(b) => b.listenerId}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
      ListHeaderComponent={header}
      ListEmptyComponent={<EmptyPicture icon="happy-outline" line="You have not blocked anyone" />}
      renderItem={({ item, index }) => {
        const name = item.displayName ?? 'A listener';
        const card = (
          <Box className="flex-1 bg-surface border border-border rounded-row p-section items-center gap-row">
            <Box className="w-16 h-16 rounded-pill bg-accentTint items-center justify-center" accessible={false}>
              <Text className="text-text text-base font-display" accessibilityElementsHidden importantForAccessibility="no">{initialsOf(name)}</Text>
            </Box>
            <Text className="text-text text-body font-bold text-center" numberOfLines={1}>{name}</Text>
            {/* A row that centres: BlockButton keeps its own self-start, which only acts on a row's cross axis. */}
            <Box className="flex-row justify-center self-stretch">
              <BlockButton listenerId={item.listenerId} displayName={item.displayName ?? 'this listener'} />
            </Box>
          </Box>
        );
        // The last card of an odd count keeps its half width: a spacer takes the other half.
        const alone = index === rows.length - 1 && rows.length % 2 === 1;
        return alone ? <Box className="flex-1 flex-row gap-row">{card}<Box className="flex-1" /></Box> : card;
      }}
    />
    </>
  );
}
