// One show: artwork stage, episodes as a mosaic, Hot moments, About, and the thumb zone with Subscribe.
/**
 * One show: its header, its episodes newest first, and whether what we are
 * looking at is fresh (FR-002).
 *
 * The cached copy renders IMMEDIATELY and the refresh happens behind it. A
 * screen that waits for the network before showing episodes it already has
 * is the opposite of Principle IV.
 *
 * Spec 039 (Detail template, design B): a `DetailList` (`PageList`): Back, the show's name, search and More in the title row; the header is the
 * cover (96) beside the hosts line and the description, then Subscribe / Share / the Episodes · About pill, the chip row (a `Shelf`) and the
 * "Episodes" heading; the episodes are row cards, 8 apart. About and Similar shows are `Section`s. The 300 tall art stage, the glass
 * circles, the 2 x 2 newest tile, the edge labels and the absolutely placed thumb zone are gone; the newest row carries the hot chip.
 *
 * History (every behaviour below survived each redraw): "Most played" sorts by FR-061's listener counts and hides itself when
 * there are none (owner, 2026-10-01); rows add plays and comments from one server call (M12 FR-061); About adds the host row and up to 6
 * similar shows from the show's genre chart (FR-063); the host's newest announcement (owner 2026-10-01; RSS has no announcement tag, FR-062);
 * M21 US5 (FR-040…FR-043): our own subscriber count ("New here" under 10) and the hosts' faces, each opening their profile; the chips are
 * All / Host picks (only when the host marked some in the Studio) / Most popular; "Add all to playlist" queues the list as shown, up to 300;
 * ⋯ opens a sheet with Show info and Report; an episode's ⋯ or a long-press opens the shared episode sheet (US4, FR-035).
 *
 * M31 W3-A2 (T040; design-pulse2 `show--screen`, layout Mosaic + Stage; the owner's rule: "completely the same, or explain why it is
 * different"). The show's art fills the top 300 and fades to void; search and ⋯ are two glass circles top right. The list sits under an
 * "Episodes" section heading: the newest episode is a 2 x 2 art tile with its hot chip (the time of its hottest moment, when the show's
 * Hot moments are in), the others 2 x 1 tiles — cover 56, title, the played curve, length · date, a 36 play disc. Over the tiles one row of
 * chips: All · Host picks · Most popular · Hot moments (NEW), then Newest/Oldest and Unplayed, to scroll to. Hot moments is a Deck of 290 x
 * 340 cards (src/ui/show/HotMoments.tsx), fed by `GET /v1/discover/moments?feedUrl=`. The thumb zone holds the hosts line, back, the
 * title in Unbounded 30, one line of description with "Show all", then Subscribe, the Share circle and the Episodes · About pill. About is
 * the same page: the description, the host row, the announcement, links, poll, curator and paid-episodes tile, and a Deck of similar shows.
 * The slim collapsing bar is gone (the thumb zone is always on screen, like the Episode page's). An episode's ⋯ left the tile: the Details
 * sheet opens on a long-press and as the tile's "More for …" screen-reader action (the drawing's action map: "long-press (Details sheet)").
 * "Add all to playlist" is a long-press on the chip row and a row of the ⋯ sheet. While searching, the field takes the hosts line's place
 * ("field drops to the bottom").
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, Share } from 'react-native';
import { LINK_REFUSED, openSystem } from '@/ui/kit/openLink';
import { useSharePanel } from '@/ui/clips/ShareChooser';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { refreshShow } from '@/feeds/fetch';
import { readHiddenGuids, saveHiddenGuids, withoutHidden } from '@/feeds/hidden';
import { htmlToText, mmss } from '@/ui/kit/format';
import { usePlayer, usePlayerSelector } from '@/playback/store';
import type { PlayerState } from '@/playback/types';
import { toPlayable } from '@/storage/playable';
import { useSafety } from '@/safety/context';
import { ReportSheet, type ReportTarget } from '@/ui/comments/ReportSheet';
import { useStores, useSubscriptionSync, useToast } from '@/ui/shell/providers';
import type { CachedEpisode, CachedShow } from '@/storage/types';
import { getPref } from '@/settings/prefs';
import { ShowExtrasBlock, useShowExtras } from '@/ui/show/ShowExtras';
import { ShowSales } from '@/ui/show/ShowSales';
import { useSocial } from '@/social/context';
import { EpisodeRowSheet } from '@/ui/kit/EpisodeRowSheet';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Avatar } from '@/ui/kit/Avatar';
import { Chip } from '@/ui/kit/Chip';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { IconButton, PulseButton } from '@/ui/kit/PulseButton';
import { PanelRow } from '@/ui/kit/PanelRow';
import { Type } from '@/ui/kit/Type';
import { bars, colour, radius, spacing } from '@/design';
import { drawnType } from '@/design/type-px';
import { addAllMessage, addAllToQueue, hostPicksOf, subsShort } from '@/ui/show/show-page';
import { useM12Api } from '@/social/m12-api';
import { genreOf, similarShows } from '@/discover/genres';
import type { ShowCard } from '@/social/api';
import { hasPlays, matchEpisodes, orderEpisodes, type ListView } from '@/ui/show/order';
import { EpisodeMeta, metaLabel } from '@/ui/show/EpisodeMeta';
import { AnnouncementCard } from '@/ui/show/AnnouncementCard';
import { CuratorLine, hostLineFor } from '@/ui/show/CuratorLine';
import { EndOfList } from '@/ui/kit/EndOfList';
import { PanelGroup } from '@/ui/me/Panel';
import { SearchField } from '@/ui/me/lists';
import { Artwork } from '@/ui/kit/Artwork';
import { useMomentActions } from '@/ui/discover/useMomentActions';
import { HotMoments } from '@/ui/show/HotMoments';
import { useShowMoments } from '@/ui/show/useShowMoments';
import { SHOW } from '@/ui/show/measures';
import { CoverBand, DeckCard } from '@/ui/discover/Deck';
import { CardShelf } from '@/ui/detail/CardShelf';
import { DetailList } from '@/ui/detail/DetailPage';
import { Section, Shelf } from '@/ui/kit/layout';
import { hotChip, hottestOf } from '@/ui/show/hot-moments';
import { nowMs as clockMs } from '@/ui/kit/clock';

/** M23 US7: what a row needs from the player — "p:<id>" playing, "l:<id>" loaded, "" idle. Positions never. */
const playKeyOf = (s: PlayerState): string =>
  s.kind === 'playing' || s.kind === 'buffering' ? `p:${s.episodeId}` : s.kind !== 'idle' && s.episodeId !== undefined ? `l:${s.episodeId}` : '';

/** The show's cover in the header. */
const HEAD_COVER = 96;

/** The tiles' progress meter: an even curve, lit up to where you stopped (the list keeps no per-episode heat). */
const EVEN = Array.from({ length: 100 }, () => 0.5);
// 036 lane F: three small controls become 44 pt frames, the layout as drawn (a negative margin takes back what the frame adds; never `hitSlop` alone).
/** A host's 26 (22 + 2 ring each side) avatar: the frame overhangs it by 9 on every side. */
const HOST_FRAME_OVERHANG = (bars.circle - (SHOW.hostAvatar + 4)) / 2;
/** "Show all" beside the description: the 18 line gets 13 above and below. */
const SHOW_ALL_FRAME = { minHeight: bars.circle, marginVertical: -13 };
/** The Episodes / About tabs sit in the 48 pill: the frame fits inside it (no margin). */
const TAB_FRAME = { minWidth: bars.circle, minHeight: bars.circle };

type RowProps = {
  item: CachedEpisode; plays: number; talk: number; progress: string; share: number; now: number; playing: boolean; iconColour: string;
  /** The newest episode: the time of its hottest moment when known. */
  hot: string | undefined; onHot: (() => void) | undefined;
  onOpen: (e: CachedEpisode) => void; onPlay: (e: CachedEpisode) => void; onMenu: (e: CachedEpisode) => void;
};

/**
 * Each episode a row card (spec 039; was the mosaic's 2 x 1 tile and the newest 2 x 2): cover 56, title, the played curve,
 * length · date, play 36; the newest also carries the time of its hottest moment. M23 US7: memoised, and the notes are not parsed here at all (the tile has no notes line).
 */
const EpisodeTile = memo(function EpisodeTile({ item, plays, talk, progress, share, now, playing, iconColour, hot, onHot, onOpen, onPlay, onMenu }: RowProps): React.ReactElement {
  // Owner, 2026-10-01: "duration · ago  plays  comments" with icons; the label keeps the words.
  const metaIn = { durationMs: item.durationMs, publishedAt: item.publishedAt, plays, comments: talk, progress, now };
  const meta = metaLabel(metaIn);
  const menu = { accessibilityHint: 'Long-press for more actions', accessibilityActions: [{ name: 'longpress', label: `More for ${item.title}` }], onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => { if (e.nativeEvent.actionName === 'longpress') onMenu(item); } };
  // The light play disc, `size` drawn and 48 to touch; the glyph sits 2 right of centre so it looks centred.
  const disc = (size: number) => (
    <Pressable
      onPress={() => onPlay(item)}
      accessibilityRole="button"
      accessibilityLabel={playing ? `Pause ${item.title}` : `Play ${item.title}`}
      hitSlop={Math.ceil((48 - size) / 2)}
      className="bg-text items-center justify-center"
      style={{ width: size, height: size, minWidth: bars.circle, minHeight: bars.circle, borderRadius: size / 2, paddingLeft: playing ? 0 : 2 }}
    >
      <Icon name={playing ? 'pause' : 'play'} size={Math.round(size * 0.4)} color={colour.void} />
    </Pressable>
  );
  return (
    <Box testID="show-row-tile" className="flex-row items-center bg-raise" style={{ minHeight: SHOW.rowHeight, borderRadius: radius.row, padding: spacing.row, gap: spacing.row }}>
      <Pressable className="flex-1 flex-row items-center" style={{ gap: spacing.row }} accessibilityRole="button" accessibilityLabel={`${item.title}. ${meta}`} onPress={() => onOpen(item)} onLongPress={() => onMenu(item)} {...menu}>
        <Artwork url={item.imageUrl} size={SHOW.rowCover} name={item.title} />
        <Box className="flex-1" style={{ gap: spacing.hair }}>
          <Type step="compact" className="text-text" numberOfLines={1}>{item.title}</Type>
          <Curve data={EVEN} count={SHOW.rowBars} height={SHOW.rowBarsHeight} min={2} played={share} />
          <EpisodeMeta {...metaIn} iconColour={iconColour} />
          {hot !== undefined && onHot ? (
            <Pressable onPress={onHot} accessibilityRole="button" accessibilityLabel={`Play from the hottest moment, ${hot}`} hitSlop={{ top: 11, bottom: 11, left: 4, right: 4 }} className="self-start flex-row items-center rounded-chip bg-hotSoft" style={{ paddingHorizontal: spacing.gap, gap: spacing.hair }}>
              <Icon name="flame-outline" size={12} color={colour.hotText} />
              <Type step="mono" className="text-hotText">{hot}</Type>
            </Pressable>
          ) : null}
        </Box>
      </Pressable>
      {disc(SHOW.rowPlay)}
    </Box>
  );
});

type View = ListView | 'picks' | 'hot';

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
  // 035 B4 (device run 41359074906): the sync after sign-in fills the table after this page mounted; re-read when it does.
  useEffect(() => subscriptionSync.onChange?.(() => setSubscribed(stores.subscriptions.has(feedUrl))), [subscriptionSync, stores, feedUrl]); // `?.`: a stand-in sync without it (several page tests have one) simply never hears
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
  // M21: the same call carries the cover's tint, our subscriber count, the hosts and the host picks.
  const [extras, replacePoll] = useShowExtras(feedUrl, { image: show?.imageUrl });
  // M24 fix F-P (US11): episodes the creator hid in the Studio leave the list — the server's
  // answer once it came (and remembered for offline), else the last answer remembered.
  const serverHidden = extras?.hiddenGuids;
  const hiddenGuids = useMemo(() => (serverHidden !== undefined ? new Set(serverHidden) : readHiddenGuids(stores.settings, feedUrl)), [serverHidden, stores, feedUrl]);
  useEffect(() => { if (serverHidden !== undefined) saveHiddenGuids(stores.settings, feedUrl, serverHidden); }, [serverHidden, stores, feedUrl]);
  const { api } = useSocial();
  const ov = extras?.overrides ?? null;
  const curator = extras?.curator ?? null;
  const title = ov?.title ?? show?.title;
  const description = ov?.description ?? show?.description;
  useFocusEffect(useCallback(() => { setFocusTick((n) => n + 1); }, []));
  const m12 = useM12Api();
  const [menuFor, setMenuFor] = useState<CachedEpisode | undefined>();
  // M21 US5: the show's own ⋯ sheet (Show info, Report) and the description opened in full.
  const [showMenu, setShowMenu] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
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
  const genreId = genre?.id;
  useEffect(() => {
    if (genreId === undefined) return;
    let live = true;
    api.category(genreId).then((r) => { if (live) setSimilar(r.shows); }, () => undefined);
    return () => { live = false; };
  }, [api, genreId]);

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
  const playKey = usePlayerSelector(playKeyOf);
  const [tab, setTab] = useState<'episodes' | 'about'>('episodes');
  const [oldestFirst, setOldestFirst] = useState(false);
  // Owner, 2026-10-01: the "All" / "Most played" chips and an "Unplayed" filter above the list.
  // M21 US5: a third chip, the host's picks. M31 W3-A2: a fourth, Hot moments.
  const [view, setView] = useState<View>('all');
  const [unplayedOnly, setUnplayedOnly] = useState(false);
  // Owner, 2026-10-05: Search looks inside this show's episodes only (it opened the app's search).
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  // M32 T033 (review C9): the notes are turned to text only once search is opened (a feed of 1 000+ episodes).
  const searchText = useMemo(
    () => (searching ? new Map(episodes.map((e) => [e.id, `${e.title}\n${htmlToText(e.shownotesHtml ?? '')}`])) : undefined),
    [episodes, searching],
  );
  const toggleSearch = () => {
    if (searching) { setSearching(false); setTerm(''); return; }
    setTab('episodes');
    setSearching(true);
  };
  // M23 US7: to the minute, so a re-render does not change every memoised row's "ago".
  const now = Math.floor(clockMs() / 60_000) * 60_000;
  // M10 minor mode (Settings → Minor mode): explicit episodes are not listed.
  const visible = withoutHidden(episodes, hiddenGuids);
  const allowed = getPref(stores.settings, 'hideExplicit') ? visible.filter((e) => !e.explicit) : visible;
  const playsKnown = hasPlays(counts.listeners);
  // M21 US5: the host's picks, in the host's order; the chip hides when there are none.
  const picks = hostPicksOf(allowed, extras?.hostPicks);
  // "Most popular" hides with no counts, "Host picks" with no picks; the list then reads as "All".
  const activeView: View = view === 'hot' ? 'hot' : view === 'picks' ? (picks.length > 0 ? 'picks' : 'all') : playsKnown ? view : 'all';
  const listView: ListView = activeView === 'mostPlayed' ? 'mostPlayed' : 'all';
  const isFinished = (id: string) => stores.positions.get(id)?.finished === true;
  const ordered = activeView === 'picks' ? (unplayedOnly ? picks.filter((e) => !isFinished(e.id)) : picks) : orderEpisodes(allowed, {
    oldestFirst, view: listView, unplayedOnly, isFinished,
    ...(counts.listeners !== undefined ? { listeners: counts.listeners } : {}),
  });
  const shown = searching ? matchEpisodes(ordered, term, (e) => searchText?.get(e.id) ?? e.title) : ordered;
  // M21 US5: "Add all to playlist" — the list as shown, to the end of the queue, up to 300.
  const addAll = () => {
    const r = addAllToQueue(stores.queue.list(), shown.map((e) => e.id));
    if (r.added > 0) {
      stores.queue.replace(r.queue, clockMs());
      for (const id of r.queue.slice(-r.added)) stores.inboxState.mark(id, 'queued', clockMs());
    }
    toast(addAllMessage(r));
  };
  const hosts = extras?.hosts ?? [];

  // M31 W3-A2: the show's hot moments (the tab, and the newest tile's hot chip) and the Moments feed's own Play.
  const moments = useShowMoments(feedUrl);
  const momentActions = useMomentActions(undefined);
  const durationOf = useCallback((id: string) => stores.feeds.getEpisode(id)?.durationMs, [stores]);
  const newestHot = shown[0] ? hottestOf(moments.cards, shown[0].id) : undefined;

  const progressFor = (episode: CachedEpisode): string => {
    const row = stores.positions.get(episode.id);
    if (row === undefined) return '';
    if (row.finished) return 'Finished';
    const total = episode.durationMs === undefined ? '' : ` / ${mmss(episode.durationMs)}`;
    return `${mmss(row.offsetMs)}${total}`;
  };
  const shareOf = (episode: CachedEpisode): number => {
    const row = stores.positions.get(episode.id);
    if (row === undefined) return 0;
    if (row.finished) return 1;
    return episode.durationMs && episode.durationMs > 0 ? Math.min(1, row.offsetMs / episode.durationMs) : 0;
  };
  const isPlaying = (id: string) => playKey === `p:${id}`;
  // M23 US7: stable handlers (the rows are memoised); the player is read at the tap.
  const playOrPause = useCallback((episode: CachedEpisode) => {
    const key = playKeyOf(player.getState());
    if (key === `p:${episode.id}`) { player.pause(); return; }
    if (key === `l:${episode.id}`) { player.play(); return; }
    const playable = toPlayable(stores, episode.id);
    if (playable) player.load(playable, 'play');
  }, [player, stores]);
  const openEpisode = useCallback((e: CachedEpisode) => router.push({ pathname: '/episode/[id]', params: { id: e.id } }), [router]);
  const listKey = `${focusTick}|${playKey}`;

  const latestAnnouncement = extras?.announcements[0]; // the server sends newest first
  const shareShow = () => {
    void api.recordShare({ targetKind: 'show', targetId: feedUrl, feedUrl }).catch(reportAndDrop('share.record')); // M11 FR-011: never waits
    // Owner, 2026-10-05 ("all"): the show's own options before "More". There is no show web page,
    // so the link is the feed, as before. WhatsApp and Telegram open by their https share links
    // (no app scheme to declare); without the app they open in the browser.
    const message = `${title ?? ''}\n${feedUrl}`;
    const open = (url: string, app: string) => void openSystem(url, () => toast(LINK_REFUSED)).then((ok) => { if (!ok) toast(`Couldn't open ${app}.`); });
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

  // FR-063: the host row — the creator's own names from the Studio, else the feed's author.
  const hostLine = hostLineFor(ov, show?.author);
  const similarRow = similarShows(similar, feedUrl, hiddenFeeds);
  const coverUrl = ov?.coverUrl ?? show?.imageUrl;
  const subs = subsShort(extras?.subscribers);
  const countLine = [allowed.length > 0 ? `${allowed.length} eps` : '', subs ?? ''].filter((p) => p !== '').join(' · ');
  const desc = description === undefined ? '' : htmlToText(description);
  const strip = [reportedShow ? 'You reported this show. It stays in your library; it is hidden from discovery for you.' : '', hiddenShow ? 'Hidden from discovery by moderation. It stays in your library.' : '', stale ? 'Showing the last copy — refresh failed' : '', failed ?? ''].filter((p) => p !== '');
  // M31 F9 (listen.html `show--search`): with a query typed the page IS the results — the Results heading over the matching rows, no chips.
  const resultsMode = searching && term.trim() !== '';
  const chips = tab === 'episodes' && !resultsMode ? (
    // The chips: All · Host picks · Most popular · Hot moments (NEW), then Newest/Oldest and Unplayed. A long-press on the row adds the list to the queue.
    <Pressable onLongPress={addAll} accessible={false} accessibilityLabel={`Add all to playlist, ${shown.length} episodes`}>
      <Shelf>
        {episodes.length > 0 ? <Chip compact label="All" chosen={activeView === 'all'} onPress={() => setView('all')} /> : null}
        {picks.length > 0 ? <Chip compact label="Host picks" chosen={activeView === 'picks'} onPress={() => setView('picks')} /> : null}
        {playsKnown ? <Chip compact label="Most popular" chosen={activeView === 'mostPlayed'} onPress={() => setView('mostPlayed')} /> : null}
        <Chip compact label="Hot moments" accessibilityLabel="Hot moments, new" tag="NEW" chosen={activeView === 'hot'} onPress={() => setView('hot')} />
        {activeView !== 'hot' ? (
          <>
            <Chip compact label={oldestFirst ? 'Oldest' : 'Newest'} accessibilityLabel={oldestFirst ? 'Oldest first. Show newest first' : 'Newest first. Show oldest first'} onPress={() => setOldestFirst((o) => !o)} />
            <Chip compact label="Unplayed" chosen={unplayedOnly} accessibilityLabel={unplayedOnly ? 'Showing unplayed only. Show all' : 'Show unplayed only'} onPress={() => setUnplayedOnly((u) => !u)} />
          </>
        ) : null}
      </Shelf>
    </Pressable>
  ) : null;
  const stripBox = strip.length > 0 ? (
    <Box testID="show-strip" className="bg-raise" style={{ borderRadius: radius.row, padding: spacing.row }} accessibilityLiveRegion="polite">
      <Type step="caption" className="text-hotText" numberOfLines={3}>{strip.join(' ')}</Type>
    </Box>
  ) : null;

  const about = (
    <Box testID="show-about" style={{ gap: spacing.block }}>
    <Section title="About">
    <Box style={{ gap: spacing.row }}>
      {description === undefined ? <Type step="body" className="text-text2">This show has no description.</Type> : (
        <Type step="body" className="text-text">{htmlToText(description)}</Type>
      )}
      {hostLine === undefined ? null : (
        <Box className="flex-row items-center bg-raise" accessible accessibilityLabel={`Hosted by ${hostLine}`} style={{ borderRadius: radius.row, padding: spacing.row, gap: spacing.row }}>
          <Icon name="person-outline" size={20} color={colour.hotText} />
          <Box className="flex-1">
            <Type step="tag" className="text-text3">Hosted by</Type>
            <Type step="row" className="text-text" numberOfLines={2}>{hostLine}</Type>
          </Box>
        </Box>
      )}
      {/* Owner, 2026-10-01: the newest announcement as one card; then the host's links, poll and contacts. */}
      {latestAnnouncement ? <AnnouncementCard announcement={latestAnnouncement} iconColour={colour.text} /> : null}
      {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} noAnnouncements /> : null}
      {curator ? <CuratorLine curator={curator} row iconColour={colour.text2} /> : null}
      {/* M20 US6: paid episodes and tips — Android with purchases switched on only; nothing otherwise. */}
      <ShowSales feedUrl={feedUrl} showTitle={title ?? ''} {...(coverUrl ? { artworkUrl: coverUrl } : {})} tipsEnabled={extras?.tipsEnabled === true} />
      <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" className="self-start justify-center" style={{ minHeight: 48 }}>
        <Type step="row" className="text-text2">{reportedShow ? 'Reported' : 'Report this show'}</Type>
      </Pressable>
    </Box>
    </Section>
      {similarRow.length > 0 ? (
        <Section title="Similar shows">
          <CardShelf width={SHOW.similarCard.width} height={SHOW.similarCard.cover + 56}>
            {similarRow.map((s) => (
              <Pressable key={s.feedUrl} onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(s.feedUrl) } })} accessibilityRole="button" accessibilityLabel={s.title} className="flex-1">
                <DeckCard>
                  <CoverBand url={s.imageUrl} name={s.title} height={SHOW.similarCard.cover} />
                  <Box style={{ padding: spacing.row }}>
                    <Type step="compact" className="text-text" numberOfLines={2}>{s.title}</Type>
                  </Box>
                </DeckCard>
              </Pressable>
            ))}
          </CardShelf>
        </Section>
      ) : null}
    </Box>
  );

  // The empty parts of the list: Hot moments, About, or no episodes.
  const empty = tab === 'about' ? about : activeView === 'hot' ? (
    <Section title="Episodes">
      <HotMoments status={moments.status} cards={moments.cards} all={moments.all} durationOf={durationOf} onPlay={momentActions.playFull} onRetry={moments.reload} />
    </Section>
  ) : show === undefined && failed === undefined ? undefined : (
    <Type step="body" className="text-text2">{failed !== undefined ? failed : searching && term.trim() !== '' && ordered.length > 0 ? `No episodes match "${term.trim()}".` : 'No episodes yet.'}</Type>
  );

  const hostsRow = (
    <Box className="flex-row items-center" style={{ gap: spacing.row }}>
      {hosts.length > 0 ? (
        <Box className="flex-row items-center">
          {hosts.slice(0, 3).map((h, i) => (
            <Pressable key={h.id} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: h.id } })} accessibilityRole="link" accessibilityLabel={`Host: ${h.name}`} hitSlop={spacing.row} className="items-center justify-center" style={{ minWidth: bars.circle, minHeight: bars.circle, marginLeft: (i === 0 ? 0 : -SHOW.hostOverlap) - HOST_FRAME_OVERHANG, marginRight: -HOST_FRAME_OVERHANG, marginVertical: -HOST_FRAME_OVERHANG }}>
              <Box style={{ borderWidth: 2, borderColor: colour.void, borderRadius: SHOW.hostAvatar }}>
                <Avatar url={h.avatarUrl} name={h.name} size={SHOW.hostAvatar} />
              </Box>
            </Pressable>
          ))}
        </Box>
      ) : null}
      <Type step="caption" className="text-text2 flex-1" style={drawnType.tileNote} numberOfLines={1}>{hosts.length > 0 ? `Hosted by ${hosts.map((h) => h.name).join(', ')} ›` : hostLine !== undefined ? `Hosted by ${hostLine}` : ''}</Type>
      {countLine !== '' ? <Type step="mono" className="text-text2" numberOfLines={1}>{countLine}</Type> : null}
    </Box>
  );

  return (
    <>
      <DetailList
        testID="show-page"
        title={title ?? 'Loading…'}
        onBack={() => router.back()}
        trailing={
          <Box className="flex-row" style={{ gap: spacing.row }}>
            <IconButton icon={searching ? 'close' : 'search-outline'} label={searching ? 'Close search' : "Search this show's episodes"} onPress={toggleSearch} fill />
            <IconButton icon="ellipsis-horizontal" label="More: show info, report this show" onPress={() => setShowMenu(true)} fill />
          </Box>
        }
        gap={spacing.gap}
        header={
          <Box style={{ gap: spacing.row }}>
            {resultsMode ? null : (
              <Box testID="show-head" className="flex-row" style={{ gap: spacing.section }}>
                <Artwork url={coverUrl ?? null} size={HEAD_COVER} {...(title !== undefined ? { name: title } : {})} />
                <Box className="flex-1 min-w-0" style={{ gap: spacing.gap }}>
                  {searching ? null : hostsRow}
                  {desc === '' ? null : (
                    <Box className="flex-row items-center" style={{ gap: spacing.hair }}>
                      <Type step="caption" className="text-text2 flex-shrink" {...(descOpen ? {} : { numberOfLines: 3 })}>{desc}</Type>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
            {/* M21 US5: a tap opens the whole description; another closes it. */}
            {desc === '' || resultsMode ? null : (
              <Pressable onPress={() => setDescOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={descOpen ? 'Description. Show less' : 'Description. Show all'} accessibilityState={{ expanded: descOpen }} className="self-start justify-center" style={SHOW_ALL_FRAME}>
                <Type step="caption" className="text-text">{descOpen ? 'Show less' : 'Show all'}</Type>
              </Pressable>
            )}
            {searching ? <SearchField value={term} onChange={setTerm} placeholder="Search this show's episodes" autoFocus /> : null}
            {stripBox}
            {resultsMode ? null : (
              <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
                <PulseButton
                  label={subscribed ? 'Subscribed' : 'Subscribe'}
                  accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'}
                  kind={subscribed ? 'quiet' : 'light'}
                  selected={subscribed}
                  onPress={toggleSubscription}
                  className="flex-1 min-w-0"
                  fit
                />
                <IconButton icon="share-outline" label="Share this show" onPress={shareShow} fill size={20} diameter={48} />
                <Box className="flex-row items-center bg-raise rounded-pill flex-shrink" style={{ height: 48, paddingHorizontal: spacing.section - 2, gap: spacing.hair }}>
                  <Pressable onPress={() => setTab('episodes')} accessibilityRole="button" accessibilityLabel="Episodes" accessibilityState={{ selected: tab === 'episodes' }} hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }} className="items-center justify-center flex-shrink" style={TAB_FRAME}>
                    <Type step="row" className={tab === 'episodes' ? 'text-text' : 'text-text2'}>Episodes</Type>
                  </Pressable>
                  <Type step="row" className="text-text3" accessible={false}>·</Type>
                  <Pressable onPress={() => { setSearching(false); setTerm(''); setTab('about'); }} accessibilityRole="button" accessibilityLabel="About" accessibilityState={{ selected: tab === 'about' }} hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }} className="items-center justify-center flex-shrink" style={TAB_FRAME}>
                    <Type step="row" className={tab === 'about' ? 'text-text' : 'text-text2'}>About</Type>
                  </Pressable>
                </Box>
              </Box>
            )}
            {chips}
            {tab === 'episodes' && activeView !== 'hot' && shown.length > 0 ? <Type step="heading" accessibilityRole="header" className="text-text">{resultsMode ? 'Results' : 'Episodes'}</Type> : null}
          </Box>
        }
        data={tab === 'episodes' && activeView !== 'hot' ? shown : []}
        extraData={listKey} // FlatList is pure: without this the rows keep their old text (M23: one string, not a new array per render)
        keyExtractor={(episode) => episode.id}
        // iOS i13: "No episodes yet." showed while the show was still loading.
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <EpisodeTile
            item={item}
            plays={counts.listeners?.[item.id] ?? 0}
            talk={counts.counts[item.id] ?? 0}
            progress={progressFor(item)}
            share={shareOf(item)}
            now={now}
            playing={isPlaying(item.id)}
            iconColour={colour.text3}
            hot={index === 0 && !resultsMode && newestHot ? hotChip(newestHot).replace('HOT · ', '') : undefined}
            onHot={index === 0 && !resultsMode && newestHot ? () => momentActions.playFull(newestHot) : undefined}
            onOpen={openEpisode}
            onPlay={playOrPause}
            onMenu={setMenuFor}
          />
        )}
        ListFooterComponent={<>{tab === 'episodes' && activeView !== 'hot' && shown.length > 0 ? <EndOfList /> : undefined}<ReportSheet target={reporting} onClose={() => setReporting(undefined)} /></>}
      />
      {/* M21 US4 (FR-035): the shared episode sheet, from a long-press (and the tile's "More for …" action). */}
      <EpisodeRowSheet
        episode={menuFor ? { id: menuFor.id, title: menuFor.title, feedUrl, showTitle: title, imageUrl: menuFor.imageUrl ?? ov?.coverUrl ?? show?.imageUrl } : undefined}
        comments={menuFor ? counts.counts[menuFor.id] : undefined}
        onClose={() => setMenuFor(undefined)}
      />
      {/* M21 US5 (FR-041): the show's ⋯ — Show info, Add all to playlist, and Report as before. */}
      <ActionSheet open={showMenu} onClose={() => setShowMenu(false)} label="Show menu" title={title ?? 'More'}>
        <PanelGroup>
          <PanelRow icon="information-circle-outline" label="Show info" onPress={() => { setShowMenu(false); router.push({ pathname: '/show-info/[feedUrl]', params: { feedUrl: encodeURIComponent(feedUrl) } }); }} />
          <PanelRow icon="list-outline" label="Add all to playlist" accessibilityLabel={`Add all to playlist, ${shown.length} episodes`} detail={`${shown.length} episodes`} onPress={() => { setShowMenu(false); addAll(); }} />
          <PanelRow icon="flag-outline" label={reportedShow ? 'Reported' : 'Report this show'} onPress={() => { setShowMenu(false); setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' }); }} />
        </PanelGroup>
        <PulseButton label="Cancel" kind="quiet" hotWords onPress={() => setShowMenu(false)} full />
      </ActionSheet>
      {sharePanel}
    </>
  );
}
