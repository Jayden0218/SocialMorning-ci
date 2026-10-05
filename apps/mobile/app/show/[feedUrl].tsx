// One show: artwork, title, Subscribe, episodes list and About tab with similar shows.
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
 *
 * M17 (constitution v3.0.0, `Show-B`): the Editorial layout. A centred hero — 156 pt artwork with
 * a soft shadow, the title in 32 pt serif, the author in the accent, two lines of description —
 * then a yellow Subscribe pill with round Share, Search and ⋯ buttons beside it (they were in
 * the bar, which now holds only back until the page scrolls). The announcement is a white card;
 * Episodes / About is a pill track carrying the count, with order and Unplayed beside it; All /
 * Most played are underlined tabs; each episode is a white card with a serif title and a round
 * play button over its ⋯. Every action, name and handler is the one it was.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Linking, ScrollView, Share } from 'react-native';
import { useSharePanel } from '@/ui/clips/ShareChooser';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { refreshShow } from '@/feeds/fetch';
import { htmlToText, mmss, noteSummary } from '@/ui/kit/format';
import { usePlayer, usePlayerState } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { Artwork } from '@/ui/kit/Artwork';
import { Dots, PauseIcon, PlayIcon } from '@/ui/kit/Icon';
import { HeroArtwork } from '@/ui/episode/HeroArtwork';
import { BarButton, TAP, TopBar } from '@/ui/kit/TopBar';
import { useSafety } from '@/safety/context';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { getPref } from '@/settings/prefs';
import { ShowExtrasBlock, useShowExtras } from '@/ui/show/ShowExtras';
import { useSocial } from '@/social/context';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { QueueButtons } from '@/ui/queue/QueueButtons';
import { DownloadButton } from '@/ui/episode/DownloadButton';
import { EpisodeExtras } from '@/ui/me/EpisodeExtras';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { useM12Api } from '@/social/m12-api';
import { genreOf, similarShows } from '@/discover/genres';
import type { ShowCard } from '@/social/api';
import { hasPlays, matchEpisodes, orderEpisodes, type ListView } from '@/ui/show/order';
import { FilterBar } from '@/ui/me/FilterBar';
import { EpisodeMeta, metaLabel } from '@/ui/show/EpisodeMeta';
import { AnnouncementCard } from '@/ui/show/AnnouncementCard';
import { CuratorLine, hostLineFor } from '@/ui/show/CuratorLine';
import { EndOfList } from '@/ui/kit/EndOfList';

/** How far the page scrolls before the slim bar takes over (about the title block's height; M17's 156 pt hero made it taller). */
export const COLLAPSE_AT = 220;
/** M17: a round white 48 pt button beside Subscribe (`Show-B`). */
const ROUND = 'w-12 h-12 rounded-pill bg-surface border border-border items-center justify-center';

export default function ShowScreen(): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
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
  // M16a T005 (FR-015): Share opens the app's panel; the system sheet is behind its "More".
  const [share, sharePanel] = useSharePanel();
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
  // Owner, 2026-10-05: Search looks inside this show's episodes only (it opened the app's search).
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  const searchText = useMemo(
    () => new Map(episodes.map((e) => [e.id, `${e.title}\n${htmlToText(e.shownotesHtml ?? '')}`])),
    [episodes],
  );
  const toggleSearch = () => {
    if (searching) { setSearching(false); setTerm(''); return; }
    setTab('episodes');
    setSearching(true);
  };
  const now = Date.now();
  // M10 minor mode (Settings → Minor mode): explicit episodes are not listed.
  const allowed = getPref(stores.settings, 'hideExplicit') ? episodes.filter((e) => !e.explicit) : episodes;
  const playsKnown = hasPlays(counts.listeners);
  // "Most played" hides with no counts; the list then reads as "All" (orderEpisodes agrees).
  const activeView: ListView = playsKnown ? view : 'all';
  const ordered = orderEpisodes(allowed, {
    oldestFirst, view, unplayedOnly,
    isFinished: (id) => stores.positions.get(id)?.finished === true,
    ...(counts.listeners !== undefined ? { listeners: counts.listeners } : {}),
  });
  const shown = searching ? matchEpisodes(ordered, term, (e) => searchText.get(e.id) ?? e.title) : ordered;

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
  const shareShow = () => {
    void api.recordShare({ targetKind: 'show', targetId: feedUrl, feedUrl }).catch(() => undefined); // M11 FR-011: never waits
    // Owner, 2026-10-05 ("all"): the show's own options before "More". There is no show web page,
    // so the link is the feed, as before. WhatsApp and Telegram open by their https share links
    // (no app scheme to declare); without the app they open in the browser.
    const message = `${title ?? ''}\n${feedUrl}`;
    const open = (url: string, app: string) => void Linking.openURL(url).catch(() => toast(`Couldn't open ${app}.`));
    share({
      heading: 'Share this show',
      ...(title ? { subtitle: title } : {}),
      rows: [
        { icon: 'link-outline', label: 'Copy link', onPress: () => { Clipboard.setString(feedUrl); toast('Link copied.'); } },
        { icon: 'chatbubbles-outline', label: 'Send in chat', onPress: () => router.push({ pathname: '/chat/new', params: { text: message } }) },
        { icon: 'logo-whatsapp', label: 'WhatsApp', onPress: () => open(`https://wa.me/?text=${encodeURIComponent(message)}`, 'WhatsApp') },
        { icon: 'paper-plane-outline', label: 'Telegram', onPress: () => open(`https://t.me/share/url?url=${encodeURIComponent(feedUrl)}&text=${encodeURIComponent(title ?? '')}`, 'Telegram') },
      ],
      more: { detail: 'other apps', run: () => void Share.share({ message }).catch(() => undefined) },
    });
  };
  const header = (
    <Box>
      {/* M17: the centred hero — artwork, serif title, curator, author, description. */}
      <Box className="items-center px-screen-x">
        <HeroArtwork url={ov?.coverUrl ?? show?.imageUrl} size={156} name={title} />
        <Text className="text-text text-display font-display text-center mt-row" accessibilityRole="header">{title ?? 'Loading…'}</Text>
        {/* M15 US4: the curator, under the title — never through the "Hosted by" line (G-C1). */}
        {curator ? <CuratorLine curator={curator} iconColour={c.muted} /> : null}
        {show?.author === undefined ? null : <Text className="text-accent text-meta font-semibold text-center mt-1" numberOfLines={1}>{show.author}</Text>}
        {description === undefined || tab === 'about' ? null : (
          <Text className="text-muted text-body leading-[21px] text-center mt-gap" numberOfLines={2}>{htmlToText(description)}</Text>
        )}
      </Box>
      <Box className="px-screen-x pt-section gap-section">
        {/* Owner, 2026-10-01: the episode count sits once, on the Episodes tab (it follows the filter). */}
        <Box className="flex-row items-center gap-gap">
          <Pressable
            className={`flex-1 items-center justify-center rounded-pill px-section ${subscribed ? 'bg-surface border border-border' : 'bg-primary'}`}
            style={TAP}
            accessibilityRole="button"
            accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
            accessibilityState={{ selected: subscribed }}
            onPress={toggleSubscription}
          >
            <Text className={subscribed ? 'text-body font-bold text-muted' : 'text-body font-bold text-onPrimary'}>{subscribed ? 'Subscribed' : '+ Subscribe'}</Text>
          </Pressable>
          {/* M17: share, search and ⋯ as round white buttons beside Subscribe (they were in the bar). */}
          <Pressable onPress={shareShow} accessibilityRole="button" accessibilityLabel="Share this show" className={ROUND} style={TAP}>
            <Icon name="share-outline" size={20} color={c.text} />
          </Pressable>
          <Pressable onPress={toggleSearch} accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : "Search this show's episodes"} accessibilityState={{ expanded: searching }} className={ROUND} style={TAP}>
            <Icon name={searching ? 'close' : 'search-outline'} size={20} color={c.text} />
          </Pressable>
          <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="More: report this show" className={ROUND} style={TAP}>
            <Icon name="ellipsis-horizontal" size={20} color={c.text} />
          </Pressable>
        </Box>
        {searching ? <FilterBar term={term} onTerm={setTerm} placeholder="Search this show's episodes" /> : null}
        {reportedShow ? <Text className="text-meta text-accent">You reported this show. It stays in your library; it is hidden from discovery for you.</Text> : null}
        {hiddenShow ? <Text className="text-meta text-accent">Hidden from discovery by moderation. It stays in your library.</Text> : null}
        {stale ? <Text className="text-meta text-accent">Showing the last copy — refresh failed</Text> : null}
        {failed === undefined ? null : <Text className="text-meta text-accent">{failed}</Text>}
        {/* Owner, 2026-10-01: the newest announcement as one card under the header. */}
        {latestAnnouncement ? <AnnouncementCard announcement={latestAnnouncement} iconColour={c.text} /> : null}
        {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} noAnnouncements /> : null}
        {/* M17: Episodes / About as a pill track (owner, 2026-10-05: order and filter moved to the row under it). */}
        <Box className="flex-row items-center gap-gap">
          <Box className="flex-row gap-1 p-1 bg-surface border border-border rounded-pill" accessibilityRole="tablist">
            {(['episodes', 'about'] as const).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} accessibilityLabel={t === 'episodes' ? 'Episodes' : 'About'} className={`justify-center px-section rounded-pill ${tab === t ? 'bg-primary' : ''}`} style={TAP}>
                <Text className={tab === t ? 'text-meta font-bold text-onPrimary' : 'text-meta text-muted'}>
                  {t === 'about' ? 'About' : episodes.length > 0 ? `Episodes · ${shown.length}` : 'Episodes'}
                </Text>
              </Pressable>
            ))}
          </Box>
        </Box>
      </Box>
      {tab === 'episodes' && episodes.length > 0 ? (
        <Box className="px-screen-x flex-row items-center gap-gap">
          {/* Owner, 2026-10-05: no "All" tab — "Most played" is one switch (tap again for the feed's
              order) — and Newest and the Unplayed filter sit on this row, at its right. */}
          {playsKnown ? (
            <Pressable onPress={() => setView((v) => (v === 'mostPlayed' ? 'all' : 'mostPlayed'))} accessibilityRole="button" accessibilityState={{ selected: activeView === 'mostPlayed' }} accessibilityLabel="Most played"
              className="justify-center" style={TAP}>
              <Text className={activeView === 'mostPlayed' ? 'text-meta font-bold text-text' : 'text-meta text-muted'}>Most played</Text>
              <Box className={`h-0.5 mt-1 rounded-pill ${activeView === 'mostPlayed' ? 'bg-primary' : 'bg-clear'}`} />
            </Pressable>
          ) : null}
          <Box className="flex-1" />
          <Pressable onPress={() => setOldestFirst((o) => !o)} accessibilityRole="button" accessibilityLabel={oldestFirst ? 'Oldest first. Show newest first' : 'Newest first. Show oldest first'} className="flex-row items-center justify-center gap-1" style={TAP}>
            <Icon name="swap-vertical-outline" size={18} color={c.muted} />
            <Text className="text-xs text-muted">{oldestFirst ? 'Oldest' : 'Newest'}</Text>
          </Pressable>
          <Pressable onPress={() => setUnplayedOnly((u) => !u)} accessibilityRole="button" accessibilityLabel={unplayedOnly ? 'Showing unplayed only. Show all' : 'Show unplayed only'} accessibilityState={{ selected: unplayedOnly }} className="items-center justify-center" style={TAP}>
            {/* Filled vs outline, and the name — never hue alone (FR-016). */}
            <Icon name={unplayedOnly ? 'funnel' : 'funnel-outline'} size={18} color={unplayedOnly ? c.accent : c.muted} />
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );

  // FR-063: the host row — the creator's own names from the Studio, else the feed's author.
  const hostLine = hostLineFor(ov, show?.author);
  const similarRow = similarShows(similar, feedUrl, hiddenFeeds);

  const about = (
    <Box className="px-screen-x py-section gap-section">
      {show?.description === undefined ? <Text className="text-body text-muted">This show has no description.</Text> : (
        <Text className="text-body leading-[22px] text-text">{htmlToText(show.description)}</Text>
      )}
      {hostLine === undefined ? null : (
        <Box className="flex-row items-center gap-row" accessible accessibilityLabel={`Hosted by ${hostLine}`}>
          <Box className="w-10 h-10 rounded-pill bg-surface border border-border items-center justify-center"><Icon name="person-outline" size={20} color={c.muted} /></Box>
          <Box className="flex-1">
            <Text className="text-xs text-muted">Hosted by</Text>
            <Text className="text-body font-semibold text-text" numberOfLines={2}>{hostLine}</Text>
          </Box>
        </Box>
      )}
      {curator ? <CuratorLine curator={curator} row iconColour={c.muted} /> : null}
      {similarRow.length > 0 ? (
        <Box className="gap-row">
          <Text className="text-lg font-display text-text" accessibilityRole="header">Similar shows</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-row">
            {similarRow.map((s) => (
              <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={s.title} className="w-24">
                <Artwork url={s.imageUrl} size={96} name={s.title} />
                <Text className="text-meta font-display-semibold text-text mt-1" numberOfLines={2}>{s.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Box>
      ) : null}
      <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" className="self-start justify-center" style={TAP}>
        <Text className="text-body text-muted">{reportedShow ? 'Reported' : 'Report this show'}</Text>
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
              <Text className="text-body font-semibold text-text flex-1" numberOfLines={1}>{title ?? ''}</Text>
              <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }}
                className={`justify-center px-row rounded-pill ${subscribed ? 'bg-surface border border-border' : 'bg-primary'}`} style={TAP}>
                <Text className={subscribed ? 'text-xs font-bold text-muted' : 'text-xs font-bold text-onPrimary'}>{subscribed ? 'Subscribed' : 'Subscribe'}</Text>
              </Pressable>
            </>
          ),
        } : {})}
      >
        {/* M17 (`Show-B`): share, search and ⋯ sit beside Subscribe on the page; once it has scrolled
            away the slim bar keeps ⋯, as it did (phone walk 2026-09-30: room for the title). */}
        {collapsed ? <BarButton label="More: report this show" onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })}><Dots /></BarButton> : null}
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
          <Text className="p-screen-x text-body text-muted">{failed !== undefined ? failed : searching && term.trim() !== '' && ordered.length > 0 ? `No episodes match "${term.trim()}".` : 'No episodes yet.'}</Text>
        )}
        renderItem={({ item }) => {
          const notes = noteSummary(item.shownotesHtml);
          const plays = counts.listeners?.[item.id] ?? 0;
          const talk = counts.counts[item.id] ?? 0;
          // Owner, 2026-10-01: "duration · ago  🎧 plays  💬 comments" with icons; the label keeps the words.
          const metaIn = { durationMs: item.durationMs, publishedAt: item.publishedAt, plays, comments: talk, progress: progressFor(item), now };
          const meta = metaLabel(metaIn);
          return (
            // M17: each episode a white card — serif title, two lines of notes, the meta; play over ⋯ on the right.
            <Box className="mx-screen-x mt-gap bg-surface border border-border rounded-row p-row flex-row gap-row items-start">
              <Pressable
                className="flex-1 gap-1"
                style={TAP}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${meta}`}
                onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.id } })}
              >
                <Text className="text-title font-display text-text leading-[22px]" numberOfLines={3}>{item.title}</Text>
                {notes === '' ? null : <Text className="text-meta text-muted leading-[19px]" numberOfLines={2}>{notes}</Text>}
                <EpisodeMeta {...metaIn} iconColour={c.muted} />
              </Pressable>
              <Box className="items-center">
                <Pressable
                  onPress={() => playOrPause(item)}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying(item.id) ? `Pause ${item.title}` : `Play ${item.title}`}
                  className={`w-12 h-12 rounded-pill items-center justify-center ${isPlaying(item.id) ? 'bg-primary' : 'bg-accentTint'}`}
                >
                  {isPlaying(item.id) ? <PauseIcon size={14} tint="onPrimary" /> : <PlayIcon size={16} tint="accent" />}
                </Pressable>
                <Pressable onPress={() => setMenuFor(item)} accessibilityRole="button" accessibilityLabel={`More for ${item.title}`} className="items-center justify-center" style={TAP}>
                  <Icon name="ellipsis-horizontal" size={18} color={c.muted} />
                </Pressable>
              </Box>
            </Box>
          );
        }}
        ListFooterComponent={<>{tab === 'episodes' && shown.length > 0 ? <EndOfList /> : undefined}<ReportSheet target={reporting} onClose={() => setReporting(undefined)} /></>}
      />
      <Actionsheet isOpen={menuFor !== undefined} onClose={() => setMenuFor(undefined)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-surface rounded-t-row px-screen-x pt-row items-stretch">
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
            <Text className="text-accent text-sm font-bold">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
      {sharePanel}
    </SafeAreaView>
  );
}
