/**
 * One episode (FR-003), and the tap that starts audio (Story 1 scenario 2).
 *
 * Laid out after the owner's reference (2026-09-27): back, Subscribe, share and more in
 * the bar; small artwork, then the title large with a round play button beside it; the
 * show's name as a link; "69 min · 13 h ago" with the comment count; then the shownotes,
 * where every timestamp ("00:39") is a link that plays from there.
 *
 * Owner, 2026-10-01 (after the 小宇宙 episode page): the title is text-lg, at most 4 lines; once
 * the page scrolls past it the bar shows the show's 24 pt art, its name, share and a round play
 * button (above that point: back, share and ⋯; Subscribe sits beside the show's name); the
 * page ends with "Related episodes" (next-up, at most 5).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking } from 'react-native';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '../../src/ui/lib/actionsheet';
import { Pressable } from '../../src/ui/lib/pressable';
import { SafeAreaView } from '../../src/ui/lib/safe-area-view';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { enqueue } from '@socialmorning/player-core';
import { useColours } from '../../src/ui/useColours';
import { Icon } from '../../src/ui/Icon';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { ago, minutesLabel, mmss, noteParts } from '../../src/ui/format';
import { useStores, useSubscriptionSync, useToast } from '../../src/ui/providers';
import { isFavourite, toggleFavourite } from '../../src/me/favourites';
import { Artwork } from '../../src/ui/Artwork';
import { BarButton, TAP, TopBar } from '../../src/ui/TopBar';
import { toPlayable } from '../../src/storage/playable';
import { DownloadButton } from '../../src/ui/DownloadButton';
import { QueueButtons } from '../../src/ui/QueueButtons';
import { EpisodeExtras } from '../../src/ui/me/EpisodeExtras';
import { useSocial } from '../../src/social/context';
import { usePoll } from '../../src/social/usePoll';
import type { ComposerState } from '../../src/social/composer';
import { CommentPreview } from '../../src/ui/CommentPreview';
import { ShareChooser } from '../../src/ui/ShareChooser';
import { ShowExtrasBlock, useShowExtras } from '../../src/ui/ShowExtras';
import { ComposerSheet } from '../../src/ui/Composer';
import { ClipList } from '../../src/ui/ClipList';
import { useNextUp } from '../../src/ui/NextUp';
import { RelatedEpisodes } from '../../src/ui/episode/RelatedEpisodes';
import { useDiscover } from '../../src/discover/useDiscover';

export default function EpisodeScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const episode = id === undefined ? undefined : stores.feeds.getEpisode(id);
  const { composer, useEpisodeSocial, refresh, api } = useSocial();
  // M5 (FR-008): "Next up" for this episode; absent when the server has no answer.
  const nextUp = useNextUp(episode?.id);
  const { open: discoverOpen } = useDiscover();
  const playerState = usePlayerState();
  const [composing, setComposing] = useState<ComposerState | undefined>();
  usePoll(episode?.id);
  const { cached, stale } = useEpisodeSocial(episode?.id);
  const subscriptionSync = useSubscriptionSync();
  const [subscribed, setSubscribed] = useState(() => episode !== undefined && stores.subscriptions.has(episode.feedUrl));
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const toast = useToast();
  // Play next, download and save-a-moment live in the ⋯ sheet, so the page itself is
  // only what the reference shows (owner, 2026-09-27).
  const [more, setMore] = useState(false);
  // M12 FR-033: Share opens a first step (episode link · this moment · picture).
  const [sharing, setSharing] = useState(false);
  const [fav, setFav] = useState(() => episode !== undefined && isFavourite(stores.settings, episode.id));
  // M11 (FR-023): a poll the host attached to this episode.
  const [extras, replacePoll] = useShowExtras(episode?.feedUrl ?? '');
  // Owner, 2026-10-01: the bar collapses once the title has scrolled away. Where the title
  // block ends is measured by its onLayout; until then the bar never collapses.
  const [titleBottom, setTitleBottom] = useState<number | undefined>();
  const [collapsed, setCollapsed] = useState(false);

  if (episode === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <TopBar onBack={() => router.back()} />
        <Text className="px-screen-x text-base font-bold text-text">This episode is no longer in the feed.</Text>
      </SafeAreaView>
    );
  }

  const show = stores.feeds.getShow(episode.feedUrl);
  const saved = stores.positions.get(episode.id);
  // M2 (FR-003): a complete download plays from its file; toPlayable decides.
  const playable = toPlayable(stores, episode.id) ?? {
    id: episode.id,
    url: episode.enclosureUrl,
    title: episode.title,
    showTitle: show?.title ?? '',
    ...((episode.imageUrl ?? show?.imageUrl) !== undefined ? { artworkUrl: episode.imageUrl ?? show?.imageUrl } : {}),
    ...(episode.durationMs !== undefined && { durationMs: episode.durationMs }),
  };
  const openComments = () => router.push({ pathname: '/comments/[episodeId]', params: { episodeId: episode.id, at: String(Math.round(snapshotOffset)) } });
  const playFrom = (offsetMs: number) => {
    // If this episode is already loaded, seek; otherwise load paused-at-start then seek.
    if (playerState.kind !== 'idle' && playerState.episodeId === episode.id) {
      player.seek(offsetMs);
      player.play();
    } else {
      player.load(playable, 'play');
      player.seek(offsetMs);
    }
    router.push('/player');
  };
  // The comment box from this screen uses the listener's current position in THIS
  // episode if it is loaded, else the saved position, else the start (US1 #4).
  const snapshotOffset: number =
    playerState.kind !== 'idle' && playerState.episodeId === episode.id && 'positionMs' in playerState && playerState.positionMs !== undefined
      ? playerState.positionMs
      : (saved?.offsetMs ?? 0);

  const loaded = playerState.kind !== 'idle' && playerState.episodeId === episode.id;
  const playing = loaded && (playerState.kind === 'playing' || playerState.kind === 'buffering');
  const playOrPause = () => {
    if (playing) { player.pause(); return; }
    if (loaded) player.play(); else player.load(playable, 'play');
    router.push('/player');
  };
  const toggleSubscription = () => {
    if (stores.subscriptions.has(episode.feedUrl)) { stores.subscriptions.remove(episode.feedUrl); setSubscribed(false); }
    else { stores.subscriptions.add(episode.feedUrl, Date.now()); setSubscribed(true); }
    subscriptionSync.push();
  };
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  // M12 FR-003/030/031: text, tappable links and chapter times inside the episode.
  const notes = noteParts(episode.shownotesHtml, episode.durationMs);

  const addToQueue = () => {
    const r = enqueue(stores.queue.list(), episode.id, 'end');
    if (r.refused) { toast('The queue is full (300). Remove something first.'); return; }
    stores.queue.replace(r.queue, Date.now());
    stores.inboxState.mark(episode.id, 'queued', Date.now());
    toast(r.evicted ? 'Added to the queue — the last item was dropped.' : 'Added to the queue');
  };
  const resume = saved === undefined ? '' : saved.finished ? 'finished' : `resumes at ${mmss(saved.offsetMs)}`;
  // M12 FR-035: length and date on one line, where you stopped on its own — it was cut to "resumes…".
  const meta = [minutesLabel(episode.durationMs), ago(episode.publishedAt, Date.now())].filter((p) => p !== '').join(' · ');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <TopBar
        onBack={() => router.back()}
        {...(collapsed ? {
          middle: (
            <>
              <Artwork url={show?.imageUrl ?? episode.imageUrl} size={24} rounded="row" name={show?.title} />
              <Text className="text-sm font-semibold text-text flex-1" numberOfLines={1}>{show?.title ?? ''}</Text>
            </>
          ),
        } : {})}
      >
        <BarButton label="Share this episode" onPress={() => setSharing(true)}>
          <Icon name="share-outline" size={24} color={c.text} />
        </BarButton>
        {collapsed ? (
          <Pressable onPress={playOrPause} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play this episode'} className="items-center justify-center" style={TAP}>
            <Box className="w-9 h-9 rounded-pill bg-surface items-center justify-center">
              <Icon name={playing ? 'pause' : 'play'} size={18} color={c.text} />
            </Box>
          </Pressable>
        ) : (
          <BarButton label="More: play next, download, save a moment" onPress={() => setMore(true)}>
            <Icon name="ellipsis-horizontal" size={24} color={c.text} />
          </BarButton>
        )}
      </TopBar>
      <ScrollView
        ref={scroll}
        contentContainerClassName="px-screen-x pb-section"
        scrollEventThrottle={32}
        onScroll={(e) => {
          if (titleBottom === undefined) return;
          const past = e.nativeEvent.contentOffset.y > titleBottom;
          if (past !== collapsed) setCollapsed(past);
        }}
      >
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={48} rounded="row" className="mt-2" name={show?.title} />
        <Box className="flex-row items-center gap-section mt-section" onLayout={(e) => setTitleBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
          <Text className="flex-1 text-lg font-bold text-text" numberOfLines={4} accessibilityRole="header">{episode.title}</Text>
          <Pressable
            className="w-14 h-14 rounded-pill bg-surface items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play this episode'}
            onPress={playOrPause}
          >
            <Icon name={playing ? 'pause' : 'play'} size={26} color={c.text} />
          </Pressable>
        </Box>
        <Box className="flex-row items-center gap-row">
          {show === undefined ? null : (
            <Pressable
              onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(episode.feedUrl) } })}
              accessibilityRole="link"
              accessibilityLabel={`Show: ${show.title}`}
              className="flex-shrink flex-row items-center gap-1"
              style={TAP}
            >
              <Text className="text-sm text-text flex-shrink" numberOfLines={1}>{show.title}</Text>
              <Icon name="chevron-forward" size={16} color={c.text} />
            </Pressable>
          )}
          {/* Owner, 2026-10-01: Subscribe moved here from the bar, which now holds only share and ⋯. */}
          <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }} className="justify-center" style={TAP}>
            <Text className={subscribed ? 'text-xs font-semibold px-row py-1 rounded-pill bg-surface text-muted' : 'text-xs font-semibold px-row py-1 rounded-pill bg-surface text-text'}>{subscribed ? 'Subscribed' : '+ Subscribe'}</Text>
          </Pressable>
        </Box>
        <Box className="flex-row items-center">
          <Box className="flex-1">
            <Text className="text-sm text-muted" numberOfLines={1}>{meta}</Text>
            {resume !== '' ? <Text className="text-xs text-accent" numberOfLines={1}>{resume}</Text> : null}
          </Box>
          <BarButton label="Add to queue" onPress={addToQueue}>
            <Icon name="list-outline" size={24} color={c.text} />
          </BarButton>
          <BarButton label={`Comments, ${commentCount}`} onPress={openComments}>
            <Box className="flex-row items-end">
              <Icon name="chatbox-ellipses-outline" size={24} color={c.text} />
              <Text className="text-xs text-text">{commentCount}</Text>
            </Box>
          </BarButton>
          <Pressable onPress={() => setFav(toggleFavourite(stores.settings, episode.id, Date.now()))} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} className="items-center justify-center" style={TAP}>
            {/* Filled vs outline, and the name — never hue alone (FR-016). */}
            <Icon name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? c.accent : c.text} />
          </Pressable>
        </Box>
        <Box className="h-px bg-separator mt-row mb-section" />
        {notes.length === 0 ? null : (
          <Text className="text-sm leading-[28px] text-text">
            {notes.map((part, i) =>
              part.href !== undefined ? (
                <Text
                  key={i}
                  className="text-accent underline"
                  accessibilityRole="link"
                  accessibilityLabel={`${part.text}, opens in the browser`}
                  onPress={() => void Linking.openURL(part.href!).catch(() => undefined)}
                >
                  {part.text}
                </Text>
              ) : part.atMs === undefined ? part.text : (
                <Text
                  key={i}
                  className="text-accent font-semibold underline"
                  accessibilityRole="link"
                  accessibilityLabel={`Play from ${part.text}`}
                  onPress={() => playFrom(part.atMs!)}
                >
                  {part.text}
                </Text>
              ),
            )}
          </Text>
        )}
        <Box className="mt-section">
          {extras ? <ShowExtrasBlock extras={extras} onPoll={replacePoll} episodeId={episode.id} /> : null}
          {/* M12 FR-027: a two-comment preview; the conversation has its own page. */}
          <CommentPreview
            comments={cached?.social.comments ?? []}
            serverTime={cached?.social.serverTime ?? new Date().toISOString()}
            stale={stale}
            onSeek={playFrom}
            onOpen={openComments}
          />
        </Box>
        <ClipList episode={playable} />
        <RelatedEpisodes items={nextUp.items} onOpen={(card) => void discoverOpen(card)} />
      </ScrollView>

      <ShareChooser
        open={sharing}
        onClose={() => setSharing(false)}
        episode={{ id: episode.id, title: episode.title, showTitle: show?.title ?? '' }}
        atMs={snapshotOffset}
        onClip={() => router.push({ pathname: '/clip/new', params: { episodeId: episode.id, positionMs: String(Math.round(snapshotOffset)) } })}
        onShared={() => void api.recordShare({ targetKind: 'episode', targetId: episode.id, feedUrl: episode.feedUrl }).catch(() => undefined)}
      />
            <Actionsheet isOpen={more} onClose={() => setMore(false)}>
        <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
        <ActionsheetContent className="bg-background rounded-t-2xl px-screen-x pt-row pb-10 items-stretch">
          <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
          <Text className="text-sm font-bold text-text py-row" numberOfLines={2}>{episode.title}</Text>
          <QueueButtons episodeId={episode.id} onQueued={() => stores.inboxState.mark(episode.id, 'queued', Date.now())} />
          <DownloadButton episodeId={episode.id} />
          {/* M10 (owner, 2026-09-27): favourite, and save this moment with a note. */}
          <EpisodeExtras episodeId={episode.id} atMs={snapshotOffset} />
          {/* M12 FR-032: a Cancel row closes the list, as a list sheet should. */}
          <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Cancel" className="items-center justify-center mt-row" style={TAP}>
            <Text className="text-sm text-muted">Cancel</Text>
          </Pressable>
        </ActionsheetContent>
      </Actionsheet>
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(episode.id); }} />
      ) : null}
    </SafeAreaView>
  );
}
