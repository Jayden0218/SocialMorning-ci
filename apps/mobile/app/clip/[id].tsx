/**
 * A clip link opened on this phone (M4 US1, FR-003/FR-004). Both link forms land here
 * (expo-router: `socialmorning://clip/<id>` and the verified https link). Works signed
 * out: clips are public. Resolution order in `src/graph/resolve.ts`.
 */
import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { router, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { refreshShow } from '../../src/feeds/fetch';
import { resolveClipEpisode, type Resolved } from '../../src/graph/resolve';
import { ClipCard } from '../../src/ui/ClipCard';
import { shareClip } from '../../src/graph/share';
import { apiBaseUrl } from '../../src/social/base-url';
import { ApiError, type Clip } from '../../src/social/api';

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; clip: Clip; resolved: Resolved };

export default function ClipScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const stores = useStores();
  const player = usePlayer();
  const state = usePlayerState();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setStatus({ kind: 'loading' });
    (async () => {
      try {
        const { clip, episode } = await api.getClip(String(id));
        const resolved = await resolveClipEpisode({ stores, refreshShow: (url) => refreshShow(url, stores.feeds, Date.now()) }, episode);
        if (!live) return;
        setStatus({ kind: 'ready', clip, resolved });
        if (!clip.deleted) player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs });
      } catch (e) {
        if (!live) return;
        const message = e instanceof ApiError ? (e.code === 'not_found' ? 'No such clip.' : e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e);
        setStatus({ kind: 'error', message });
      }
    })();
    return () => { live = false; };
  }, [id, api, stores, player]);

  if (status.kind === 'loading') return <Box className="p-4 gap-3"><Text className="text-muted">Opening the clip…</Text></Box>;
  if (status.kind === 'error') return <Box className="p-4 gap-3"><Text className="text-text">{status.message}</Text></Box>;
  const { clip, resolved } = status;
  const inClip = player.clip() !== undefined;
  const pausedAtEnd = state.kind === 'paused' && !inClip && 'positionMs' in state && Math.abs(state.positionMs - clip.endMs) <= 6_000;
  return (
    <Box className="p-4 gap-3">
      <Text className="text-base font-semibold text-text">{resolved.episode.title}</Text>
      {resolved.episode.showTitle ? <Text className="text-muted">{resolved.episode.showTitle}{resolved.via === 'server' ? ' · from the server\'s record (the feed no longer lists it)' : ''}</Text> : null}
      <ClipCard
        clip={clip}
        onPlay={clip.deleted ? undefined : () => player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs })}
        onShare={clip.deleted ? undefined : () => void shareClip(Share, clip, resolved.episode.title, apiBaseUrl())}
        onDelete={!clip.deleted && listener?.listenerId === clip.author.id ? () => void api.deleteClip(clip.id).then(() => setStatus({ kind: 'ready', clip: { ...clip, deleted: true }, resolved })) : undefined}
      />
      {clip.deleted ? <Text className="text-muted">This clip was removed. The episode is still here.</Text> : null}
      <Box className="flex-row gap-3 flex-wrap items-center">
        {clip.deleted ? <Pressable className="bg-primary rounded-3xl px-5 py-2.5" accessibilityRole="button" onPress={() => { player.load(resolved.episode, 'play'); router.push('/player'); }}><Text className="text-onPrimary font-semibold">Play the episode</Text></Pressable> : null}
        {pausedAtEnd ? <Pressable className="bg-primary rounded-3xl px-5 py-2.5" accessibilityRole="button" onPress={() => player.play()}><Text className="text-onPrimary font-semibold">Keep listening</Text></Pressable> : null}
        <Pressable className="border border-separator rounded-3xl px-[18px] py-2.5" accessibilityRole="button" onPress={() => router.push('/player')}><Text className="text-text">Open player</Text></Pressable>
      </Box>
      {!listener ? <Text className="text-muted">You are not signed in — clips play anyway. Sign in to follow people and make your own.</Text> : null}
    </Box>
  );
}

