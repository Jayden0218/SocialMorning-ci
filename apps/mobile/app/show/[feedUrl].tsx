/**
 * One show: its header, its episodes newest first, and whether what we are
 * looking at is fresh (FR-002).
 *
 * The cached copy renders IMMEDIATELY and the refresh happens behind it. A
 * screen that waits for the network before showing episodes it already has
 * is the opposite of Principle IV.
 *
 * Laid out after the owner's reference (2026-09-27): a bar with back, share, search and
 * more; the title large with the artwork to its right; a wide black Subscribe button;
 * two tabs — Episodes and About; each episode a row with its artwork, two lines of
 * shownotes, "69 min · 13 h ago", and a round play button that plays without leaving.
 * The reference's subscriber count is left out: no public API gives one, and the app does
 * not invent one. "Most played" (owner, 2026-10-01) sorts by FR-061's listener counts and
 * hides itself when there are none.
 *
 * M12 (US6): past the header a slim bar keeps back, 24 pt art, the title and Subscribe on
 * top (FR-060); rows add plays and comments from one server call and a ⋮ sheet (FR-061);
 * About no longer repeats the header's description — the header hides it there — and adds
 * a host row and up to 6 similar shows from the show's genre chart (FR-063). The host's
 * newest announcement is one card under the header (show/AnnouncementCard, owner 2026-10-01); RSS has no announcement tag (the podcast
 * namespace's 28 tags, read 2026-09-29), so a feed alone never shows one (FR-062).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Share } from 'react-native';
import { FlatList } from '../../src/ui/lib/flat-list';
import { Pressable } from '../../src/ui/lib/pressable';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { refreshShow } from '../../src/feeds/fetch';
import { htmlToText, mmss, noteSummary } from '../../src/ui/format';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { toPlayable } from '../../src/storage/playable';
import { Artwork } from '../../src/ui/Artwork';
import { Dots, Glyph, PauseIcon, PlayIcon, SearchIcon } from '../../src/ui/Icon';
import { BarButton, TAP, TopBar } from '../../src/ui/TopBar';
import { useSafety } from '../../src/safety/context';
import { ReportSheet, type ReportTarget } from '../../src/ui/ReportSheet';
import { useStores, useSubscriptionSync } from '../../src/ui/providers';
import type { CachedEpisode, CachedShow } from '../../src/storage/types';
import { getPref } from '../../src/settings/prefs';
import { ShowExtrasBlock, useShowExtras } from '../../src/ui/ShowExtras';
import { useSocial } from '../../src/social/context';
import { plural } from '@socialmorning/social-core';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '../../src/ui/lib/actionsheet';
import { QueueButtons } from '../../src/ui/QueueButtons';
import { DownloadButton } from '../../src/ui/DownloadButton';
import { EpisodeExtras } from '../../src/ui/me/EpisodeExtras';
import { Icon } from '../../src/ui/Icon';
import { useColours } from '../../src/ui/useColours';
import { useM12Api } from '../../src/social/m12-api';
import { genreOf, similarShows } from '../../src/discover/genres';
import type { ShowCard } from '../../src/social/api';
import { hasPlays, orderEpisodes, type ListView } from '../../src/ui/show/order';
import { EpisodeMeta, metaLabel } from '../../src/ui/show/EpisodeMeta';
import { AnnouncementCard } from '../../src/ui/show/AnnouncementCard';
import { CuratorLine, hostLineFor } from '../../src/ui/show/CuratorLine';

/** How far the page scrolls before the slim bar takes over (about the title block's height). */
export const COLLAPSE_AT = 150;

export default function ShowScreen(): React.ReactElement {
  const stores = useStores();
  const subscriptionSync = useSubscriptionSync();
  const router = useRouter();
  const params = useLocalSearchParams<{ feedUrl: string }>();
  const feedUrl = decodeURIComponent(params.feedUrl ?? '');

  const [show, setShow] = useState<CachedShow | undefined>(() => stores.feeds.getShow(feedUrl));
  const [episodes, setEpisodes] = useState<CachedEpisode[]>(() =>
    stores.feeds.listEpisodes(feedUrl),
  );
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [subscribed, setSubscribed] = useState(() => stores.subscriptions.has(feedUrl));
  const { safety, version, hiddenFeeds } = useSafety();
  const [reporting, setReporting] = useState<ReportTarget | undefined>();
  void version;
  const reportedShow = safety.isHidden('show', feedUrl);
  const hiddenShow = hiddenFeeds.has(feedUrl);
  // The rows read positions at render time; coming back from the player (or the
  // episode screen) must re-render them, or the list shows where the episode WAS
  // when this screen was pushed (seen on the phone 2026-09-21: Casey "0:57" while
  // its own screen said 15:52).
  const [focusTick, setFocusTick] = useState(0);
  // M11: the creator's Studio settings, announcements and polls — after the feed, never instead of it.
  const [extras, replacePoll] = useShowExtras(feedUrl);
  const { api } = useSocial();
  const ov = extras?.overrides ?? null;
  const curator = extras?.curator ?? null;
  const title = ov?.title ?? show?.title;
  const description = ov?.description ?? show?.description;
  useFocusEffect(useCallback(() => { setFocusTick((n) => n + 1); }, []));
  const c = useColours(stores.settings);
  const m12 = useM12Api();
  const [collapsed, setCollapsed] = useState(false);
  const [menuFor, setMenuFor] = useState<CachedEpisode | undefined>();
  // FR-061: plays and comments for the first 100 rows, one call; a failure leaves them out.
  const [counts, setCounts] = useState<{ counts: Record<string, number>; listeners?: Record<string, number> }>({ counts: {} });
  const ids = episodes.slice(0, 100).map((e) => e.id).join(',');
  useEffect(() => {
    if (ids === '') return;
    let live = true;
    m12.episodeCounts(ids.split(',')).then((r) => { if (live) setCounts(r); }, () => undefined);
    return () => { live = false; };
  }, [m12, ids]);
  // FR-063: similar shows — the show's genre chart (cached on the server), this one left out.
  const genre = genreOf(show?.categories);
  const [similar, setSimilar] = useState<ShowCard[]>([]);
  useEffect(() => {
    if (genre === undefined) return;
    let live = true;
    api.category(genre.id).then((r) => { if (live) setSimilar(r.shows); }, () => undefined);
    return () => { live = false; };
  }, [api, genre?.id]);

  useEffect(() => {
    let live = true;
    refreshShow(feedUrl, stores.feeds, Date.now())
      .then((result) => {
        if (!live) return;
        setShow(result.show);
        setEpisodes(result.episodes);
        setStale(result.stale);
        setFailed(undefined);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailed(error instanceof Error ? error.message : 'Could not load this show.');
      });
    return () => {
      live = false;
    };
  }, [feedUrl, stores]);

  // FR-021 / FR-022. Unsubscribing deliberately touches nothing else: the
  // positions for this show's episodes outlive it (FR-023).
  //
  // M8 (US1): the local write still happens first and never waits on the network — the
  // push is fire-and-forget, and an offline one is picked up by the next reconcile
  // (FR-003).
  const toggleSubscription = useCallback(() => {
    if (stores.subscriptions.has(feedUrl)) {
      stores.subscriptions.remove(feedUrl);
      setSubscribed(false);
    } else {
      stores.subscriptions.add(feedUrl, Date.now());
      setSubscribed(true);
    }
    subscriptionSync.push();
  }, [feedUrl, stores, subscriptionSync]);

  const player = usePlayer();
  const playerState = usePlayerState();
  const [tab, setTab] = useState<'episodes' | 'about'>('episodes');
  const [oldestFirst, setOldestFirst] = useState(false);
  // Owner, 2026-10-01: the "All" / "Most played" chips and an "Unplayed" filter above the list.
  const [view, setView] = useState<ListView>('all');
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  const now = Date.now();
  // M10 minor mode (Settings → Minor mode): explicit episodes are not listed.
  const allowed = getPref(stores.settings, 'hideExplicit') ? episodes.filter((e) => !e.explicit) : episodes;
  const playsKnown = hasPlays(counts.listeners);
  // "Most played" hides with no counts; the list then reads as "All" (orderEpisodes agrees).
  const chips: ListView[] = playsKnown ? ['all', 'mostPlayed'] : ['all'];
  const activeView: ListView = playsKnown ? view : 'all';
  const shown = orderEpisodes(allowed, {
    oldestFirst, view, unplayedOnly,
    isFinished: (id) => stores.positions.get(id)?.finished === true,
    ...(counts.listeners !== undefined ? { listeners: counts.listeners } : {}),
  });

  const progressFor = (episode: CachedEpisode): string => {
    const row = stores.positions.get(episode.id);
    if (row === undefined) return '';
    if (row.finished) return 'Finished';
    const total = episode.durationMs === undefined ? '' : ` / ${mmss(episode.durationMs)}`;
    return `${mmss(row.offsetMs)}${total}`;
  };
  const isPlaying = (id: string) => (playerState.kind === 'playing' || playerState.kind === 'buffering') && playerState.episodeId === id;
  const playOrPause = (episode: CachedEpisode) => {
    if (isPlaying(episode.id)) { player.pause(); return; }
    if (playerState.kind !== 'idle' && playerState.episodeId === episode.id) { player.play(); return; }
    const playable = toPlayable(stores, episode.id);
    if (playable) player.load(playable, 'play');
  };

  const latestAnnouncement = extras?.announcements[0]; // the server sends newest first
  const header = (
    <Box>
      <Box className="px-screen-x pt-row gap-section">
        <Box className="flex-row gap-section items-start">
          <Box className="flex-1 gap-2">
            <Text className="text-[28px] leading-[36px] font-bold text-text" accessibilityRole="header">{title ?? 'Loading…'}</Text>
            {/* M15 US4: the curator, under the title — never through the "Hosted by" line (G-C1). */}
            {curator ? <CuratorLine curator={curator} iconColour={c.muted} /> : null}
            {description === undefined || tab === 'about' ? null : (
              <Text className="text-sm text-muted" numberOfLines={2}>{htmlToText(description)}</Text>
            )}
            {show?.author === undefined ? null : <Text className="text-sm text-muted mt-2" numberOfLines={1}>{show.author}</Text>}
          </Box>
          <Artwork url={ov?.coverUrl ?? show?.imageUrl} size={120} rounded="artwork" name={title} />
        </Box>
        {/* Owner, 2026-10-01: the episode count sits once, over the list (it follows the filter). */}
        <Box className="flex-row items-center gap-section">
          <Pressable
            className={`flex-1 items-center justify-center rounded-row ${subscribed ? 'bg-surface' : 'bg-text'}`}
            style={TAP}
            accessibilityRole="button"
            accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
            accessibilityState={{ selected: subscribed }}
            onPress={toggleSubscription}
          >
            <Text className={subscribed ? 'text-sm font-bold text-muted' : 'text-sm font-bold text-background'}>{subscribed ? 'Subscribed' : '+ Subscribe'}</Text>
          </Pressable>
        </Box>
        {reportedShow ? <Text className="text-[13px] text-accent">You reported this show. It stays in your library; it is hidden from discovery for you.</Text> : null}
        {hiddenShow ? <Text className="text-[13px] text-accent">Hidden from discovery by moderation. It stays in your library.</Text> : null}
        {stale ? <Text className="text-[13px] text-accent">Showing the last copy — refresh failed</Text> : null}
        {failed === undefined ? null : <Text className="text-[13px] text-accent">{failed}</Text>}
        {/* Owner, 2026-10-01: the newest announcement as one card under the header. */}
        {latestAnnouncement ? <AnnouncementCard announcement={latestAnnouncement} iconColour={c.text} /> : null}
        {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} noAnnouncements /> : null}
        <Box className="flex-row gap-6" accessibilityRole="tablist">
          {(['episodes', 'about'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'episodes' ? 'Episodes' : 'About'} className="justify-end" style={TAP}>
              <Text className={tab === t ? 'text-base font-bold text-text' : 'text-base text-muted'}>{t === 'episodes' ? 'Episodes' : 'About'}</Text>
              <Box className={`h-1 mt-1 rounded-pill ${tab === t ? 'bg-text' : 'bg-transparent'}`} />
            </Pressable>
          ))}
        </Box>
      </Box>
      {tab === 'episodes' && episodes.length > 0 ? (
        <Box className="px-screen-x">
          {/* Owner, 2026-10-01 (after 小宇宙): "N episodes" left; order and the Unplayed filter right. */}
          <Box className="flex-row items-center">
            <Text className="flex-1 text-sm font-semibold text-text">{plural(shown.length, 'episode')}</Text>
            <Pressable onPress={() => setOldestFirst((o) => !o)} accessibilityRole="button" accessibilityLabel={oldestFirst ? 'Oldest first. Show newest first' : 'Newest first. Show oldest first'} className="flex-row items-center justify-center gap-1" style={TAP}>
              <Icon name="swap-vertical-outline" size={18} color={c.muted} />
              <Text className="text-xs text-muted">{oldestFirst ? 'Oldest' : 'Newest'}</Text>
            </Pressable>
            <Pressable onPress={() => setUnplayedOnly((u) => !u)} accessibilityRole="button" accessibilityLabel={unplayedOnly ? 'Showing unplayed only. Show all' : 'Show unplayed only'} accessibilityState={{ selected: unplayedOnly }} className="items-center justify-center" style={TAP}>
              {/* Filled vs outline, and the name — never hue alone (FR-016). */}
              <Icon name={unplayedOnly ? 'funnel' : 'funnel-outline'} size={18} color={unplayedOnly ? c.accent : c.muted} />
            </Pressable>
          </Box>
          <Box className="flex-row gap-2" accessibilityRole="tablist">
            {chips.map((v) => (
              <Pressable key={v} onPress={() => setView(v)} accessibilityRole="tab" accessibilityState={{ selected: activeView === v }} accessibilityLabel={v === 'all' ? 'All' : 'Most played'}
                className={`justify-center px-row rounded-pill ${activeView === v ? 'bg-text' : 'bg-surface'}`} style={TAP}>
                <Text className={activeView === v ? 'text-xs font-bold text-background' : 'text-xs text-text'}>{v === 'all' ? 'All' : 'Most played'}</Text>
              </Pressable>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );

  // FR-063: the host row — the creator's own names from the Studio, else the feed's author.
  const hostLine = hostLineFor(ov, show?.author);
  const similarRow = similarShows(similar, feedUrl, hiddenFeeds);

  const about = (
    <Box className="px-screen-x py-section gap-section">
      {show?.description === undefined ? <Text className="text-sm text-muted">This show has no description.</Text> : (
        <Text className="text-sm leading-[22px] text-text">{htmlToText(show.description)}</Text>
      )}
      {hostLine === undefined ? null : (
        <Box className="flex-row items-center gap-row" accessible accessibilityLabel={`Hosted by ${hostLine}`}>
          <Box className="w-10 h-10 rounded-pill bg-surface items-center justify-center"><Icon name="person-outline" size={20} color={c.muted} /></Box>
          <Box className="flex-1">
            <Text className="text-xs text-muted">Hosted by</Text>
            <Text className="text-sm font-semibold text-text" numberOfLines={2}>{hostLine}</Text>
          </Box>
        </Box>
      )}
      {curator ? <CuratorLine curator={curator} row iconColour={c.muted} /> : null}
      {similarRow.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-base font-bold text-text" accessibilityRole="header">Similar shows</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row">
            {similarRow.map((s) => (
              <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={s.title} className="w-24">
                <Artwork url={s.imageUrl} size={96} rounded="row" name={s.title} />
                <Text className="text-xs text-text mt-1" numberOfLines={2}>{s.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Box>
      ) : null}
      <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" className="self-start justify-center" style={TAP}>
        <Text className="text-sm text-muted">{reportedShow ? 'Reported' : 'Report this show'}</Text>
      </Pressable>
    </Box>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <TopBar
        onBack={() => router.back()}
        {...(collapsed ? {
          middle: (
            <>
              <Artwork url={ov?.coverUrl ?? show?.imageUrl} size={24} rounded="row" name={title} />
              <Text className="text-sm font-semibold text-text flex-1" numberOfLines={1}>{title ?? ''}</Text>
              <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }}
                className={`justify-center px-row rounded-pill ${subscribed ? 'bg-surface' : 'bg-text'}`} style={TAP}>
                <Text className={subscribed ? 'text-xs font-bold text-muted' : 'text-xs font-bold text-background'}>{subscribed ? 'Subscribed' : 'Subscribe'}</Text>
              </Pressable>
            </>
          ),
        } : {})}
      >
        {/* Phone walk 2026-09-30: with all three icons the slim title showed 7 letters; collapsed, only ⋯ stays. */}
        {collapsed ? null : <BarButton label="Share this show" onPress={() => {
          void api.recordShare({ targetKind: 'show', targetId: feedUrl, feedUrl }).catch(() => undefined); // M11 FR-011: never waits
          void Share.share({ message: `${title ?? ''}\n${feedUrl}` }).catch(() => undefined);
        }}>
          <Glyph>↗</Glyph>
        </BarButton>}
        {collapsed ? null : <BarButton label="Search" onPress={() => router.push('/search')}><SearchIcon /></BarButton>}
        <BarButton label="More: report this show" onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })}><Dots /></BarButton>
      </TopBar>
      <FlatList
        data={tab === 'episodes' ? shown : []}
        extraData={[focusTick, playerState]} // FlatList is pure: without this the rows keep their old text
        keyExtractor={(episode) => episode.id}
        ListHeaderComponent={header}
        contentContainerClassName="pb-24"
        onScroll={(e) => { const past = e.nativeEvent.contentOffset.y > COLLAPSE_AT; if (past !== collapsed) setCollapsed(past); }}
        scrollEventThrottle={32}
        // iOS i13: "No episodes yet." showed while the show was still loading.
        ListEmptyComponent={tab === 'about' ? about : show === undefined && failed === undefined ? undefined : (
          <Text className="p-screen-x text-muted">{failed === undefined ? 'No episodes yet.' : failed}</Text>
        )}
        renderItem={({ item }) => {
          const notes = noteSummary(item.shownotesHtml);
          const plays = counts.listeners?.[item.id] ?? 0;
          const talk = counts.counts[item.id] ?? 0;
          // Owner, 2026-10-01: "duration · ago  🎧 plays  💬 comments" with icons; the label keeps the words.
          const metaIn = { durationMs: item.durationMs, publishedAt: item.publishedAt, plays, comments: talk, progress: progressFor(item), now };
          const meta = metaLabel(metaIn);
          return (
            <Box className="flex-row gap-row px-screen-x py-row items-start">
              <Pressable
                className="flex-1 flex-row gap-row"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${meta}`}
                onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.id } })}
              >
                <Artwork url={item.imageUrl ?? show?.imageUrl} size={64} rounded="row" name={show?.title} />
                <Box className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-text" numberOfLines={2}>{item.title}</Text>
                  {notes === '' ? null : <Text className="text-xs text-muted" numberOfLines={2}>{notes}</Text>}
                  <EpisodeMeta {...metaIn} iconColour={c.muted} />
                </Box>
              </Pressable>
              <Pressable
                onPress={() => playOrPause(item)}
                accessibilityRole="button"
                accessibilityLabel={isPlaying(item.id) ? `Pause ${item.title}` : `Play ${item.title}`}
                className="w-12 h-12 rounded-pill bg-accentTint items-center justify-center mt-2"
              >
                {isPlaying(item.id) ? <PauseIcon size={14} /> : <PlayIcon size={16} />}
              </Pressable>
              <Pressable onPress={() => setMenuFor(item)} accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} className="items-center justify-center mt-2" style={TAP}>
                <Icon name="ellipsis-vertical" size={18} color={c.muted} />
              </Pressable>
            </Box>
          );
        }}
        ListFooterComponent={<ReportSheet target={reporting} onClose={() => setReporting(undefined)} />}
      />
      <Actionsheet isOpen={menuFor !== undefined} onClose={() => setMenuFor(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pt-row pb-10 items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          {menuFor ? (
            <>
              <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{menuFor.title}</Text>
              <QueueButtons episodeId={menuFor.id} />
              <DownloadButton episodeId={menuFor.id} />
              <EpisodeExtras episodeId={menuFor.id} atMs={stores.positions.get(menuFor.id)?.offsetMs ?? 0} />
            </>
          ) : null}
          <Pressable onPress={() => setMenuFor(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-sm text-muted">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
    </SafeAreaView>
  );
}
