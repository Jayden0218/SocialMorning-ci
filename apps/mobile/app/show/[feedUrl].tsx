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
 * The reference's subscriber count and "most popular" filter are left out: this app
 * has neither number, and it does not invent one.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Share } from 'react-native';
import { FlatList } from '../../src/ui/lib/flat-list';
import { Pressable } from '../../src/ui/lib/pressable';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { refreshShow } from '../../src/feeds/fetch';
import { ago, htmlToText, minutesLabel, mmss } from '../../src/ui/format';
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
import { noun } from '@socialmorning/social-core';

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
  const title = ov?.title ?? show?.title;
  const description = ov?.description ?? show?.description;
  useFocusEffect(useCallback(() => { setFocusTick((n) => n + 1); }, []));

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
  const now = Date.now();
  // M10 minor mode (Settings → Minor mode): explicit episodes are not listed.
  const allowed = getPref(stores.settings, 'hideExplicit') ? episodes.filter((e) => !e.explicit) : episodes;
  const shown = oldestFirst ? [...allowed].reverse() : allowed;

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

  const header = (
    <Box>
      <Box className="px-screen-x pt-row gap-section">
        <Box className="flex-row gap-section items-start">
          <Box className="flex-1 gap-2">
            <Text className="text-[28px] leading-[36px] font-bold text-text" accessibilityRole="header">{title ?? 'Loading…'}</Text>
            {description === undefined ? null : (
              <Text className="text-sm text-muted" numberOfLines={2}>{htmlToText(description)}</Text>
            )}
            {show?.author === undefined ? null : <Text className="text-sm text-muted mt-2" numberOfLines={1}>{show.author}</Text>}
          </Box>
          <Artwork url={ov?.coverUrl ?? show?.imageUrl} size={120} rounded="artwork" />
        </Box>
        <Box className="flex-row items-center gap-section">
          <Text className="text-text">
            <Text className="text-lg font-bold text-text">{episodes.length}</Text>
            <Text className="text-xs text-muted"> {noun(episodes.length, 'episode')}</Text>
          </Text>
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
        {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} /> : null}
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
        <Box className="flex-row items-center justify-end px-screen-x">
          {/* M12 B12: the count is in the header once; this row holds only the order. */}
          <Pressable onPress={() => setOldestFirst((o) => !o)} accessibilityRole="button" accessibilityLabel={oldestFirst ? 'Oldest first. Show newest first' : 'Newest first. Show oldest first'} className="justify-center" style={TAP}>
            <Text className="text-sm text-muted">{oldestFirst ? 'Oldest first ↑' : 'Newest first ↓'}</Text>
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );

  const about = (
    <Box className="px-screen-x py-section gap-section">
      {show?.description === undefined ? <Text className="text-sm text-muted">This show has no description.</Text> : (
        <Text className="text-sm leading-[22px] text-text">{htmlToText(show.description)}</Text>
      )}
      {show?.author === undefined ? null : <Text className="text-sm text-muted">By {show.author}</Text>}
      <Pressable onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })} accessibilityRole="button" accessibilityLabel="Report this show" className="self-start justify-center" style={TAP}>
        <Text className="text-sm text-muted">{reportedShow ? 'Reported' : 'Report this show'}</Text>
      </Pressable>
    </Box>
  );

  return (
    <SafeAreaView className="flex-1 bg-background">
      <TopBar onBack={() => router.back()}>
        <BarButton label="Share this show" onPress={() => {
          void api.recordShare({ targetKind: 'show', targetId: feedUrl, feedUrl }).catch(() => undefined); // M11 FR-011: never waits
          void Share.share({ message: `${title ?? ''}\n${feedUrl}` }).catch(() => undefined);
        }}>
          <Glyph>↗</Glyph>
        </BarButton>
        <BarButton label="Search" onPress={() => router.push('/search')}><SearchIcon /></BarButton>
        <BarButton label="More: report this show" onPress={() => setReporting({ kind: 'show', id: feedUrl, authorId: null, label: 'show' })}><Dots /></BarButton>
      </TopBar>
      <FlatList
        data={tab === 'episodes' ? shown : []}
        extraData={[focusTick, playerState]} // FlatList is pure: without this the rows keep their old text
        keyExtractor={(episode) => episode.id}
        ListHeaderComponent={header}
        contentContainerClassName="pb-24"
        // iOS i13: "No episodes yet." showed while the show was still loading.
        ListEmptyComponent={tab === 'about' ? about : show === undefined && failed === undefined ? undefined : (
          <Text className="p-screen-x text-muted">{failed === undefined ? 'No episodes yet.' : failed}</Text>
        )}
        renderItem={({ item }) => {
          const notes = htmlToText(item.shownotesHtml).replace(/\s+/g, ' ');
          const meta = [minutesLabel(item.durationMs), ago(item.publishedAt, now), progressFor(item)].filter((p) => p !== '').join(' · ');
          return (
            <Box className="flex-row gap-row px-screen-x py-row items-start">
              <Pressable
                className="flex-1 flex-row gap-row"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${meta}`}
                onPress={() => router.push({ pathname: '/episode/[id]', params: { id: item.id } })}
              >
                <Artwork url={item.imageUrl ?? show?.imageUrl} size={64} rounded="row" />
                <Box className="flex-1 gap-1">
                  <Text className="text-sm font-semibold text-text" numberOfLines={2}>{item.title}</Text>
                  {notes === '' ? null : <Text className="text-xs text-muted" numberOfLines={2}>{notes}</Text>}
                  <Text className="text-xs text-muted">{meta}</Text>
                </Box>
              </Pressable>
              <Pressable
                onPress={() => playOrPause(item)}
                accessibilityRole="button"
                accessibilityLabel={isPlaying(item.id) ? `Pause ${item.title}` : `Play ${item.title}`}
                className="w-12 h-12 rounded-pill bg-surface items-center justify-center mt-2"
              >
                {isPlaying(item.id) ? <PauseIcon size={14} /> : <PlayIcon size={16} />}
              </Pressable>
            </Box>
          );
        }}
        ListFooterComponent={<ReportSheet target={reporting} onClose={() => setReporting(undefined)} />}
      />
    </SafeAreaView>
  );
}
