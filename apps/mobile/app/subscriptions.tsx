// Shows you follow: starred strip on top, then all shows with sort and search.
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
 *
 * M21 US8 (FR-072): a "Default" sort (my own order, set on `/subscriptions/manage` and synced),
 * a grid / list switch (the grid is 3 covers a row), host faces on rows (from the show extras,
 * first 20 shows), and Share — a link to my public list (`socialmorning://profile/<id>/subscriptions`).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share, useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Pressable } from '@/ui/lib/pressable';
import { Segmented } from '@/ui/kit/Segmented';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { refreshAll } from '@/feeds/refresh-all';
import { useSafety } from '@/safety/context';
import { arrangeSubscriptions, SUB_SORTS, type SubRow, type SubSort } from '@/me/subscriptions';
import { readOrder, syncOrder } from '@/me/subscription-order';
import { useUs8Api } from '@/social/us8-api';
import { useSocial } from '@/social/context';
import { Avatar } from '@/ui/kit/Avatar';
import { BarButton } from '@/ui/kit/TopBar';
import { Artwork } from '@/ui/kit/Artwork';
import { EmptyState } from '@/ui/kit/EmptyState';
import { FilterBar } from '@/ui/me/FilterBar';
import { EmptyPicture } from '@/ui/me/parts';
import { SheetRow } from '@/ui/kit/SheetRow';
import { Icon } from '@/ui/kit/Icon';
import { shortDate } from '@/ui/kit/format';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { hit, spacing } from '@/design';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min, minWidth: hit.min };
/** M24: one-line words for the four sorts (each choice is a quarter of the width). */
const SHORT_SORT: Partial<Record<SubSort, string>> = { updated: 'Updated', added: 'Added' };
/** M17 (`Subscriptions-B`): a starred card is 220 pt wide; its artwork fills it inside 10 pt padding and the border. */
const CARD = { width: 220 };
const CARD_ART = 220 - 2 * 10 - 2;
/** M21 US8: the grid's covers — three a row inside the screen padding. */
const GRID_COLS = 3;
const VIEW_KEY = 'subscriptions.view';
type Host = { id: string; name: string; avatarUrl: string | null };
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
  const [sort, setSort] = useState<SubSort>('default');
  // M21 US8: my order (Default), grid or list, and the hosts of the first shows.
  const us8 = useUs8Api();
  const { api, listener } = useSocial();
  const [order, setOrder] = useState<string[]>(() => readOrder(stores.settings));
  const [grid, setGrid] = useState(() => stores.settings.get(VIEW_KEY) === 'grid');
  const [hosts, setHosts] = useState<Record<string, Host[]>>({});
  const { width } = useWindowDimensions();
  const gridArt = Math.floor((width - 2 * spacing.screenX - (GRID_COLS - 1) * spacing.row) / GRID_COLS);
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
    setOrder(readOrder(stores.settings));
    if (listener) void syncOrder(stores.settings, us8).then((o) => { if (live) setOrder(o); });
    return () => { live = false; };
  }, [read, stores, listener, us8]));
  const feedKey = rows.slice(0, 20).map((r) => r.feedUrl).join('\n');
  useEffect(() => {
    if (feedKey === '') return;
    let live = true;
    void Promise.all(feedKey.split('\n').map(async (f) => [f, (await api.showExtras(f).catch(() => undefined))?.hosts ?? []] as const))
      .then((pairs) => { if (live) setHosts(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [api, feedKey]);
  const toggleView = () => { const next = !grid; setGrid(next); stores.settings.set(VIEW_KEY, next ? 'grid' : 'list'); };
  const share = () => {
    if (!listener) { toast('Sign in to share your list.'); return; }
    const titles = rows.filter((r) => !safety.isHidden('show', r.feedUrl)).slice(0, 10).map((r) => `• ${r.title}`).join('\n');
    void Share.share({ message: `My podcasts on SocialMorning:\n${titles}\n\nsocialmorning://profile/${listener.listenerId}/subscriptions` }).catch(() => undefined);
  };
  /** Faces of a show's hosts, up to three, overlapping. Decoration: the row's label names the show. */
  const faces = (feedUrl: string) => {
    const h = hosts[feedUrl] ?? [];
    if (h.length === 0) return null;
    return (
      <Box className="flex-row items-center mt-1" accessible={false}>
        {h.slice(0, 3).map((x, i) => <Avatar key={x.id} url={x.avatarUrl} name={x.name} size={18} className={i > 0 ? '-ml-1.5' : ''} />)}
        <Text className="text-muted text-xs ml-1.5" numberOfLines={1}>{`${h[0]!.name}${h.length > 1 ? ` +${h.length - 1}` : ''}`}</Text>
      </Box>
    );
  };

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

  const { starred, rest } = arrangeSubscriptions(rows, term, sort, order);
  // The grid lays the rows out three a line: chunk them so the FlatList stays one column.
  const gridRows: Row[][] = [];
  for (let i = 0; i < rest.length; i += GRID_COLS) gridRows.push(rest.slice(i, i + GRID_COLS));

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
          <Artwork url={item.imageUrl} size={CARD_ART} name={item.title} />
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
    <PageHeader
      title="My subscriptions"
      right={
        <Box className="flex-row">
          <BarButton label={grid ? 'Show as a list' : 'Show as a grid'} onPress={toggleView}><Icon name={grid ? 'list-outline' : 'grid-outline'} size={22} color={c.text} /></BarButton>
          <BarButton label="Manage order" onPress={() => router.push('/subscriptions/manage')}><Icon name="swap-vertical-outline" size={22} color={c.text} /></BarButton>
          <BarButton label="Share my list" onPress={share}><Icon name="share-outline" size={22} color={c.text} /></BarButton>
          {/* M22 US17 item 5: pick some shows, give them a title, share one link. */}
          <BarButton label="Share some shows" onPress={() => router.push('/lists/new')}><Icon name="albums-outline" size={22} color={c.text} /></BarButton>
        </Box>
      }
    />
    <Box className="flex-1 bg-background">
      <FlatList<Row | Row[]>
        data={grid ? gridRows : rest}
        // Owner, 2026-10-05: the bottom of a fetched list says so.
        ListFooterComponent={rows.length > 0 ? <EndOfList /> : undefined}
        key={grid ? 'grid' : 'list'}
        keyExtractor={(r) => (Array.isArray(r) ? r.map((x) => x.feedUrl).join('|') : r.feedUrl)}
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
            {/* M24 US20 (`Subscriptions-B`): the kit's beige Segmented, same sorts, same handler. Its
                choices are one line, so four sorts show a short word; the spoken name stays whole. */}
            <Segmented className="mb-section" items={SUB_SORTS.map((s) => ({ value: s.key, label: SHORT_SORT[s.key] ?? s.label, accessibilityLabel: `Sort: ${s.label}` }))} value={sort} onChange={setSort} />
            <FilterBar term={term} onTerm={setTerm} placeholder="Search your shows" />
          </Box>
        )}
        ListEmptyComponent={rows.length === 0 ? <EmptyState surface="library" page /> : starred.length === 0 ? <EmptyPicture icon="search" line="No shows match" /> : undefined}
        renderItem={({ item: it }) => {
          if (Array.isArray(it)) {
            // M21 US8: the grid — a cover and a name per show; long-press for the same sheet as ⋮.
            return (
              <Box className="flex-row gap-row mb-section">
                {it.map((item) => (
                  <Pressable key={item.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })} onLongPress={() => setMenu(item)}
                    accessibilityRole="button" accessibilityLabel={`${item.title}${item.starred ? ', starred' : ''}. Long-press for more`} className="flex-1">
                    <Artwork url={item.imageUrl} size={gridArt} name={item.title} />
                    <Text className="text-text text-xs font-bold mt-1" numberOfLines={2}>{item.title}</Text>
                  </Pressable>
                ))}
                {Array.from({ length: GRID_COLS - it.length }, (_, i) => <Box key={`pad${i}`} className="flex-1" />)}
              </Box>
            );
          }
          const item = it;
          const { extra, line } = linesOf(item);
          return (
            <Box className="flex-row items-center gap-2 py-2.5 border-b-hairline border-separator">
              <Pressable
                onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } })}
                className="flex-row gap-row items-center flex-1"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.starred ? ', starred' : ''}. Newest: ${line}${extra ? `. ${extra}` : ''}`}
              >
                <Artwork url={item.imageUrl} size={56} name={item.title} />
                <Box className="flex-1">
                  <Text className="text-text text-sm font-bold" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>{line}</Text>
                  {extra ? <Text className="text-muted text-xs">{extra}</Text> : null}
                  {faces(item.feedUrl)}
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
        <ActionsheetContent className="px-screen-x pt-row items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {menu ? (
            <>
              <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{menu.title}</Text>
              <SheetRow icon={menu.starred ? 'star' : 'star-outline'} label={menu.starred ? 'Unstar' : 'Star'} iconColour={c.accent} onPress={() => star(menu)} />
              <SheetRow icon="remove-circle-outline" label="Unsubscribe" iconColour={c.muted} onPress={() => unsubscribe(menu)} />
            </>
          ) : null}
          <Pressable onPress={() => setMenu(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-accent text-sm font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </Box>
    </>
  );
}
