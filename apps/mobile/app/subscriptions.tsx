// Shows you follow: starred shows first, then all shows, with sort and search.
/**
 * My subscriptions (M10): the shows you follow — the list the Library tab used to be,
 * opened from the Updates tab's "My subscriptions" button. Refreshes in the background;
 * a feed that fails keeps its cached copy and says so (Principle IV).
 *
 * M12 FR-081: a search box, three sorts, a Starred section on top, each show's newest episode, and a menu per row with Star / Unstar and
 * Unsubscribe. A star is stamped and synced (guards G-ST1, G-ST2).
 *
 * M21 US8 (FR-072): a "Default" sort (my own order, set on `/subscriptions/manage` and synced), a grid / list switch (the grid is 3 covers
 * a row) and Share — a link to my public list (`socialmorning://profile/<id>/subscriptions`).
 *
 * M31 D-A (T031; design-pulse2 `listen.html#subscriptions--screen`, `--grid`, `--empty`, `--show-menu`, `toast--subscriptions`; layout pattern
 * Mosaic): a pushed page with the title bar low — "My subscriptions", "38 shows", the grid / list circle and the share circle (Share my list).
 * Above it, a row of chips: the four sorts (Default · Updated · A–Z · Added; each keeps its spoken "Sort: Recently updated"), the search
 * chip (opens the field), Manage order, and Share some shows (a fourth chip: the drawing's action map puts it on the share circle, which
 * already shares the list). The starred shows are 1 x 2 cover tiles under the edge label "Starred", the rest 2 x 1 tiles under "All shows"
 * (cover 56, title, "Updated 2d ago", ···). The grid is 3 columns of covers with a warn star on the starred ones. The ··· (or a long press)
 * opens the show menu: the show's head, Star / Unstar, Unsubscribe, a quiet Cancel. Not drawn, so gone: the hosts' faces on a row.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, useWindowDimensions } from 'react-native';
import { FlatList } from '@/ui/lib/flat-list';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { refreshFeeds } from '@/feeds/refresh-service';
import { visibleEpisodes } from '@/feeds/hidden';
import { useSafety } from '@/safety/context';
import { arrangeSubscriptions, SUB_SORTS, type SubRow, type SubSort } from '@/me/subscriptions';
import { readOrder, syncOrder } from '@/me/subscription-order';
import { useUs8Api } from '@/social/us8-api';
import { useSocial } from '@/social/context';
import { EmptyState } from '@/ui/kit/EmptyState';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Chip } from '@/ui/kit/Chip';
import { PanelRow } from '@/ui/kit/PanelRow';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { Type } from '@/ui/kit/Type';
import { ago } from '@/ui/kit/format';
import { PanelGroup } from '@/ui/me/Panel';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { DRAWN, PageEmpty, SearchField, emptyTop, LIST } from '@/ui/me/lists';
import { Cover } from '@/ui/library/parts';
import { GridTile, ShowTile, StarredTile } from '@/ui/library/ShowTiles';
import { LIB_TYPE, SUBS } from '@/ui/library/measures';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { bars, spacing } from '@/design';
import { plural } from '@socialmorning/social-core';
import { columnWidth } from '@/ui/discover/Mosaic';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** M24: one-line words for the four sorts (each is a chip). */
const SHORT_SORT: Partial<Record<SubSort, string>> = { updated: 'Updated', added: 'Added' };
const VIEW_KEY = 'subscriptions.view';
type Row = SubRow & { imageUrl?: string; latestTitle?: string; stale: boolean };

export default function SubscriptionsScreen(): React.ReactElement {
  const stores = useStores();
  const router = useRouter();
  const toast = useToast();
  const sync = useSubscriptionSync();
  const { safety, hiddenFeeds } = useSafety();
  const [rows, setRows] = useState<Row[]>([]);
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<SubSort>('default');
  // M21 US8: my order (Default) and grid or list.
  const us8 = useUs8Api();
  const { api, listener } = useSocial();
  const [order, setOrder] = useState<string[]>(() => readOrder(stores.settings));
  const [grid, setGrid] = useState(() => stores.settings.get(VIEW_KEY) === 'grid');
  const { width } = useWindowDimensions();
  const col = columnWidth(width);
  const gridSize = Math.floor((width - ME_MOSAIC.lane - ME_MOSAIC.right - (SUBS.grid.cols - 1) * SUBS.grid.gap) / SUBS.grid.cols);
  const [menu, setMenu] = useState<Row | undefined>();
  const [staleSet, setStaleSet] = useState<Set<string>>(new Set());

  const read = useCallback((stale: Set<string>): Row[] =>
    stores.subscriptions.list().map(({ feedUrl, subscribedAt, starred }) => {
      const show = stores.feeds.getShow(feedUrl);
      // M24 fix F-P: the "latest" line skips an episode its creator hid.
      const latest = visibleEpisodes(stores, feedUrl)[0];
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
    void refreshFeeds(stores, { hiddenOf: api?.hiddenEpisodes }).then((r) => { if (!live) return; const s = new Set(r.stale); setStaleSet(s); setRows(read(s)); });
    setOrder(readOrder(stores.settings));
    if (listener) void syncOrder(stores.settings, us8).then((o) => { if (live) setOrder(o); });
    return () => { live = false; };
  }, [read, stores, listener, us8, api]));
  const toggleView = () => { const next = !grid; setGrid(next); stores.settings.set(VIEW_KEY, next ? 'grid' : 'list'); };
  const share = () => {
    if (!listener) { toast('Sign in to share your list.'); return; }
    const titles = rows.filter((r) => !safety.isHidden('show', r.feedUrl)).slice(0, 10).map((r) => `• ${r.title}`).join('\n');
    void Share.share({ message: `My podcasts on SocialMorning:\n${titles}\n\nsocialmorning://profile/${listener.listenerId}/subscriptions` }).catch(() => undefined);
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
  // The grid lays every show out three a line, the starred first: chunk them so the FlatList stays one column.
  const gridRows: Row[][] = [];
  const all = [...starred, ...rest];
  for (let i = 0; i < all.length; i += SUBS.grid.cols) gridRows.push(all.slice(i, i + SUBS.grid.cols));

  /** The spoken and printed lines a show carries, wherever it is drawn. */
  const linesOf = (item: Row): { extra: string; line: string; label: string; printed: string } => {
    const extra = [item.stale ? 'offline copy' : undefined,
      safety.isHidden('show', item.feedUrl) ? 'reported' : hiddenFeeds.has(item.feedUrl) ? 'hidden from discovery' : undefined].filter(Boolean).join(' · ');
    const line = item.latestTitle ? `${item.latestAt !== undefined ? `${new Date(item.latestAt).toISOString().slice(0, 10)} · ` : ''}${item.latestTitle}` : 'No episodes yet';
    const updated = item.latestAt !== undefined ? `Updated ${ago(item.latestAt, clockMs())}` : 'No episodes yet';
    return { extra, line, label: `${item.title}${item.starred ? ', starred' : ''}. Newest: ${line}${extra ? `. ${extra}` : ''}`, printed: extra ? `${updated} · ${extra}` : updated };
  };
  const open = (item: Row) => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(item.feedUrl) } });

  // The chips above the title bar: sorts, search, Manage order, Share some shows. The field opens above them.
  const chips = (
    <Box className="gap-gap">
      {searching ? <SearchField value={term} onChange={setTerm} placeholder="Search your shows" autoFocus /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.gap - 2 }}>
        {SUB_SORTS.map((s) => <Chip key={s.key} label={SHORT_SORT[s.key] ?? s.label} accessibilityLabel={`Sort: ${s.label}`} chosen={sort === s.key} onPress={() => setSort(s.key)} />)}
        <Chip label="" icon="search-outline" accessibilityLabel="Search your shows" chosen={searching || term !== ''} onPress={() => { if (searching) setTerm(''); setSearching(!searching); }} />
        <Chip label="Manage order" onPress={() => router.push('/subscriptions/manage')} />
        {/* M22 US17 item 5: pick some shows, give them a title, share one link. */}
        <Chip label="Share some shows" onPress={() => router.push('/lists/new')} />
      </ScrollView>
    </Box>
  );
  const extraAbove = bars.chip + (searching ? spacing.gap + LIST.field : 0);

  return (
    <>
      <PushedPage
        title="My subscriptions"
        size={26}
        {...(rows.length > 0 ? { subtitle: plural(rows.length, 'show') } : {})}
        actions={[
          { icon: grid ? 'list-outline' : 'grid-outline', label: grid ? 'Show as a list' : 'Show as a grid', onPress: toggleView },
          { icon: 'share-outline', label: 'Share my list', onPress: share },
        ]}
        {...(rows.length > 0 ? { extra: chips, extraAbove } : {})}
      >
        {(layout) => {
          const top = layout.top + (SUBS.top - DRAWN.status);
          if (rows.length === 0) {
            return <Box className="flex-1" style={{ paddingTop: layout.top + (DRAWN.listTop - DRAWN.status) }}><Box style={{ marginTop: emptyTop(240) }}><EmptyState surface="library" page /></Box></Box>;
          }
          if (all.length === 0) {
            return <Box className="flex-1" style={{ paddingTop: layout.top + (DRAWN.listTop - DRAWN.status) }}><PageEmpty top={emptyTop(240)} title="No shows match" /></Box>;
          }
          const side = { marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right };
          if (grid) {
            return (
              <FlatList<Row[]>
                data={gridRows}
                key="grid"
                keyExtractor={(r) => r.map((x) => x.feedUrl).join('|')}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve }}
                ItemSeparatorComponent={() => <Box style={{ height: SUBS.grid.gap }} />}
                ListFooterComponent={<EndOfList />}
                renderItem={({ item: line }) => (
                  <Box className="flex-row" style={{ ...side, gap: SUBS.grid.gap }}>
                    {line.map((item) => <GridTile key={item.feedUrl} item={item} size={gridSize} label={`${item.title}${item.starred ? ', starred' : ''}. Long-press for more`} onOpen={() => open(item)} onMenu={() => setMenu(item)} />)}
                  </Box>
                )}
              />
            );
          }
          return (
            <FlatList<Row>
              data={rest}
              key="list"
              keyExtractor={(r) => r.feedUrl}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve }}
              ItemSeparatorComponent={() => <Box style={{ height: ME_MOSAIC.gap }} />}
              ListHeaderComponent={starred.length > 0 ? (
                <Box testID="starred-tiles" style={{ ...side, marginBottom: ME_MOSAIC.gap }}>
                  <EdgeLabel label="Starred" top={10} left={-(ME_MOSAIC.lane - 6)} />
                  <Box className="flex-row flex-wrap" style={{ gap: ME_MOSAIC.gap }}>
                    {starred.map((item) => <StarredTile key={item.feedUrl} item={item} width={col} label={linesOf(item).label} onOpen={() => open(item)} onMenu={() => setMenu(item)} />)}
                  </Box>
                </Box>
              ) : undefined}
              ListFooterComponent={<EndOfList />}
              renderItem={({ item, index }) => (
                <Box style={side}>
                  {index === 0 ? <EdgeLabel label="All shows" top={0} left={-(ME_MOSAIC.lane - 6)} /> : null}
                  <ShowTile item={item} line={linesOf(item).printed} label={linesOf(item).label} onOpen={() => open(item)} onMenu={() => setMenu(item)} />
                </Box>
              )}
            />
          );
        }}
      </PushedPage>
      <ActionSheet open={menu !== undefined} onClose={() => setMenu(undefined)} label="Show menu">
        {menu ? (
          <>
            <Box className="flex-row items-center" style={{ gap: spacing.row }}>
              <Cover url={menu.imageUrl} name={menu.title} size={SUBS.menuCover} radius={SUBS.coverRadius} />
              <Type step="lede" className="text-text font-bold flex-1" style={LIB_TYPE.menuTitle} numberOfLines={2}>{menu.title}</Type>
            </Box>
            <PanelGroup>
              <PanelRow icon={menu.starred ? 'star' : 'star-outline'} label={menu.starred ? 'Unstar' : 'Star'} detail="Starred shows sit first" onPress={() => star(menu)} />
              <PanelRow icon="ban-outline" label="Unsubscribe" onPress={() => unsubscribe(menu)} />
            </PanelGroup>
            <PulseButton label="Cancel" kind="quiet" onPress={() => setMenu(undefined)} full />
          </>
        ) : null}
      </ActionSheet>
    </>
  );
}
