/** One episode (FR-003), and the tap that starts audio (Story 1 scenario 2). */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { htmlToText, mmss, shortDate } from '../../src/ui/format';
import { useStores } from '../../src/ui/providers';
import { toPlayable } from '../../src/storage/playable';
import { DownloadButton } from '../../src/ui/DownloadButton';
import { QueueButtons } from '../../src/ui/QueueButtons';
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

  if (episode === undefined) {
    return (
      <ScrollView contentContainerClassName="p-3 gap-2">
        <Text className="text-base font-bold text-text">This episode is no longer in the feed.</Text>
      </ScrollView>
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

  return (
    <ScrollView contentContainerClassName="p-3 gap-2">
      <Text className="text-base font-bold text-text">{episode.title}</Text>
      <Text className="text-[13px] text-muted">
        {[shortDate(episode.publishedAt), episode.durationMs === undefined ? '' : mmss(episode.durationMs)]
          .filter((part) => part !== '')
          .join(' · ')}
      </Text>
      {saved === undefined ? null : (
        <Text className="text-[13px] text-muted">
          {saved.finished ? 'Finished — plays from the start' : `Resumes at ${mmss(saved.offsetMs)}`}
        </Text>
      )}
      <Pressable
        className="self-start py-2.5 px-5 rounded-pill bg-accent my-2"
        accessibilityRole="button"
        accessibilityLabel="Play this episode"
        onPress={() => {
          player.load(playable, 'play');
          router.push('/player');
        }}
      >
        <Text className="text-onAccent font-bold">Play</Text>
      </Pressable>
      <DownloadButton episodeId={episode.id} />
      <QueueButtons episodeId={episode.id} onQueued={() => stores.inboxState.mark(episode.id, 'queued', Date.now())} />
      <Text className="text-[14px] leading-[20px] text-text">{htmlToText(episode.shownotesHtml)}</Text>
      <ClipList episode={playable} />
      <NextUp items={nextUp.items} onOpen={(c) => void discoverOpen(c)} />
      <CommentList
        episodeId={episode.id}
        comments={cached?.social.comments ?? []}
        serverTime={cached?.social.serverTime ?? new Date().toISOString()}
        stale={stale}
        onSeek={playFrom}
        onReply={(parentId) => setComposing(composer.open({ episodeId: episode.id, offsetMs: snapshotOffset, ...(episode.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }, parentId))}
        onCompose={() => setComposing(composer.open({ episodeId: episode.id, offsetMs: snapshotOffset, ...(episode.durationMs !== undefined ? { durationMs: episode.durationMs } : {}) }))}
      />
      {composing ? (
        <ComposerSheet initial={composing} onClose={() => setComposing(undefined)} onPosted={() => { void refresh(episode.id); }} />
      ) : null}
    </ScrollView>
  );
}

