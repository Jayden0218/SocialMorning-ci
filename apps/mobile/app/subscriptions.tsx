/**
 * My subscriptions (M10): the shows you follow — the list the Library tab used to be,
 * opened from the Updates tab's "My subscriptions" button. Refreshes in the background;
 * a feed that fails keeps its cached copy and says so (Principle IV).
 *
 * M12 FR-081: a search box, three sorts, a Starred section on top, 56 pt artwork, each
 * show's newest episode, and a ⋮ per row with Star / Unstar and Unsubscribe. A star is
 * stamped and synced (guards G-ST1, G-ST2).
 *
 * M17 (`Subscriptions-B`): the 32 pt serif title; starred shows become a sideways strip of
 * white cards (artwork, serif name, newest episode, ⋮ on the artwork) under a serif "Starred";
 * then "All shows", the three sorts as a pill track (inline, so the inventory keeps them here),
 * the pill search box, and the rows split by hairlines. Same actions, same sheet, same names.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from '../src/ui/lib/flat-list';
import { ScrollView } from '../src/ui/lib/scroll-view';
import { Pressable } from '../src/ui/lib/pressable';
import { Text } from '../src/ui/lib/text';
import { Box } from '../src/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '../src/ui/lib/actionsheet';
import { refreshAll } from '../src/feeds/refresh-all';
import { useSafety } from '../src/safety/context';
import { arrangeSubscriptions, SUB_SORTS, type SubRow, type SubSort } from '../src/me/subscriptions';
import { Artwork } from '../src/ui/Artwork';
import { EmptyState } from '../src/ui/EmptyState';
import { FilterBar } from '../src/ui/me/FilterBar';
import { EmptyPicture } from '../src/ui/me/parts';
import { SheetRow } from '../src/ui/SheetRow';
import { Icon } from '../src/ui/Icon';
import { shortDate } from '../src/ui/format';
import { useStores, useSubscriptionSync, useToast } from '../src/ui/providers';
import { useColours } from '../src/ui/useColours';
import { hit } from '../src/design';
import { PageHeader } from '../src/ui/PageHeader';

const TAP = { minHeight: hit.min, minWidth: hit.min };
/** M17 (`Subscriptions-B`): a starred card is 220 pt wide; its artwork fills it inside 10 pt padding and the border. */
const CARD = { width: 220 };
const CARD_ART = 220 - 2 * 10 - 2;
type Row = SubRow & { imageUrl?: string; latestTitle?: string; stale: boolean };

export default function SubscriptionsScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const router = useRouter();
  const toast = useToast();
  const sync = useSubscriptionSync();
  const { safety, hiddenFeeds } = useSafety();
  const [rows, setRows] = useState<Row[]>([]);
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SubSort>('updated');
  const [menu, setMenu] = useState<Row | undefined>();
  const [staleSet, setStaleSet] = useState<Set<string>>(new Set());

  const read = useCallback((stale: Set<string>): Row[] =>
    stores.subscriptions.list().map(({ feedUrl, subscribedAt, starred }) => {
      const show = stores.feeds.getShow(feedUrl);
      const latest = stores.feeds.listEpisodes(feedUrl)[0];
      const latestAt = latest?.publishedAt;
      return {
        feedUrl, subscribedAt, starred, title: show?.title ?? feedUrl, stale: stale.has(feedUrl),
        ...(show?.imageUrl ? { imageUrl: show.imageUrl } : {}),
        ...(latest ? { latestTitle: latest.title } : {}),
        ...(latestAt !== undefined ? { latestAt } : {}),
      };
    }), [stores]);
  useFocusEffect(useCallback(() => {
    let live = true;
    setRows(read(staleSet));
    void refreshAll(stores, Date.now()).then((r) => { if (!live) return; const s = new Set(r.stale); setStaleSet(s); setRows(read(s)); });
    return () => { live = false; };
  }, [read, stores]));

  const star = (r: Row) => {
    stores.subscriptions.setStarred(r.feedUrl, !r.starred, Date.now());
    sync.push();
    setMenu(undefined);
    setRows(read(staleSet));
  };
  const unsubscribe = (r: Row) => {
    stores.subscriptions.remove(r.feedUrl);
    sync.push();
    setMenu(undefined);
    setRows(read(staleSet));
    toast(`Unsubscribed from ${r.title}.`);
  };

  const { starred, rest } = arrangeSubscriptions(rows, term, sort);

  /** The spoken and printed lines a show carries, wherever it is drawn. */
  const linesOf = (item: Row): { extra: string; line: string } => ({
    extra: [item.stale ? 'offline copy' : undefined,
      safety.isHidden('show', item.feedUrl) ? 'reported' : hiddenFeeds.has(item.feedUrl) ? 'hidden from discovery' : undefined].filter(Boolean).join(' · '),
    line: item.latestTitle ? `${item.latestAt !== undefined ? `${shortDate(item.latestAt)} · ` : ''}${item.latestTitle}` : 'No episodes yet',
  });

  /** M17: a starred show is a 220 pt card in the strip on top — artwork, serif name, newest episode, ⋮ on the artwork. */
  const starredCard = (item: Row) => {
    const { extra, line } = linesOf(item);
    return (
      <Box key={item.feedUrl} className="bg-surface border border-border rounded-row p-2.5" style={CARD}>
        <Pressable
          onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })}
          className="gap-1"
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.starred ? ', starred' : ''}. Newest: ${line}${extra ? `. ${extra}` : ''}`}
        >
          <Artwork url={item.imageUrl} size={CARD_ART} rounded="row" name={item.title} />
          <Text className="text-text text-title font-display mt-1.5" numberOfLines={1}>{item.title}</Text>
          <Text className="text-muted text-xs" numberOfLines={2}>{line}</Text>
          {extra ? <Text className="text-muted text-xs">{extra}</Text> : null}
        </Pressable>
        <Pressable onPress={() => setMenu(item)} accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} className="absolute top-4 right-4 items-center justify-center rounded-pill bg-veil" style={TAP}>
          <Icon name="ellipsis-vertical" size={20} color={c.text} />
        </Pressable>
      </Box>
    );
  };

  return (
    <>
    <PageHeader title="My subscriptions" />
    <Box className="flex-1 bg-background">
      <FlatList
        data={rest}
        keyExtractor={(r) => r.feedUrl}
        contentContainerClassName="px-screen-x pb-24 flex-grow"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={rows.length === 0 ? undefined : (
          <Box>
            {starred.length > 0 ? (
              <>
                <Text className="text-text text-base font-display-semibold mb-2.5" accessibilityRole="header">Starred</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mr-screen-x" contentContainerClassName="gap-row pr-screen-x">
                  {starred.map(starredCard)}
                </ScrollView>
                <Text className="text-text text-base font-display-semibold mt-5 mb-2" accessibilityRole="header">All shows</Text>
              </>
            ) : null}
            <Box className="flex-row gap-1 p-1 mb-section bg-surface border border-border rounded-pill" accessibilityRole="tablist">
              {SUB_SORTS.map((s) => {
                const on = s.key === sort;
                return (
                  <Pressable key={s.key} onPress={() => setSort(s.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Sort: ${s.label}`}
                    className={`flex-1 items-center justify-center px-1 rounded-pill ${on ? 'bg-primary' : ''}`} style={TAP}>
                    <Text className={on ? 'text-onPrimary text-meta font-bold text-center' : 'text-muted text-meta font-medium text-center'}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </Box>
            <FilterBar term={term} onTerm={setTerm} placeholder="Search your shows" />
          </Box>
        )}
        ListEmptyComponent={rows.length === 0 ? <EmptyState surface="library" page /> : starred.length === 0 ? <EmptyPicture icon="search" line="No shows match" /> : null}
        renderItem={({ item }) => {
          const { extra, line } = linesOf(item);
          return (
            <Box className="flex-row items-center gap-2 py-2.5 border-b-hairline border-separator">
              <Pressable
                onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })}
                className="flex-row gap-row items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.starred ? ', starred' : ''}. Newest: ${line}${extra ? `. ${extra}` : ''}`}
              >
                <Artwork url={item.imageUrl} size={56} rounded="row" name={item.title} />
                <Box className="flex-1">
                  <Text className="text-text text-sm font-bold" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>{line}</Text>
                  {extra ? <Text className="text-muted text-xs">{extra}</Text> : null}
                </Box>
              </Pressable>
              <Pressable onPress={() => setMenu(item)} accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} className="items-center justify-center" style={TAP}>
                <Icon name="ellipsis-vertical" size={20} color={c.muted} />
              </Pressable>
            </Box>
          );
        }}
      />
      <Actionsheet isOpen={menu !== undefined} onClose={() => setMenu(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {menu ? (
            <>
              <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{menu.title}</Text>
              <SheetRow icon={menu.starred ? 'star' : 'star-outline'} label={menu.starred ? 'Unstar' : 'Star'} iconColour={c.accent} onPress={() => star(menu)} />
              <SheetRow icon="remove-circle-outline" label="Unsubscribe" iconColour={c.muted} onPress={() => unsubscribe(menu)} />
            </>
          ) : null}
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-sm text-muted">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </Box>
    </>
  );
}
