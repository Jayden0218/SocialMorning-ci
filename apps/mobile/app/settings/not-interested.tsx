// Episodes and shows you marked "Not interested", each with a Restore button.
/**
 * M19 T022 (US2, FR-012): everything the listener turned down from For You, newest first —
 * the episode's or show's name (or its key when the server has no name), what kind it is, and
 * Restore, which lets it be recommended again. Opened from Settings.
 */
import { useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useDismissals } from '@/recs/dismissals';
import { useSocial } from '@/social/context';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { EmptyPicture } from '@/ui/me/parts';
import { useToast } from '@/ui/shell/providers';

const TAP = { minHeight: hit.min };

export default function NotInterestedScreen(): React.ReactElement {
  const { listener } = useSocial();
  const { items, loaded, restore } = useDismissals();
  const toast = useToast();
  const [busy, setBusy] = useState<string | undefined>();
  const header = <PageHeader title="Not interested" subtitle="Episodes and shows For You no longer recommends." />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to see what you hid from For You.</Text></Box></>;
  if (!loaded && items.length === 0) return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  const back = async (kind: 'episode' | 'show', key: string) => {
    setBusy(`${kind}|${key}`);
    try { await restore(kind, key); toast('Restored'); } catch { toast("Couldn't restore — try again."); } finally { setBusy(undefined); }
  };
  return (
    <>
    {header}
    <FlatList
      className="flex-1 bg-background"
      data={items}
      keyExtractor={(d) => `${d.kind}|${d.itemKey}`}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
      ListEmptyComponent={<EmptyPicture icon="eye-outline" line="Nothing hidden. Use ⋯ on a For You row to hide it." />}
      ListFooterComponent={items.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item }) => {
        const name = item.title ?? item.itemKey;
        const kind = item.kind === 'show' ? 'Show' : 'Episode';
        const id = `${item.kind}|${item.itemKey}`;
        return (
          <Box className="flex-row items-center gap-row bg-surface border border-border rounded-row pl-section">
            <Box className="flex-1 py-row">
              <Text className="text-muted text-xs">{kind}</Text>
              <Text className="text-text text-body font-bold" numberOfLines={2}>{name}</Text>
            </Box>
            <Pressable onPress={() => void back(item.kind, item.itemKey)} disabled={busy === id} accessibilityRole="button" accessibilityLabel={`Restore ${name}`} accessibilityState={{ disabled: busy === id }} className={`items-center justify-center px-section ${busy === id ? 'opacity-40' : ''}`} style={TAP}>
              <Text className="text-accent text-body font-bold">Restore</Text>
            </Pressable>
          </Box>
        );
      }}
    />
    </>
  );
}
