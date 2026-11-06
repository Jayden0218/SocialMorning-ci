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
 * already shares the list). The starred shows are 1 x 2 cover tiles under the heading "Starred", the rest 2 x 1 tiles under "All shows"
 * (cover 56, title, "Updated 2d ago", ···). The grid is 3 columns of covers with a warn star on the starred ones. The ··· (or a long press)
 * opens the show menu: the show's head, Star / Unstar, Unsubscribe, a quiet Cancel. Not drawn, so gone: the hosts' faces on a row.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage` (Back + title + the two circles); the chips are one row under the title that runs to the screen's edges; the
 * starred shows are tiles in two equal columns under the heading "Starred", the rest 56-cover rows under "All shows" (small caps headings are gone: they are
 * `Section` headings); the grid is 3 covers a line on the gutter. No lane, no edge label.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share, useWindowDimensions } from 'react-native';
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
import { Section } from '@/ui/kit/layout';
import { FeedPage } from '@/ui/feed/FeedPage';
import { Type } from '@/ui/kit/Type';
import { ago } from '@/ui/kit/format';
import { PanelGroup } from '@/ui/me/Panel';
import { SearchField } from '@/ui/me/lists';
import { FeedEmpty } from '@/ui/feed/FeedPage';
import { Cover } from '@/ui/library/parts';
import { GridTile, ShowTile, StarredTile } from '@/ui/library/ShowTiles';
import { LIB_TYPE, SUBS } from '@/ui/library/measures';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import { gutter, spacing } from '@/design';
import { plural } from '@socialmorning/social-core';
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
  const edge = gutter(width);
  const col = Math.floor((width - 2 * edge - spacing.row * (SUBS.starredCols - 1)) / SUBS.starredCols);
  const gridSize = Math.floor((width - 2 * edge - (SUBS.grid.cols - 1) * SUBS.grid.gap) / SUBS.grid.cols);
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
  // 035 B4: the sync after sign-in fills the table after this page mounted (runs 41359074906 / 41362300402): re-read when it announces it.
  useEffect(() => sync.onChange?.(() => setRows(read(staleSet))), [sync, read, staleSet]);
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

  // The chips under the title: sorts, search, Manage order, Share some shows. The field opens above them.
  const chips = (
    <Box className="gap-gap">
      {searching ? <SearchField value={term} onChange={setTerm} placeholder="Search your shows" autoFocus /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -edge }} contentContainerStyle={{ gap: spacing.gap - 2, paddingHorizontal: edge }}>
        {SUB_SORTS.map((s) => <Chip key={s.key} label={SHORT_SORT[s.key] ?? s.label} accessibilityLabel={`Sort: ${s.label}`} chosen={sort === s.key} onPress={() => setSort(s.key)} />)}
        <Chip label="" icon="search-outline" accessibilityLabel="Search your shows" chosen={searching || term !== ''} onPress={() => { if (searching) setTerm(''); setSearching(!searching); }} />
        <Chip label="Manage order" onPress={() => router.push('/subscriptions/manage')} />
        {/* M22 US17 item 5: pick some shows, give them a title, share one link. */}
        <Chip label="Share some shows" onPress={() => router.push('/lists/new')} />
      </ScrollView>
    </Box>
  );

  const actions = [
    { icon: grid ? 'list-outline' as const : 'grid-outline' as const, label: grid ? 'Show as a list' : 'Show as a grid', onPress: toggleView },
    { icon: 'share-outline' as const, label: 'Share my list', onPress: share },
  ];
  const empty = rows.length === 0
    ? <EmptyState surface="library" page />
    : all.length === 0 ? <FeedEmpty title="No shows match" /> : undefined;
  const common = {
    title: 'My subscriptions',
    ...(rows.length > 0 ? { subtitle: plural(rows.length, 'show') } : {}),
    actions,
    ...(rows.length > 0 ? { header: chips } : {}),
    keyboardShouldPersistTaps: 'handled' as const,
    contentStyle: { flexGrow: 1 },
    gap: spacing.row,
    ListEmptyComponent: empty,
    ListFooterComponent: all.length > 0 ? <EndOfList /> : undefined,
  };

  return (
    <>
      {grid ? (
        <FeedPage<Row[]>
          {...common}
          key="grid"
          data={all.length > 0 ? gridRows : []}
          keyExtractor={(r) => r.map((x) => x.feedUrl).join('|')}
          renderItem={({ item: line }) => (
            <Box className="flex-row" style={{ gap: SUBS.grid.gap }}>
              {line.map((item) => <GridTile key={item.feedUrl} item={item} size={gridSize} label={`${item.title}${item.starred ? ', starred' : ''}. Long-press for more`} onOpen={() => open(item)} onMenu={() => setMenu(item)} />)}
            </Box>
          )}
        />
      ) : (
        <FeedPage<Row>
          {...common}
          key="list"
          data={rest}
          keyExtractor={(r) => r.feedUrl}
          ListHeaderComponent={all.length > 0 ? (
            <>
              {starred.length > 0 ? (
                <Section title="Starred">
                  <Box testID="starred-tiles" className="flex-row flex-wrap" style={{ gap: spacing.row }}>
                    {starred.map((item) => <StarredTile key={item.feedUrl} item={item} width={col} label={linesOf(item).label} onOpen={() => open(item)} onMenu={() => setMenu(item)} />)}
                  </Box>
                </Section>
              ) : null}
              {rest.length > 0 ? <Section title="All shows" /> : null}
            </>
          ) : null}
          renderItem={({ item }) => <ShowTile item={item} line={linesOf(item).printed} label={linesOf(item).label} onOpen={() => open(item)} onMenu={() => setMenu(item)} />}
        />
      )}
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
