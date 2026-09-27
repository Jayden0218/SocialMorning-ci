/**
 * One episode (FR-003), and the tap that starts audio (Story 1 scenario 2).
 *
 * Laid out after the owner's reference (2026-09-27): back, Subscribe, share and more in
 * the bar; small artwork, then the title large with a round play button beside it; the
 * show's name as a link; "69 min · 13 h ago" with the comment count; then the shownotes,
 * where every timestamp ("00:39") is a link that plays from there.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Share, Text, View } from 'react-native';
import { enqueue } from '@socialmorning/player-core';
import { colour } from '../../src/design';
import { Icon } from '../../src/ui/Icon';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { ago, htmlToText, minutesLabel, mmss, timestampParts } from '../../src/ui/format';
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
import { CommentList } from '../../src/ui/CommentList';
import { ComposerSheet } from '../../src/ui/Composer';
import { ClipList } from '../../src/ui/ClipList';
import { NextUp, useNextUp } from '../../src/ui/NextUp';
import { useDiscover } from '../../src/discover/useDiscover';

export default function EpisodeScreen(): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const episode = id === undefined ? undefined : stores.feeds.getEpisode(id);
  const { composer, useEpisodeSocial, refresh } = useSocial();
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
  const [commentsY, setCommentsY] = useState(0);
  const toast = useToast();
  // Play next, download and save-a-moment live in the ⋯ sheet, so the page itself is
  // only what the reference shows (owner, 2026-09-27).
  const [more, setMore] = useState(false);
  const [fav, setFav] = useState(() => episode !== undefined && isFavourite(stores.settings, episode.id));

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
  const toggleSubscription = () => {
    if (stores.subscriptions.has(episode.feedUrl)) { stores.subscriptions.remove(episode.feedUrl); setSubscribed(false); }
    else { stores.subscriptions.add(episode.feedUrl, Date.now()); setSubscribed(true); }
    subscriptionSync.push();
  };
  const commentCount = (cached?.social.comments ?? []).reduce((n, c) => n + (c.deleted ? 0 : 1) + (c.replies ?? []).filter((r) => !r.deleted).length, 0);
  const notes = htmlToText(episode.shownotesHtml);

  const addToQueue = () => {
    const r = enqueue(stores.queue.list(), episode.id, 'end');
    if (r.refused) { toast('The queue is full (300). Remove something first.'); return; }
    stores.queue.replace(r.queue, Date.now());
    stores.inboxState.mark(episode.id, 'queued', Date.now());
    toast(r.evicted ? 'Added to the queue — the last item was dropped.' : 'Added to the queue');
  };
  const resume = saved === undefined ? '' : saved.finished ? 'finished' : `resumes at ${mmss(saved.offsetMs)}`;
  const meta = [minutesLabel(episode.durationMs), ago(episode.publishedAt, Date.now()), resume].filter((p) => p !== '').join(' · ');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <TopBar onBack={() => router.back()}>
        <Pressable onPress={toggleSubscription} accessibilityRole="button" accessibilityLabel={subscribed ? 'Unsubscribe from this show' : 'Subscribe to this show'} accessibilityState={{ selected: subscribed }} className="justify-center" style={TAP}>
          <Text className={subscribed ? 'text-sm font-semibold px-row py-2 rounded-row bg-surface text-muted' : 'text-sm font-semibold px-row py-2 rounded-row bg-surface text-text'}>{subscribed ? 'Subscribed' : '+ Subscribe'}</Text>
        </Pressable>
        <BarButton label="Share this episode" onPress={() => { void Share.share({ message: `${episode.title} — ${show?.title ?? ''}\n${episode.enclosureUrl}` }).catch(() => undefined); }}>
          <Icon name="share-outline" size={24} color={colour.text} />
        </BarButton>
        <BarButton label="More: play next, download, save a moment" onPress={() => setMore(true)}>
          <Icon name="ellipsis-horizontal" size={24} color={colour.text} />
        </BarButton>
      </TopBar>
      <ScrollView ref={scroll} contentContainerClassName="px-screen-x pb-24">
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={48} rounded="row" className="mt-2" />
        <View className="flex-row items-center gap-section mt-section">
          <Text className="flex-1 text-[26px] leading-[34px] font-bold text-text" accessibilityRole="header">{episode.title}</Text>
          <Pressable
            className="w-14 h-14 rounded-pill bg-surface items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play this episode'}
            onPress={() => {
              if (playing) { player.pause(); return; }
              if (loaded) player.play(); else player.load(playable, 'play');
              router.push('/player');
            }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={26} color={colour.text} />
          </Pressable>
        </View>
        {show === undefined ? null : (
          <Pressable
            onPress={() => router.push({ pathname: '/show/[feedUrl]', params: { feedUrl: encodeURIComponent(episode.feedUrl) } })}
            accessibilityRole="link"
            accessibilityLabel={`Show: ${show.title}`}
            className="self-start flex-row items-center gap-1"
            style={TAP}
          >
            <Text className="text-sm text-text">{show.title}</Text>
            <Icon name="chevron-forward" size={16} color={colour.text} />
          </Pressable>
        )}
        <View className="flex-row items-center">
          <Text className="flex-1 text-sm text-muted" numberOfLines={1}>{meta}</Text>
          <BarButton label="Add to queue" onPress={addToQueue}>
            <Icon name="list-outline" size={24} color={colour.text} />
          </BarButton>
          <BarButton label={`Comments, ${commentCount}`} onPress={() => scroll.current?.scrollTo({ y: commentsY, animated: true })}>
            <View className="flex-row items-end">
              <Icon name="chatbox-ellipses-outline" size={24} color={colour.text} />
              <Text className="text-xs text-text">{commentCount}</Text>
            </View>
          </BarButton>
          <Pressable onPress={() => setFav(toggleFavourite(stores.settings, episode.id, Date.now()))} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} className="items-center justify-center" style={TAP}>
            {/* Filled vs outline, and the name — never hue alone (FR-016). */}
            <Icon name={fav ? 'heart' : 'heart-outline'} size={24} color={fav ? colour.accent : colour.text} />
          </Pressable>
        </View>
        <View className="h-px bg-separator mt-row mb-section" />
        {notes === '' ? null : (
          <Text className="text-sm leading-[28px] text-text">
            {timestampParts(notes).map((part, i) =>
              part.atMs === undefined ? part.text : (
                <Text
                  key={i}
                  className="text-text font-semibold underline"
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
        <View className="mt-section" onLayout={(e) => setCommentsY(e.nativeEvent.layout.y)}>
          <CommentList
            episodeId={episode.id}
            comments={cached?.social.comments ?? []}
            serverTime={cached?.social.serverTime ?? new Date().toISOString()}
            stale={stale}
            onSeek={playFrom}
            onReply={(parentId) => setComposing(composer.open({ episodeId: episode.id, offsetMs: snapshotOffset, ...(episode.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }, parentId))}
            onCompose={() => setComposing(composer.open({ episodeId: episode.id, offsetMs: snapshotOffset, ...(episode.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }))}
          />
        </View>
        <ClipList episode={playable} />
        <NextUp items={nextUp.items} onOpen={(c) => void discoverOpen(c)} />
      </ScrollView>

      <Modal visible={more} animationType="slide" transparent onRequestClose={() => setMore(false)}>
        <Pressable className="flex-1 bg-scrim" accessibilityRole="button" accessibilityLabel="Close" onPress={() => setMore(false)} />
        <View className="bg-background rounded-t-2xl px-screen-x pt-section pb-10 gap-row">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold text-text" numberOfLines={1}>{episode.title}</Text>
            <Pressable onPress={() => setMore(false)} accessibilityRole="button" accessibilityLabel="Close" className="justify-center pl-row" style={TAP}>
              <Text className="text-sm text-accent">Done</Text>
            </Pressable>
          </View>
          <QueueButtons episodeId={episode.id} onQueued={() => stores.inboxState.mark(episode.id, 'queued', Date.now())} />
          <DownloadButton episodeId={episode.id} />
          {/* M10 (owner, 2026-09-27): favourite, and save this moment with a note. */}
          <EpisodeExtras episodeId={episode.id} atMs={snapshotOffset} />
        </View>
      </Modal>
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(episode.id); }} />
      ) : null}
    </SafeAreaView>
  );
}
